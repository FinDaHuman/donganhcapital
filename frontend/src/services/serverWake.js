/**
 * Cold-start coordination for a backend that sleeps.
 *
 * The API runs on free-tier hosting that spins down after ~15 minutes idle, and
 * a wake takes ~2 minutes: container boot, heavy ML imports on a fraction of a
 * vCPU, model load, then seven startup migrations before uvicorn serves
 * anything. Every client here defaulted to a 15s timeout — shorter than the wake
 * it had to survive — so the first visitor after an idle period got failures
 * that look exactly like a broken deployment.
 *
 * Two ideas, and neither of them is a retry:
 *
 * 1. Don't abort. Render *queues* the request that triggers the wake rather
 *    than refusing it, and answers it as soon as the app is up. So while the
 *    server is not known to be awake, requests get a timeout long enough to
 *    span the whole boot. Retrying instead would risk sending a registration or
 *    a chat message twice; waiting cannot.
 *
 * 2. Start the boot as early as possible. warmUp() fires on app mount, so the
 *    two minutes run underneath the landing page while a first-time visitor is
 *    still reading it — by the time they click Sign Up the server is usually
 *    already up. This is the whole reason the module is wired in App.jsx rather
 *    than in the views that happen to need data.
 *
 * Once any response arrives the server is known to be awake and every timeout
 * drops back to the instance default, so a genuinely dead backend still fails
 * fast instead of hanging for two minutes.
 */
import axios from 'axios';

// Longer than the measured ~2 minute cold start, with room to spare.
export const WAKE_TIMEOUT = 150000;

// Anti-flash delay, and nothing more. This backend is asleep most of the time,
// so "asleep" is the normal case and the notice is shown by default rather than
// earned by evidence. The only thing worth suppressing is the blink you would
// otherwise get when the server IS warm and the probe answers in ~200-500ms.
//
// It is deliberately not a "should we mention this?" threshold. That is what
// the previous 8s and 5s values were, and both meant the explanation arrived
// after the user had already been staring at a spinner.
export const WAKE_HINT_AFTER_MS = 400;

// Past this, "up to two minutes" is no longer true, so the toast stops claiming
// it and offers a reload instead. A wrong reassurance is worse than none.
export const WAKE_STALE_AFTER_MS = 180000;

// Derived from whichever client is attached below, never declared here.
//
// Hard-coding a fallback host would be a third copy of a decision that already
// lives in stock_api.js and AuthContext.jsx — and those two deliberately differ
// between this repo and the dev fork, which falls back to the same origin so a
// misconfigured build fails visibly instead of quietly talking to production.
// Reading the base off the instance keeps this file byte-identical in both.
let probeUrl = null;

const rememberProbeUrl = (instance) => {
    if (probeUrl) return;
    const base = String(instance?.defaults?.baseURL || '')
        .replace(/\/$/, '')
        .replace(/\/api$/, '');
    probeUrl = `${base}/api/health`;
};

// When this page started loading, not when this module happened to run.
//
// The wait a visitor experiences starts when they open the page, and that is
// several hundred ms before React mounts and warmUp() fires — long enough on a
// cold cache to matter. Timing from here means the counter reads what they
// actually waited, the anti-flash delay is already spent by the time the app is
// interactive (so the toast appears immediately rather than 400ms later), and
// the clock can never run ahead of the elapsed time and print a negative.
const PAGE_OPENED_AT = (() => {
    try {
        return Date.now() - (performance?.now?.() ?? 0);
    } catch {
        return Date.now();
    }
})();

// 'unknown' — no answer yet this session; assume it may be asleep.
// 'waking'  — a request failed without a response, a probe is in flight.
// 'awake'   — the server has answered something; normal timeouts apply.
let state = 'unknown';
let wakingSince = 0;
let probeInFlight = null;

// Views that are already explaining the wait themselves can claim the job, so
// the same sentence does not appear twice on one screen. A counter rather than
// a flag: two claimants must not cancel each other out on unmount.
let suppressors = 0;

const listeners = new Set();

const emit = () => {
    for (const fn of listeners) {
        try { fn(state, wakingSince); } catch { /* a bad listener must not break the app */ }
    }
};

export const getWakeState = () => state;
export const getWakingSince = () => wakingSince;
export const isWakeToastSuppressed = () => suppressors > 0;

/**
 * Claim responsibility for explaining the wait, hiding the global toast while
 * the claim is held. Returns the release function, so it can be used directly
 * as a useEffect cleanup:
 *
 *   useEffect(() => { if (!gateOpen) return suppressWakeToast(); }, [gateOpen]);
 */
export const suppressWakeToast = () => {
    suppressors++;
    emit();
    let released = false;
    return () => {
        if (released) return; // React 18 StrictMode double-invokes cleanups
        released = true;
        suppressors = Math.max(0, suppressors - 1);
        emit();
    };
};

export const subscribeWake = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

export const markAwake = () => {
    if (state === 'awake') return;
    state = 'awake';
    wakingSince = 0;
    emit();
};

// A bare axios call: the shared instances carry the interceptors below, and
// probing with those would recurse.
const probeOnce = () =>
    axios.get(probeUrl || '/api/health', { timeout: WAKE_TIMEOUT, withCredentials: false });

/**
 * Drive the server from asleep to awake, at most one probe at a time.
 * Safe to call repeatedly — every caller joins the in-flight probe.
 */
const startProbe = () => {
    if (probeInFlight) return probeInFlight;

    probeInFlight = (async () => {
        // A few attempts: the connection can be dropped mid-boot, and giving up
        // after one failure would leave the banner stuck on "waking" forever.
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                await probeOnce();
                markAwake();
                return true;
            } catch {
                await new Promise((r) => setTimeout(r, 3000));
            }
        }
        return false;
    })().finally(() => { probeInFlight = null; });

    return probeInFlight;
};

/**
 * Called when a request came back with no response at all (timeout, connection
 * refused, DNS). An HTTP error status is NOT this: a 4xx/5xx proves the server
 * is up and is handled as such.
 */
export const markUnreachable = () => {
    if (state === 'awake') {
        // It answered earlier, so this is a new outage rather than a cold start.
        // Re-probe, but keep the UI quiet unless the probe also fails.
        state = 'unknown';
    }
    if (state !== 'waking') {
        state = 'waking';
        // Same reasoning as warmUp: measure from when the visitor opened the
        // page, not from the moment we noticed.
        wakingSince = PAGE_OPENED_AT;
        emit();
    }
    startProbe();
};

/**
 * Fire-and-forget wake on app mount. Costs one request to a handler that does
 * not touch Postgres, and buys back most of the two minutes.
 *
 * This also starts the clock the banner reads from, and that part is not
 * optional: the notice cannot be driven off a failed request, because the
 * stretched timeouts above mean nothing fails for 150s. Waiting for a failure
 * hid the notice for exactly as long as the user needed it, leaving the sign-in
 * buttons spinning with no explanation.
 *
 * So the assumption is "asleep until proven otherwise". A server that is
 * already warm answers the probe in well under the hint threshold, marks itself
 * awake, and the banner never renders at all.
 */
export const warmUp = () => {
    if (state === 'awake') return;
    if (state !== 'waking') {
        state = 'waking';
        wakingSince = PAGE_OPENED_AT;
        emit();
    }
    startProbe();
};

/**
 * Give an axios instance cold-start behaviour:
 *   - stretch the timeout while the server is not known to be awake
 *   - learn from every outcome, so the stretch stops as soon as it can
 *
 * Deliberately no retry logic — see the note at the top of the file.
 */
export const attachColdStartHandling = (instance) => {
    rememberProbeUrl(instance);

    instance.interceptors.request.use((config) => {
        if (state !== 'awake') {
            const current = typeof config.timeout === 'number' ? config.timeout : 0;
            // Only ever lengthen. A caller that already asked for longer than
            // this (or that set its own deliberate budget) keeps what it chose.
            if (current < WAKE_TIMEOUT) config.timeout = WAKE_TIMEOUT;
        }
        return config;
    });

    instance.interceptors.response.use(
        (response) => {
            markAwake();
            return response;
        },
        (error) => {
            // error.response means the server replied — even a 401 or a 500
            // proves it is running, so this is not a cold start.
            if (error?.response) markAwake();
            else markUnreachable();
            return Promise.reject(error);
        },
    );
};
