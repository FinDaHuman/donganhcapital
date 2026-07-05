// Limited-time free 1-week Pro trial — single source of truth for the frontend.
// Mirrors backend/utils/trial.py PRO_TRIAL_OFFER_END: the offer closes at the end
// of 2026-07-07 Vietnam time (UTC+7). The server independently enforces the window
// (claim-trial returns 410 after it) — this only controls whether the offer is
// advertised in the UI, so no surface pitches a dead offer after the sunset.
export const TRIAL_OFFER_END = new Date('2026-07-08T00:00:00+07:00');

export const isTrialOfferOpen = () => Date.now() < TRIAL_OFFER_END.getTime();
