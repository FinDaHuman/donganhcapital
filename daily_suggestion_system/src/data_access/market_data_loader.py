import pandas as pd

def load_market_data(engine, start_date=None, end_date=None):

    query = """
    SELECT "Ngay", index_open, index_high, index_low, index_close, index_volume
    FROM vnindex_ohlc
    WHERE 1=1
    """

    params = {}

    if start_date is not None:
        query += ' AND "Ngay" >= %(start_date)s'
        params["start_date"] = start_date

    if end_date is not None:
        query += ' AND "Ngay" <= %(end_date)s'
        params["end_date"] = end_date

    query += ' ORDER BY "Ngay"'

    df = pd.read_sql(query, engine, params=params)

    df["Ngay"] = pd.to_datetime(df["Ngay"], errors="coerce")

    return df