"""Offline regressions for recovery across weekends and market closures.

Run with: python -m unittest discover -s daily_suggestion_system/tests
"""

import importlib.util
from datetime import datetime
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import MagicMock, patch

import pandas as pd


PIPELINE = Path(__file__).resolve().parents[1] / 'src' / 'daily_pipeline'


def load_module(name):
    # Replace network/DB dependencies before importing the production code.
    dependencies = {}
    for module, attribute in (
        ('data_update.stock_ohlc_update', 'StockDataUpdater'),
        ('data_update.vnindex_ohlc_update', 'update_vnindex_ohlc'),
        ('data_access.db_connection', 'get_engine'),
        ('market_data', 'history'),
    ):
        stub = ModuleType(module)
        setattr(stub, attribute, MagicMock())
        dependencies[module] = stub
    spec = importlib.util.spec_from_file_location(name, PIPELINE / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, dependencies):
        spec.loader.exec_module(module)
    return module


class UpdateWindowTests(unittest.TestCase):
    def test_holiday_and_missed_run_recovery(self):
        cases = (
            ('2026-08-31', '2026-08-28'),
            ('2026-09-01', '2026-08-28'),
            ('2026-09-02', '2026-08-28'),
            ('2026-09-03', '2026-08-28'),
            ('2026-08-07', '2026-07-31'),
        )
        for run_day, available_day in cases:
            with self.subTest(run_day=run_day):
                module = load_module('database_update')
                available = pd.DataFrame({'Ngay': pd.to_datetime([available_day])})

                def fetch(start, end):
                    return available[available.Ngay.between(start, end)].copy()

                def updater(**kwargs):
                    result = MagicMock()
                    result.run.return_value = fetch(kwargs['from_date'], kwargs['to_date'])
                    return result

                module.StockDataUpdater.side_effect = updater
                module.update_vnindex_ohlc.side_effect = fetch
                with patch.object(module, 'datetime') as clock:
                    clock.today.return_value = datetime.fromisoformat(run_day)
                    # The second execution must still accept the same historical bars.
                    module.update_database_today()
                    module.update_database_today()

    def test_empty_ohlc_still_fails(self):
        module = load_module('database_update')
        module.StockDataUpdater.return_value.run.return_value = pd.DataFrame()
        module.update_vnindex_ohlc.return_value = pd.DataFrame()
        with self.assertRaisesRegex(RuntimeError, 'Stock OHLC update produced no rows.*VNINDEX'):
            module.update_database_today()

    def test_source_failure_still_fails(self):
        module = load_module('database_update')
        module.StockDataUpdater.return_value.run.side_effect = RuntimeError('source unavailable')
        module.update_vnindex_ohlc.return_value = pd.DataFrame({'Ngay': ['2026-09-04']})
        with self.assertRaisesRegex(RuntimeError, 'source unavailable'):
            module.update_database_today()

    def test_intraday_recovers_preholiday_candles(self):
        module = load_module('vn30f1m_update')
        bars = pd.DataFrame({
            'time': pd.to_datetime(['2026-08-28 09:00:00']),
            'open': [100.0], 'high': [102.0], 'low': [99.0],
            'close': [101.0], 'volume': [10],
        })

        def fetch(symbol, start, end, interval):
            self.assertEqual(interval, '1m')
            return bars[bars.time.between(start, end)].copy()

        module.history.side_effect = fetch
        with patch.object(module, 'datetime') as clock, patch.object(pd.DataFrame, 'to_sql'):
            clock.now.return_value = datetime(2026, 9, 2, 15, 20)
            self.assertEqual(module.update_vn30f1m_intraday(), 1)
        module.get_engine.return_value.begin.assert_called()

    def test_intraday_source_failure_still_fails(self):
        module = load_module('vn30f1m_update')
        module.history.side_effect = RuntimeError('source unavailable')
        with self.assertRaisesRegex(RuntimeError, 'source unavailable'):
            module.update_vn30f1m_intraday()


if __name__ == '__main__':
    unittest.main()
