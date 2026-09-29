"""Offline checks for backend/market_data.py, fed with payloads captured from KBS and VCI."""
from datetime import date
from pathlib import Path
import sys
import unittest
from unittest.mock import MagicMock, patch

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
import market_data


def respond(payload):
    response = MagicMock()
    response.json.return_value = payload
    return patch.object(market_data.requests, 'request', return_value=response)


# Captured 2026-09-28. The 25th arrives twice: a live snapshot with string
# values, then the settled bar. The database's earlier rows match the settled one.
VNINDEX_KBS = {'symbol': 'VNINDEX', 'data_day': [
    {'t': '2026-09-25 07:00', 'o': '1773.36', 'h': '1796.29', 'l': '1771.57', 'c': '1785.11', 'v': '624262395.0'},
    {'t': '2026-09-25 07:00', 'o': 1773.36, 'h': 1796.29, 'l': 1771.57, 'c': 1785.11, 'v': 466982821},
    {'t': '2026-09-24 07:00', 'o': 1801.07, 'h': 1801.65, 'l': 1772.24, 'c': 1775.09, 'v': 516640105},
]}
ACB_KBS = {'symbol': 'ACB', 'data_day': [
    {'t': '2026-09-25 07:00', 'o': 21400, 'h': 21600, 'l': 21250, 'c': 21400, 'v': 6080700},
    {'t': '2026-09-25 07:00', 'o': 21400, 'h': 21600, 'l': 21250, 'c': 21400, 'v': 6080700, 'va': 130014300000},
    {'t': '2026-09-24 07:00', 'o': 21900, 'h': 21900, 'l': 21300, 'c': 21400, 'v': 8843500, 'va': 190341020000},
]}


class HistoryTests(unittest.TestCase):
    def test_stock_prices_use_the_stock_ohlc_scale(self):
        with respond(ACB_KBS) as request:
            frame = market_data.history('acb', '2026-09-24', '2026-09-25')
        self.assertEqual(request.call_args.args[1],
                         f'{market_data.KBS_URL}/stocks/ACB/data_day')
        self.assertEqual(request.call_args.kwargs['params'], {'sdate': '24-09-2026', 'edate': '25-09-2026'})
        self.assertEqual(list(frame.columns), market_data.COLUMNS)
        self.assertEqual(frame.time.tolist(), [pd.Timestamp('2026-09-24'), pd.Timestamp('2026-09-25')])
        self.assertEqual(frame.close.tolist(), [21.4, 21.4])
        self.assertEqual(frame.open.tolist(), [21.9, 21.4])
        self.assertEqual(frame.volume.tolist(), [8843500, 6080700])

    def test_index_keeps_points_and_the_settled_duplicate(self):
        with respond(VNINDEX_KBS) as request:
            frame = market_data.history('VNINDEX', '2026-09-24', '2026-09-25')
        self.assertIn('/index/VNINDEX/data_day', request.call_args.args[1])
        self.assertEqual(frame.close.tolist(), [1775.09, 1785.11])
        self.assertEqual(frame.volume.tolist(), [516640105, 466982821])

    def test_no_rows_raises_like_vnstock(self):
        for payload in ({'symbol': 'AAA', 'data_day': []}, {'symbol': 'AAA'}, None):
            with self.subTest(payload=payload), respond(payload):
                with self.assertRaises(ValueError):
                    market_data.history('AAA', '2026-09-24', '2026-09-25')

    def test_futures_use_the_krx_contract_and_minute_bars(self):
        bars = {'data_1P': [{'t': '2026-09-24 14:45', 'o': 1937.5, 'h': 1937.5, 'l': 1937.5, 'c': 1937.5, 'v': 4326},
                            {'t': '2026-09-24 14:29', 'o': 1936.4, 'h': 1938, 'l': 1936, 'c': 1936.3, 'v': 1233}]}
        with respond(bars) as request, patch.object(market_data, 'vn30_contract_code', return_value='41I1GA000'):
            frame = market_data.history('VN30F1M', '2026-09-24', '2026-09-24', interval='1m')
        self.assertIn('/stocks/41I1GA000/data_1P', request.call_args.args[1])
        self.assertEqual(frame.time.tolist(), [pd.Timestamp('2026-09-24 14:29'), pd.Timestamp('2026-09-24 14:45')])
        self.assertEqual(frame.close.tolist(), [1936.3, 1937.5])

    def test_vci_epoch_seconds_become_vietnam_time(self):
        # 1790322300 = 2026-09-25 07:45 UTC = 14:45 in Vietnam.
        series = [{'t': ['1790231520', '1790322300'], 'o': [1943, 1942], 'h': [1943, 1942],
                   'l': [1943, 1942], 'c': [1943, 1942], 'v': [461, 5757]}]
        with respond(series) as request:
            frame = market_data.history('VN30F1M', '2026-09-24', '2026-09-25', interval='1m', source='VCI')
        self.assertEqual(request.call_args.kwargs['json']['symbols'], ['VN30F1M'])
        self.assertEqual(frame.time.iloc[-1], pd.Timestamp('2026-09-25 14:45'))
        self.assertEqual(frame.close.tolist(), [1943, 1942])

    def test_vci_daily_bars_land_on_the_trading_date(self):
        # 1790208000 = 2026-09-24 00:00 UTC.
        series = [{'t': [1790208000], 'o': [1798.06], 'h': [1801.65], 'l': [1772.24],
                   'c': [1775.09], 'v': [654700369]}]
        with respond(series):
            frame = market_data.history('VNINDEX', '2026-09-24', '2026-09-24', source='VCI')
        self.assertEqual(frame.time.tolist(), [pd.Timestamp('2026-09-24')])
        self.assertEqual(frame.volume.tolist(), [654700369])


class ContractCodeTests(unittest.TestCase):
    def test_front_month_rolls_after_the_third_thursday(self):
        # September 2026 expires on Thursday the 17th.
        self.assertEqual(market_data.vn30_contract_code('VN30F1M', date(2026, 9, 17)), '41I1G9000')
        self.assertEqual(market_data.vn30_contract_code('VN30F1M', date(2026, 9, 18)), '41I1GA000')
        self.assertEqual(market_data.vn30_contract_code('VN30F1M', date(2026, 9, 28)), '41I1GA000')
        self.assertEqual(market_data.vn30_contract_code('VN30F2M', date(2026, 9, 28)), '41I1GB000')

    def test_year_wraps_into_january(self):
        # December 2026 expires on the 17th; the next contract is January 2027.
        self.assertEqual(market_data.vn30_contract_code('VN30F1M', date(2026, 12, 18)), '41I1H1000')
        self.assertEqual(market_data.vn30_contract_code('VN30F1M', date(2019, 5, 2)), '41I195000')


class PriceBoardTests(unittest.TestCase):
    def test_vci_rows(self):
        payload = [{'listingInfo': {'symbol': 'ACB'},
                    'matchPrice': {'matchPrice': 21400, 'referencePrice': 21400, 'accumulatedVolume': 6080700}}]
        with respond(payload):
            self.assertEqual(market_data.price_board(['ACB'], 'VCI'), [('ACB', 21400, 21400, 6080700)])

    def test_kbs_rows(self):
        with respond([{'SB': 'ACB', 'CP': 21400, 'RE': 21400, 'TT': 6080700}]) as request:
            self.assertEqual(market_data.price_board(['ACB', 'FPT'], 'KBS'), [('ACB', 21400, 21400, 6080700)])
        self.assertEqual(request.call_args.kwargs['json'], {'code': 'ACB,FPT'})


if __name__ == '__main__':
    unittest.main()
