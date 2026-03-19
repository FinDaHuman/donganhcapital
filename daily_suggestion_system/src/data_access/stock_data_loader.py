import pandas as pd

def load_stock_data(engine, start_date=None, end_date=None):

    query = """
    SELECT "Ngay", stock_id, open, high, low, close, volume
    FROM stock_ohlc
    WHERE 1=1
    """

    params = {}

    if start_date is not None:
        query += ' AND "Ngay" >= %(start_date)s'
        params["start_date"] = start_date

    if end_date is not None:
        query += ' AND "Ngay" <= %(end_date)s'
        params["end_date"] = end_date

    query += ' ORDER BY stock_id, "Ngay"'

    df = pd.read_sql(query, engine, params=params)

    df["Ngay"] = pd.to_datetime(df["Ngay"], errors="coerce")

    return df