# ============================================
# BREAKOUT MODEL TRAINER
# ============================================

import numpy as np
import lightgbm as lgb
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import roc_auc_score
import joblib
import warnings
warnings.filterwarnings("ignore")


class BreakoutModelTrainer:

    def __init__(self, n_splits=3):

        self.n_splits = n_splits

        # params giống hệt code CV gốc (trừ scale_pos_weight)
        self.params = dict(

            objective="binary",

            n_estimators=2000,
            learning_rate=0.02,

            num_leaves=24,
            max_depth=-1,

            min_child_samples=15,
            min_split_gain=0.01,

            subsample=0.8,
            colsample_bytree=0.8,

            reg_alpha=0.5,
            reg_lambda=1.0,

            random_state=42,
        )


    # ============================================
    # CROSS VALIDATION
    # ============================================

    def cross_validate(self, X_train, y_train):

        X_train = X_train.reset_index(drop=True)
        y_train = y_train.reset_index(drop=True)

        # compute class weight
        pos_rate = y_train.mean()
        scale_pos_weight = (1 - pos_rate) / pos_rate

        params = self.params.copy()
        params["scale_pos_weight"] = scale_pos_weight

        tscv = TimeSeriesSplit(n_splits=self.n_splits)

        auc_scores = []

        for fold, (train_idx, val_idx) in enumerate(tscv.split(X_train), 1):

            X_tr, X_val = X_train.iloc[train_idx], X_train.iloc[val_idx]
            y_tr, y_val = y_train.iloc[train_idx], y_train.iloc[val_idx]

            model = lgb.LGBMClassifier(**params)

            model.fit(
                X_tr,
                y_tr,
                eval_set=[(X_val, y_val)],
                eval_metric="auc",
                callbacks=[
                    lgb.early_stopping(50),
                    lgb.log_evaluation(0)
                ]
            )

            val_pred = model.predict_proba(X_val)[:, 1]

            auc = roc_auc_score(y_val, val_pred)
            auc_scores.append(auc)

            print(f"Fold {fold} AUC: {auc:.4f}")

        print("\nMean CV AUC:", round(np.mean(auc_scores), 4))
        print("Std CV AUC :", round(np.std(auc_scores), 4))

        return auc_scores


    # ============================================
    # TRAIN FINAL MODEL
    # ============================================

    def train(self, X_train, y_train):

        pos_rate = y_train.mean()
        scale_pos_weight = (1 - pos_rate) / pos_rate

        params = self.params.copy()
        params["scale_pos_weight"] = scale_pos_weight

        model = lgb.LGBMClassifier(**params)

        model.fit(
            X_train,
            y_train,
            eval_set=[(X_train, y_train)],
            eval_metric="auc",
            callbacks=[lgb.log_evaluation(0)]
        )

        return model


    # ============================================
    # SAVE MODEL
    # ============================================

    def save_model(self, model, path):

        joblib.dump(model, path)
        print(f"Model saved to: {path}")


    # ============================================
    # LOAD MODEL
    # ============================================

    def load_model(self, path):

        model = joblib.load(path)
        print(f"Model loaded from: {path}")

        return model