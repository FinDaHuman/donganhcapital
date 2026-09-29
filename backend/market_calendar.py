"""Exchange-session dates shared by the API and daily ingestion.

2026 source: HOSE's notice of trading holidays (including the August 31 closure):
https://staticfile.hsx.vn/Uploads/UploadDocuments/2428610/20251209%20-%20HOSE%20-%20Notice%20of%20trading%20holiday%20schedule%20for%202026%20-%20PV.pdf
Settlement confirmation: https://vsdc.vn/en/ad/198931

Add each year's announced exchange holidays before that year begins. Government
make-up working Saturdays are not trading sessions. Unknown years fail explicitly
instead of accepting synthetic holiday candles from a data provider.
"""

from datetime import date, datetime
import logging
from zoneinfo import ZoneInfo


VIETNAM = ZoneInfo('Asia/Ho_Chi_Minh')
HOLIDAYS = {
    2026: frozenset(date.fromisoformat(day) for day in (
        '2026-01-01', '2026-01-02',
        '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
        '2026-04-27', '2026-04-30', '2026-05-01',
        '2026-08-31', '2026-09-01', '2026-09-02',
    )),
}


def is_trading_day(day):
    if isinstance(day, datetime):
        if day.tzinfo is not None:
            day = day.astimezone(VIETNAM)
        day = day.date()
    if day.year not in HOLIDAYS:
        raise ValueError(f'Exchange calendar missing for {day.year}; add the official holiday schedule')
    return day.weekday() < 5 and day not in HOLIDAYS[day.year]


def filter_intraday_sessions(frame):
    """Discard non-session candles; naive provider timestamps are Vietnam time."""
    import pandas as pd

    result = frame.copy()
    timestamps = pd.to_datetime(result['time'], errors='raise')
    if timestamps.isna().any():
        raise ValueError('Intraday data contains missing timestamps')
    if timestamps.dt.tz is not None:
        timestamps = timestamps.dt.tz_convert(VIETNAM).dt.tz_localize(None)
    result['time'] = timestamps
    days = timestamps.dt.date
    allowed = {day: is_trading_day(day) for day in days.unique()}
    keep = days.map(allowed).astype(bool)
    rejected = len(result) - int(keep.sum())
    if rejected:
        logging.getLogger(__name__).warning(
            'Discarded %s intraday candles on non-trading dates: %s',
            rejected, sorted(str(day) for day, valid in allowed.items() if not valid),
        )
    return result.loc[keep].copy()
