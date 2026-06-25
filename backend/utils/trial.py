"""
Free Pro Trial offer — single source of truth.

The limited-time "1-week free Pro trial" is being sunset. Rather than scatter the
end date across routers and email templates, every surface that *mentions* or
*grants* the trial imports from here. When the offer window closes, the claim
endpoint rejects new claims (HTTP 410) and all advertising copy (verification
email, welcome email) automatically stops pitching it — no code change needed at
sunset, and no risk of a template advertising a dead offer.

This module imports only the stdlib `datetime`, so it is safe to import from
anywhere (routers/auth.py, routers/payments.py, utils/mailer.py) without creating
a circular import.
"""

from datetime import datetime, timedelta, timezone

# Length of the granted trial.
PRO_TRIAL_DURATION_DAYS = 7

# subscription_period value stored for a claimed trial. create_order() treats this
# as non-creditable (a free trial must never earn proration credit toward a paid
# upgrade) and as free-tier for all billing logic.
PRO_TRIAL_PERIOD = "trial"

# The offer closes at the end of 2026-07-07 (Vietnam time, UTC+7). After this
# instant, claim-trial returns 410 and all copy stops advertising the trial.
PRO_TRIAL_OFFER_END = datetime(2026, 7, 8, 0, 0, 0, tzinfo=timezone(timedelta(hours=7)))


def is_trial_offer_active(now: datetime | None = None) -> bool:
    """True while the free Pro trial offer is still open for new claims.

    `now` defaults to the current UTC time; callers may pass an explicit instant
    (already tz-aware) for testing or to share a single timestamp across checks.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    return now < PRO_TRIAL_OFFER_END
