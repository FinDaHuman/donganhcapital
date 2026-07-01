"""Real-time equity quote adapter (vnstock price board).

Deliberately isolated like ``backend/db/mongo.py`` / ``backend/db/r2.py``: any
failure (network, both providers down, unexpected schema) returns an EMPTY dict
so every caller transparently falls back to the daily-close values it already
uses. This module NEVER raises.

Normalization
    vnstock's price board returns raw đồng (e.g. ``72900``) while ``stock_ohlc``
    stores thousands (``72.9``). Prices here are divided by ``PRICE_SCALE`` so
    callers receive values directly comparable to ``entry_price`` /
    ``stock_ohlc.close`` — no per-caller scaling.

Sources
    VCI first (reliable from Render, MultiIndex schema), KBS fallback (flat
    schema, but the provider is intermittently unreachable from Render — the
    VN30F1M circuit breaker in ``main.py`` exists for exactly this). Both are
    flattened to one internal schema.

Callers MUST run ``get_live_quotes`` via ``asyncio.to_thread`` — the underlying
vnstock HTTP calls are blocking.
"""

import logging
import re
import time

logger = logging.getLogger(__name__)

# stock_ohlc stores prices in thousands of đồng; the price board returns raw đồng.
PRICE_SCALE = 1000.0

_TICKER_RE = re.compile(r"^[A-Z0-9]{1,10}$")


def _clean_symbols(symbols) -> list[str]:
    """Uppercase, validate, and de-duplicate while preserving order."""
    out: list[str] = []
    seen: set[str] = set()
    for s in symbols or []:
        if not s:
            continue
        s = str(s).upper().strip()
        if _TICKER_RE.match(s) and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _f(value):
    """Best-effort float; None for missing/NaN/garbage."""
    try:
        if value is None:
            return None
        value = float(value)
        if value != value:  # NaN
            return None
        return value
    except (TypeError, ValueError):
        return None


def _norm(price, ref, volume) -> dict | None:
    """Normalize one raw row to the shared, stock_ohlc-scaled schema."""
    price = _f(price)
    ref = _f(ref)
    vol = _f(volume)

    # Pre-open / no match yet: fall back to the reference (≈ prior close).
    if not price or price <= 0:
        price = ref
    if not price or price <= 0:
        return None

    price /= PRICE_SCALE
    ref_n = ref / PRICE_SCALE if ref and ref > 0 else None
    change_pct = ((price - ref_n) / ref_n * 100.0) if ref_n else None

    return {
        "price": round(price, 3),
        "ref_price": round(ref_n, 3) if ref_n is not None else None,
        "change_pct": round(change_pct, 4) if change_pct is not None else None,
        "volume": int(vol) if vol and vol > 0 else None,
        "ts": int(time.time() * 1000),
    }


def _fetch_vci(symbols: list[str]) -> dict:
    """VCI price board -> normalized map. MultiIndex columns."""
    from vnstock import Trading

    pb = Trading(source="vci").price_board(symbols)
    if pb is None or len(pb) == 0:
        return {}
    out: dict[str, dict] = {}
    for _, r in pb.iterrows():
        try:
            sym = r[("listing", "symbol")]
            rec = _norm(
                r[("match", "match_price")],
                r[("match", "reference_price")],
                r[("match", "accumulated_volume")],
            )
            if sym and rec:
                out[str(sym).upper().strip()] = rec
        except Exception:
            continue
    return out


def _fetch_kbs(symbols: list[str]) -> dict:
    """KBS price board -> normalized map. Flat columns."""
    from vnstock import Trading

    pb = Trading(source="kbs").price_board(symbols)
    if pb is None or len(pb) == 0:
        return {}
    out: dict[str, dict] = {}
    for _, r in pb.iterrows():
        try:
            sym = r.get("symbol")
            rec = _norm(
                r.get("close_price"),
                r.get("reference_price"),
                r.get("volume_accumulated"),
            )
            if sym and rec:
                out[str(sym).upper().strip()] = rec
        except Exception:
            continue
    return out


def get_live_quotes(symbols) -> dict[str, dict]:
    """Return ``{symbol: {price, ref_price, change_pct, volume, ts}}`` normalized
    to the ``stock_ohlc`` scale. Empty dict on any failure (never raises)."""
    syms = _clean_symbols(symbols)
    if not syms:
        return {}
    for name, fetch in (("vci", _fetch_vci), ("kbs", _fetch_kbs)):
        try:
            result = fetch(syms)
            if result:
                return result
            logger.warning("Live quotes: %s returned no rows for %d symbols", name, len(syms))
        except Exception as e:
            logger.warning("Live quotes: %s fetch failed: %s", name, e)
    return {}
