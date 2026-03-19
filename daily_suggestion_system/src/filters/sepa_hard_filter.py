def apply_sepa_hard_filter(df, debug=False):

    cond_52w = df["distance_from_52w_high"] > -0.35
    cond_rs = df["RS_percentile_60d"] > 0.5
    cond_depth = df["base_depth_percent"] > -0.4
    cond_vol = df["volatility_compression_ratio"] < 0.95

    conditions = cond_52w & cond_rs & cond_depth & cond_vol

    filtered_df = df[conditions].copy()

    # ===============================
    # DEBUG: show violation
    # ===============================

    if debug and len(filtered_df) == 0 and len(df) > 0:

        print("\n===== SEPA FILTER VIOLATION =====")

        debug_df = df.copy()

        debug_df["fail_52w"] = ~cond_52w
        debug_df["fail_RS"] = ~cond_rs
        debug_df["fail_base_depth"] = ~cond_depth
        debug_df["fail_volatility"] = ~cond_vol

        print(
            debug_df[
                [
                    "stock_id",
                    "distance_from_52w_high",
                    "RS_percentile_60d",
                    "base_depth_percent",
                    "volatility_compression_ratio",
                    "fail_52w",
                    "fail_RS",
                    "fail_base_depth",
                    "fail_volatility"
                ]
            ].to_string(index=False)
        )

    return filtered_df