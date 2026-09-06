"""Exercise both ingestion entry points without starting API background jobs."""
import ast
from datetime import date, datetime
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import MagicMock, patch

import pandas as pd
import numpy as np

BACKEND = Path(__file__).resolve().parents[2] / 'backend'
sys.path.insert(0, str(BACKEND))
from market_calendar import filter_intraday_sessions, is_trading_day
from test_update_windows import load_module


class CalendarTests(unittest.TestCase):
    def test_exchange_closures_and_reopening(self):
        for day in ('2026-01-02', '2026-02-16', '2026-02-20', '2026-04-27',
                    '2026-04-30', '2026-05-01', '2026-08-22', '2026-08-29',
                    '2026-08-31', '2026-09-01', '2026-09-02'):
            with self.subTest(day=day):
                self.assertFalse(is_trading_day(date.fromisoformat(day)))
        self.assertTrue(is_trading_day(date(2026, 9, 3)))

    def test_unknown_year_does_not_silently_accept_data(self):
        with self.assertRaisesRegex(ValueError, 'calendar missing for 2027'):
            is_trading_day(date(2027, 1, 4))

    def test_filters_rows_and_preserves_real_sessions(self):
        frame = pd.DataFrame({'time': ['2026-08-28 09:00', '2026-08-31 09:00',
                                      '2026-09-01 09:00', '2026-09-02 09:00',
                                      '2026-09-03 09:00'], 'close': [1, 2, 3, 4, 5]})
        result = filter_intraday_sessions(frame)
        self.assertEqual(result.close.tolist(), [1, 5])
        pd.testing.assert_frame_equal(filter_intraday_sessions(result), result)
        self.assertEqual(len(frame), 5)

    def test_utc_timestamps_use_vietnam_date(self):
        frame = pd.DataFrame({'time': pd.to_datetime(['2026-09-02T18:00:00Z'])})
        result = filter_intraday_sessions(frame)
        self.assertEqual(result.time.iloc[0], pd.Timestamp('2026-09-03 01:00'))

    def test_missing_timestamp_fails(self):
        with self.assertRaisesRegex(ValueError, 'missing timestamps'):
            filter_intraday_sessions(pd.DataFrame({'time': [None]}))

    def test_batch_writer_does_not_write_holiday_only_response(self):
        module = load_module('vn30f1m_update')
        module.Quote.return_value.history.return_value = pd.DataFrame({'time': ['2026-09-01 09:00']})
        self.assertEqual(module.update_vn30f1m_intraday(), 0)
        module.get_engine.return_value.begin.assert_not_called()

    def test_backend_poll_gate_and_direct_sync_skip_holidays(self):
        # Compile the actual functions without importing main's app/router setup.
        tree = ast.parse((BACKEND / 'main.py').read_text(encoding='utf-8'))
        functions = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)
                                    and n.name in ('run_vn30f1m_sync', 'is_vn30f1m_open')], type_ignores=[])
        namespace = {'is_trading_day': is_trading_day, 'filter_intraday_sessions': filter_intraday_sessions}
        exec(compile(functions, str(BACKEND / 'main.py'), 'exec'), namespace)
        quote = ModuleType('vnstock')
        quote.Quote = MagicMock()
        for day in (date(2026, 8, 31), date(2026, 9, 1), date(2026, 9, 2)):
            class Clock(datetime):
                @classmethod
                def now(cls, tz=None):
                    return datetime(day.year, day.month, day.day, 10, tzinfo=tz)
            with self.subTest(day=day), patch.dict(sys.modules, {'vnstock': quote}), patch('datetime.datetime', Clock):
                namespace['datetime'] = Clock
                self.assertFalse(namespace['is_vn30f1m_open']())
                namespace['run_vn30f1m_sync']()
        quote.Quote.assert_not_called()

    def test_backend_writer_filters_mixed_provider_response(self):
        tree = ast.parse((BACKEND / 'main.py').read_text(encoding='utf-8'))
        functions = ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)
                                    and n.name == 'run_vn30f1m_sync'], type_ignores=[])
        clock = MagicMock()
        clock.now.return_value = datetime(2026, 9, 3, 10)
        namespace = {'is_trading_day': is_trading_day, 'filter_intraday_sessions': filter_intraday_sessions,
                     'datetime': clock, 'pd': pd, 'np': np}
        exec(compile(functions, str(BACKEND / 'main.py'), 'exec'), namespace)
        provider = ModuleType('vnstock')
        provider.Quote = MagicMock()
        provider.Quote.return_value.history.return_value = pd.DataFrame({
            'time': ['2026-09-02 09:00', '2026-09-03 09:00'],
            'open': [1, 2], 'high': [1, 2], 'low': [1, 2], 'close': [1, 2], 'volume': [1, 2],
        })
        db = ModuleType('db.connection')
        db.get_engine = MagicMock()
        captured = []
        with patch.dict(sys.modules, {'vnstock': provider, 'db.connection': db}), \
             patch.object(pd.DataFrame, 'to_sql', lambda frame, *a, **kw: captured.append(frame.copy())):
            namespace['run_vn30f1m_sync']()
        self.assertEqual(len(captured), 1)
        self.assertEqual(captured[0].time.tolist(), [pd.Timestamp('2026-09-03 09:00')])


if __name__ == '__main__':
    unittest.main()
