import asyncio
import time
from typing import Callable, Any, Awaitable

class RateLimiter:
    """Simple async rate limiter allowing max_calls per period_seconds."""
    def __init__(self, max_calls: int, period_seconds: int = 60):
        self.max_calls = max_calls
        self.period = period_seconds
        self._call_times: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.time()
            # Remove timestamps older than period
            self._call_times = [t for t in self._call_times if now - t < self.period]
            if len(self._call_times) >= self.max_calls:
                # Need to wait until the oldest call expires
                wait_time = self.period - (now - self._call_times[0])
                await asyncio.sleep(wait_time)
                now = time.time()
                self._call_times = [t for t in self._call_times if now - t < self.period]
            self._call_times.append(time.time())

async def retry_async(coro_func: Callable[..., Awaitable[Any]], *args, retries: int = 3, backoff: float = 1.0, **kwargs) -> Any:
    """Execute an async callable with exponential back‑off retry.
    Retries on any Exception. Returns the result of the callable.
    """
    for attempt in range(retries):
        try:
            return await coro_func(*args, **kwargs)
        except Exception as e:
            if attempt < retries - 1:
                delay = backoff * (2 ** attempt)
                print(f"Retry attempt {attempt + 1}/{retries} after error: {e}. Waiting {delay}s")
                await asyncio.sleep(delay)
            else:
                print(f"All retry attempts failed: {e}")
                raise
