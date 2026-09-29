"""A ticker that trades again after a long silence keeps its first new bar."""
import importlib.util
from pathlib import Path
import sys
import tempfile
from types import ModuleType
import unittest
from unittest.mock import MagicMock, patch

import pandas as pd

SRC = Path(__file__).resolve().parents[1] / 'src'


def load_updater():
    db = ModuleType('data_access.db_connection')
    db.get_engine = MagicMock()
    spec = importlib.util.spec_from_file_location('stock_ohlc_update', SRC / 'data_update' / 'stock_ohlc_update.py')
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {'data_access': ModuleType('data_access'), 'data_access.db_connection': db}):
        spec.loader.exec_module(module)
    return module


def bars(days, closes):
    return pd.DataFrame({'time': pd.to_datetime(days), 'open': closes, 'high': closes,
                         'low': closes, 'close': closes, 'volume': [100] * len(days)})


class ResumedTickerTests(unittest.TestCase):
    def fetch(self, fetched, previous):
        module = load_updater()
        with tempfile.NamedTemporaryFile('w', suffix='.txt', delete=False) as tickers:
            tickers.write('IDP')
        updater = module.StockDataUpdater(tickers.name, '2026-09-19', '2026-09-29')
        with patch.object(updater, '_download_with_retry', return_value=fetched), \
             patch.object(updater, '_previous_closes', return_value=previous), \
             patch.object(module.time, 'sleep'):
            return updater.fetch_all()

    def test_first_bar_after_silence_uses_the_stored_close(self):
        # IDP: last traded 2026-09-07, then again on 2026-09-28 (KBS, captured 2026-09-29).
        result = self.fetch(bars(['2026-09-28'], [238.5]), {'IDP': 238.5})
        self.assertEqual(result.Ngay.tolist(), [pd.Timestamp('2026-09-28')])
        self.assertEqual(result['return'].tolist(), [0.0])
        self.assertEqual(result.log_return.tolist(), [0.0])

    def test_ticker_without_history_is_still_skipped(self):
        self.assertTrue(self.fetch(bars(['2026-09-28'], [238.5]), {}).empty)

    def test_continuous_trading_is_unchanged(self):
        result = self.fetch(bars(['2026-09-18', '2026-09-21', '2026-09-22'], [10.0, 11.0, 9.9]), {'IDP': 50.0})
        self.assertEqual(result.Ngay.tolist(), [pd.Timestamp('2026-09-21'), pd.Timestamp('2026-09-22')])
        self.assertAlmostEqual(result['return'].iloc[0], 0.1)
        self.assertAlmostEqual(result['return'].iloc[1], -0.1)


if __name__ == '__main__':
    unittest.main()
