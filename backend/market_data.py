"""Price data straight from the brokers' public endpoints (KBS and VCI).

Replaces vnstock, which PyPI quarantined together with its `vnai` dependency in
September 2026. These are the endpoints vnstock 4.0.2 called, and `history()`
returns the shape its `Quote.history()` did: columns time, open, high, low,
close, volume; stock prices in thousands of đồng (the `stock_ohlc` scale),
index and futures prices in points. Shared by the API and the daily pipeline.

Quirks, checked against the database on 2026-09-28:
- KBS can send two rows for the latest session, newest first. The later row of
  the pair is the settled bar.
- KBS back-adjusts past stock prices after dividends and splits. The pipeline
  only rewrites recent days, so stored history stays as traded.
- VNINDEX differs by source: VCI's volume includes put-through trades and its
  low occasionally differs. KBS matched the stored history, so it is primary.
- No rows raises ValueError, as vnstock did; `stock_ohlc_update` relies on it.

One attempt per call. vnstock never retried network errors either, so callers
already own their recovery (retry loops, rolling windows, the late cron).
"""

import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import requests


VIETNAM = ZoneInfo('Asia/Ho_Chi_Minh')
TIMEOUT = 30
KBS_URL = 'https://kbbuddywts.kbsec.com.vn/iis-server/investment'
VCI_URL = 'https://trading.vietcap.com.vn/api'
INDICES = frozenset({'VNINDEX', 'HNXINDEX', 'UPCOMINDEX', 'VN30', 'HNX30', 'VN100'})
KBS_INTERVALS = {'1d': 'day', '1m': '1P'}
VCI_INTERVALS = {'1d': 'ONE_DAY', '1m': 'ONE_MINUTE'}
COLUMNS = ['time', 'open', 'high', 'low', 'close', 'volume']
HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}


def _request(method, url, source, **kwargs):
    headers = dict(HEADERS)
    if source == 'VCI':
        device = f'{random.getrandbits(64):016x}'
        headers.update({'Referer': 'https://trading.vietcap.com.vn/',
                        'Origin': 'https://trading.vietcap.com.vn/',
                        'Device-Id': device, 'Cookie': f'device_id={device}'})
    response = requests.request(method, url, headers=headers, timeout=TIMEOUT, **kwargs)
    response.raise_for_status()
    return response.json()


def vn30_contract_code(symbol, day=None):
    """Rolling VN30 futures name -> KRX contract code (VN30F1M on 2026-09-28 -> 41I1GA000).

    Contracts expire on the third Thursday of the month; after that, F1M is the
    next month's contract. Code: 41 + I1 (VN30) + year + month + 000.
    """
    months_ahead = {'VN30F1M': 0, 'VN30F2M': 1}[symbol]
    day = day or datetime.now(VIETNAM).date()
    first = day.replace(day=1)
    expiry = first + timedelta(days=(3 - first.weekday()) % 7 + 14)
    year, month = divmod(day.year * 12 + day.month - 1 + months_ahead + (day > expiry), 12)
    cycle = (year - 2010) % 30
    year_code = str(cycle) if cycle < 10 else 'ABCDEFGHJKLMNPQRSTVW'[cycle - 10]
    return f'41I1{year_code}{"123456789ABC"[month]}000'


def _kbs_history(symbol, start, end, interval):
    code = vn30_contract_code(symbol) if symbol.startswith('VN30F') else symbol
    path = 'index' if symbol in INDICES else 'stocks'
    key = f'data_{KBS_INTERVALS[interval]}'
    data = _request('GET', f'{KBS_URL}/{path}/{code}/{key}', 'KBS', params={
        'sdate': start.strftime('%d-%m-%Y'), 'edate': end.strftime('%d-%m-%Y')})
    frame = pd.DataFrame((data or {}).get(key) or [], columns=list('tohlcv'))
    frame['t'] = pd.to_datetime(frame['t'])
    return frame


def _vci_history(symbol, start, end, interval):
    sessions = len(pd.bdate_range(start, end))
    data = _request('POST', f'{VCI_URL}/chart/OHLCChart/gap-chart', 'VCI', json={
        'timeFrame': VCI_INTERVALS[interval],
        'symbols': [symbol],
        'to': int((end + timedelta(days=1)).tz_localize(VIETNAM).timestamp()),
        'countBack': sessions * (255 if interval == '1m' else 1) + 1,
    })
    if isinstance(data, dict):
        data = data.get('data')
    series = data[0] if data else {}
    frame = pd.DataFrame({column: series.get(column) or [] for column in 'tohlcv'})
    frame['t'] = (pd.to_datetime(pd.to_numeric(frame['t']), unit='s', utc=True)
                  .dt.tz_convert(VIETNAM).dt.tz_localize(None))
    return frame


def history(symbol, start, end, interval='1d', source='KBS'):
    """OHLCV bars for ``start``..``end`` inclusive (YYYY-MM-DD), oldest first."""
    symbol = symbol.upper()
    start, end = pd.Timestamp(start).normalize(), pd.Timestamp(end).normalize()
    fetch = {'KBS': _kbs_history, 'VCI': _vci_history}[source]
    frame = fetch(symbol, start, end, interval).rename(columns=dict(zip('tohlcv', COLUMNS)))

    if interval == '1d':
        frame['time'] = frame['time'].dt.normalize()
    frame = frame[(frame['time'] >= start) & (frame['time'] < end + timedelta(days=1))]
    if frame.empty:
        raise ValueError(f'{source} returned no {interval} data for {symbol} {start:%Y-%m-%d} -> {end:%Y-%m-%d}')

    frame = frame.drop_duplicates('time', keep='last').copy()
    for column in COLUMNS[1:]:
        frame[column] = pd.to_numeric(frame[column])
    if symbol not in INDICES and not symbol.startswith('VN30F'):
        frame[['open', 'high', 'low', 'close']] /= 1000
    frame[['open', 'high', 'low', 'close']] = frame[['open', 'high', 'low', 'close']].round(2)
    frame['volume'] = frame['volume'].astype('int64')
    return frame.sort_values('time').reset_index(drop=True)[COLUMNS]


def price_board(symbols, source='VCI'):
    """Current board as (symbol, match_price, reference_price, accumulated_volume) rows, raw đồng."""
    symbols = list(symbols)
    if source == 'VCI':
        data = _request('POST', f'{VCI_URL}/price/symbols/getList', 'VCI', json={'symbols': symbols})
        return [((row.get('listingInfo') or {}).get('symbol'), match.get('matchPrice'),
                 match.get('referencePrice'), match.get('accumulatedVolume'))
                for row in data or [] for match in [row.get('matchPrice') or {}]]
    if source == 'KBS':
        data = _request('POST', f'{KBS_URL}/stock/iss', 'KBS', json={'code': ','.join(symbols)})
        return [(row.get('SB'), row.get('CP'), row.get('RE'), row.get('TT')) for row in data or []]
    raise ValueError(f'Unknown price board source: {source}')
