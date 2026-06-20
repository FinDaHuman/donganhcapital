"""
LTR model evaluation — run after ltr_training.py produces ltr_model.pkl.

Primary go/no-go gate (business metric — tradeable performance):
  Simulate entering top-5 picks at open[T+1], exiting at close[T+1].
  Deduct 0.40% round-trip cost. Gate: avg realized return > 0 AND win rate > 40%.
  A model can pass all ranking metrics and still fail this gate because >6%
  close-to-close moves on HOSE often gap to near the 7% circuit breaker at the
  open, leaving no entry room for subscribers.

Supporting gates:
  Precision@5, Hit Rate@5, Coverage

Informational only (not gates):
  NDCG@5, AUC — statistically valid signals but not business metrics.

Data split:
  Train : 2015–2022  (model was fit on this)
  Val   : 2023       (early stopping during training — NOT re-evaluated here)
  Test  : 2024+      (true holdout — matches SPLIT_DATE in ltr_training.py)

Usage:
    cd daily_suggestion_system/src/training
    python ../evaluation/ltr_eval.py
"""
import sys
import gc
import joblib
import logging
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import ndcg_score, roc_auc_score
from dotenv import load_dotenv

SRC_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SRC_DIR))

for candidate in [
    SRC_DIR.parents[0] / ".env",
    SRC_DIR.parents[1] / "backend" / ".env",
]:
    if candidate.exists():
        load_dotenv(candidate)
        break

from data_access.db_connection import get_engine
from data_access.stock_data_loader import load_stock_data
from data_access.market_data_loader import load_market_data
from features.ltr_features import build_ltr_features, LTR_FEATURE_COLS
from labels.ltr_label import build_ltr_labels

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

TRAIN_START    = "2015-01-01"
SPLIT_DATE     = pd.Timestamp("2024-01-01")   # must match ltr_training.py
TRAIN_END      = "2026-12-31"
MODEL_PATH     = Path(__file__).resolve().parents[2] / "model" / "ltr_model.pkl"

TRADE_COST     = 0.004   # 0.40% round-trip (realistic for retail HOSE)

# --- Primary gate (tradeable performance) ---
GO_REALIZED_RETURN = 0.0    # avg net realized return per trade > 0%
GO_WIN_RATE        = 0.40   # > 40% of simulated trades profitable net of costs

# --- Supporting gates ---
GO_PRECISION_LIFT  = 1.5    # Precision@5 must beat base_rate × this
GO_HIT_RATE_AT_5   = 0.25   # ≥1 correct in top-5 on ≥25% of days
GO_COVERAGE        = 0.30   # ≥30% of test days have any positive label


def _precision_at_k(scores: np.ndarray, labels: np.ndarray, k: int) -> float:
    top_k = np.argsort(scores)[::-1][:k]
    return labels[top_k].mean()


def _hit_at_k(scores: np.ndarray, labels: np.ndarray, k: int) -> int:
    top_k = np.argsort(scores)[::-1][:k]
    return int(labels[top_k].sum() > 0)


def evaluate(test_df: pd.DataFrame, y_pred: np.ndarray, test_groups: np.ndarray):
    """
    Per-day ranking metrics aggregated over the test set.
    Days with zero positives are skipped for NDCG (undefined) but counted in coverage.
    """
    assert test_groups.sum() == len(test_df), "groups/rows mismatch"

    results = {k: [] for k in ["ndcg5", "p1", "p3", "p5", "p10", "hit5", "random_ndcg5"]}
    coverage_days = 0
    monthly_p5: list[dict] = []

    rng = np.random.default_rng(seed=0)
    idx = 0

    for day_size in test_groups:
        day_labels = test_df["ltr_label"].iloc[idx: idx + day_size].values.astype(int)
        day_scores = y_pred[idx: idx + day_size]
        day_date   = test_df["Ngay"].iloc[idx]

        if day_labels.sum() == 0:
            idx += day_size
            continue

        coverage_days += 1

        ndcg5 = ndcg_score([day_labels], [day_scores], k=5)
        results["ndcg5"].append(ndcg5)
        results["random_ndcg5"].append(ndcg_score([day_labels], [rng.random(day_size)], k=5))

        for k, key in [(1, "p1"), (3, "p3"), (5, "p5"), (10, "p10")]:
            results[key].append(_precision_at_k(day_scores, day_labels, k))

        results["hit5"].append(_hit_at_k(day_scores, day_labels, 5))
        monthly_p5.append({"month": day_date.to_period("M"), "p5": results["p5"][-1]})

        idx += day_size

    total_days = len(test_groups)
    coverage_pct = coverage_days / total_days if total_days > 0 else 0

    def _mean(lst):
        return float(np.mean(lst)) if lst else 0.0

    summary = {
        "ndcg_at_5":        _mean(results["ndcg5"]),
        "random_ndcg_at_5": _mean(results["random_ndcg5"]),
        "precision_at_1":   _mean(results["p1"]),
        "precision_at_3":   _mean(results["p3"]),
        "precision_at_5":   _mean(results["p5"]),
        "precision_at_10":  _mean(results["p10"]),
        "hit_rate_at_5":    _mean(results["hit5"]),
        "coverage":         coverage_pct,
        "coverage_days":    coverage_days,
        "total_test_days":  total_days,
        "base_rate":        float(test_df["ltr_label"].mean()),
    }

    monthly_df = (
        pd.DataFrame(monthly_p5).groupby("month")["p5"].mean()
        if monthly_p5 else pd.Series(dtype=float)
    )

    return summary, monthly_df


def realized_return_at_open(
    test_df: pd.DataFrame,
    y_pred: np.ndarray,
    test_groups: np.ndarray,
    stock_df_full: pd.DataFrame,
) -> dict:
    """
    PRIMARY BUSINESS GATE.

    Simulate entering top-5 ranked stocks at open[T+1], exiting at close[T+1].
    Net of TRADE_COST round-trip.

    Why this matters: a >6% close-to-close move on HOSE typically means the stock
    gapped up near the 7% daily limit at the open. A subscriber cannot buy at
    close[T]. If avg realized net return <= 0, the signal is untradeable regardless
    of how good NDCG@5 looks.
    """
    sdf = stock_df_full.sort_values(["stock_id", "Ngay"]).copy()
    sdf["next_open"]     = sdf.groupby("stock_id")["open"].shift(-1)    # entry day
    sdf["next_close_3d"] = sdf.groupby("stock_id")["close"].shift(-3)   # exit after 3 trading days
    lookup = sdf.set_index(["Ngay", "stock_id"])[["close", "next_open", "next_close_3d"]]

    trades = []
    idx = 0
    for day_size in test_groups:
        day_df     = test_df.iloc[idx: idx + day_size]
        day_scores = y_pred[idx: idx + day_size]
        top5_idx   = np.argsort(day_scores)[::-1][:5]

        for i in top5_idx:
            row = day_df.iloc[i]
            key = (row["Ngay"], row["stock_id"])
            if key not in lookup.index:
                continue
            entry = lookup.loc[key]
            if pd.isna(entry["next_open"]) or pd.isna(entry["next_close_3d"]):
                continue
            gap_pct      = float(entry["next_open"] / entry["close"] - 1)
            hold_ret     = float(entry["next_close_3d"] / entry["next_open"] - 1)
            realized_net = hold_ret - TRADE_COST
            trades.append({
                "date":         row["Ngay"],
                "stock_id":     row["stock_id"],
                "label":        int(row["ltr_label"]),
                "gap_pct":      gap_pct * 100,
                "hold_ret":     hold_ret * 100,
                "realized_net": realized_net * 100,
            })

        idx += day_size

    if not trades:
        log.warning("No trades computed — check that stock_df_full covers the test period.")
        return {"avg_realized_return": float("nan"), "win_rate": float("nan"), "n_trades": 0}

    t_df      = pd.DataFrame(trades)
    avg_ret   = float(t_df["realized_net"].mean())
    win_rate  = float((t_df["realized_net"] > 0).mean())
    n_trades  = len(t_df)

    positives = t_df[t_df["label"] == 1]
    gap_near_limit = (
        float((positives["gap_pct"].abs() > 5).mean() * 100)
        if len(positives) > 0 else float("nan")
    )

    log.info(
        f"\nSimulated trades (enter open[T+1] → exit close[T+3], hold 3 days, cost={TRADE_COST*100:.1f}%):\n"
        f"  Total trades (top-5/day)        : {n_trades}\n"
        f"  Avg realized return (net)       : {avg_ret:.3f}%\n"
        f"  Win rate (net of cost)          : {win_rate*100:.1f}%\n"
        f"  Avg gap at open (all picks)     : {t_df['gap_pct'].mean():.2f}%\n"
        f"  True positives (n={len(positives)}):\n"
        f"    Avg gap at open               : {positives['gap_pct'].mean():.2f}%\n"
        f"    % with gap > 5%               : {gap_near_limit:.1f}%  "
        f"(near HOSE 7% limit — subscriber still enters but momentum may continue)\n"
    )

    return {"avg_realized_return": avg_ret, "win_rate": win_rate, "n_trades": n_trades}


def print_go_nogo(summary: dict, realized: dict):
    base = summary["base_rate"]
    all_pass = True

    print("\n" + "=" * 65)
    print("  GO / NO-GO EVALUATION")
    print("=" * 65)

    # --- Primary gate ---
    print("\n  PRIMARY GATE  (tradeable performance)")
    print("  " + "-" * 60)
    primary_checks = [
        ("Avg realized return",  realized["avg_realized_return"], GO_REALIZED_RETURN * 100,
         f"enter open[T+1], exit close[T+3], hold 3 days, -{TRADE_COST*100:.1f}% cost"),
        ("Win rate (net cost)",  realized["win_rate"] * 100,      GO_WIN_RATE * 100,
         "% of top-5 picks profitable"),
    ]
    primary_pass = True
    for name, value, threshold, note in primary_checks:
        if np.isnan(value):
            status = "⚠️  N/A"
            primary_pass = False
        else:
            passed = value > threshold
            primary_pass = primary_pass and passed
            status = "✅ PASS" if passed else "❌ FAIL"
        val_str = f"{value:.2f}%" if not np.isnan(value) else "N/A"
        print(f"  {name:<30} {val_str:>8}  (> {threshold:.1f}%)  {status}  {note}")
    all_pass = all_pass and primary_pass

    # --- Supporting gates ---
    print(f"\n  SUPPORTING GATES")
    print("  " + "-" * 60)
    supporting_checks = [
        ("Precision@5",   summary["precision_at_5"],   base * GO_PRECISION_LIFT,
         f"base_rate({base:.3f}) × {GO_PRECISION_LIFT}"),
        ("Hit Rate@5",    summary["hit_rate_at_5"],     GO_HIT_RATE_AT_5,
         "≥1 correct pick in top-5"),
        ("Coverage",      summary["coverage"],          GO_COVERAGE,
         "days with ≥1 positive label"),
    ]
    for name, value, threshold, note in supporting_checks:
        passed = value > threshold
        all_pass = all_pass and passed
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {name:<30} {value:.4f}   (> {threshold:.4f})  {status}  {note}")

    # --- Informational ---
    print(f"\n  INFORMATIONAL (not gates)")
    print("  " + "-" * 60)
    print(f"  NDCG@5                         {summary['ndcg_at_5']:.4f}   (random: {summary['random_ndcg_at_5']:.4f})")
    print(f"  Precision@K: "
          + "  ".join(f"P@{k}={summary[f'precision_at_{k}']:.4f}"
                      for k in [1, 3, 5, 10]))
    print(f"  Base rate (>6% next day)       {base:.4f}  ({base*100:.2f}%)")
    print(f"  Coverage days                  {summary['coverage_days']} / {summary['total_test_days']}")
    print(f"  Simulated trades               {realized.get('n_trades', 'N/A')}")
    print("=" * 65)

    if all_pass:
        verdict = "→ PROCEED to Phase 2 integration."
    elif not primary_pass:
        verdict = ("→ STOP. Primary gate failed.\n"
                   "  Signal ranks well statistically but is untradeable at open.\n"
                   "  Options: (a) shift to 3-day forward label, "
                   "(b) focus HNX/UPCOM stocks, (c) add features for earlier detection.")
    else:
        verdict = ("→ STOP. Supporting gate(s) failed.\n"
                   "  Rework features or revisit the label threshold before integrating.")

    print(f"\n  {verdict}\n")


def main():
    log.info(f"Loading model from {MODEL_PATH} …")
    if not MODEL_PATH.exists():
        log.error("Model not found — run ltr_training.py first.")
        sys.exit(1)
    clf = joblib.load(MODEL_PATH)

    engine = get_engine()
    log.info("Loading data for evaluation …")
    stock_df  = load_stock_data(engine,  start_date=TRAIN_START, end_date=TRAIN_END)
    market_df = load_market_data(engine, start_date=TRAIN_START, end_date=TRAIN_END)

    log.info("Building features and labels …")
    feature_df = build_ltr_features(stock_df, market_df)
    labeled_df = build_ltr_labels(feature_df)
    del feature_df
    gc.collect()

    labeled_df = (
        labeled_df
        .dropna(subset=LTR_FEATURE_COLS + ["ltr_label"])
        .assign(ltr_label=lambda d: d["ltr_label"].astype(int))
        .sort_values(["Ngay", "stock_id"])
        .reset_index(drop=True)
    )

    test_df = labeled_df[labeled_df["Ngay"] >= SPLIT_DATE].reset_index(drop=True)
    log.info(f"Test set: {len(test_df):,} rows over {test_df['Ngay'].nunique()} days (2024+)")

    test_groups = test_df.groupby("Ngay", sort=True).size().values
    assert test_groups.sum() == len(test_df)

    log.info("Scoring test set …")
    X_test = test_df[LTR_FEATURE_COLS].astype("float32")
    y_pred = clf.predict_proba(X_test)[:, 1]   # P(>6% next day)

    auc = roc_auc_score(test_df["ltr_label"].values, y_pred)
    log.info(f"  AUC on test set: {auc:.4f}  (informational)")

    log.info("Computing ranking metrics …")
    summary, monthly_df = evaluate(test_df, y_pred, test_groups)

    print("\nPrecision@K:")
    for k in [1, 3, 5, 10]:
        print(f"  P@{k:<3}= {summary[f'precision_at_{k}']:.4f}")

    print("\nMonthly Precision@5:")
    print(monthly_df.to_string())

    # Primary gate: simulate actual trades
    realized = realized_return_at_open(test_df, y_pred, test_groups, stock_df)

    print_go_nogo(summary, realized)


if __name__ == "__main__":
    main()
