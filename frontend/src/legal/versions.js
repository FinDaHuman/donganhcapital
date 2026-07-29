/**
 * Current version of each legal document. Mirrors `LEGAL_VERSIONS` in
 * backend/utils/legal.py — the two MUST stay equal.
 *
 * Registration posts these values; the backend rejects a mismatch with 422, so a
 * stale cached SPA fails loudly instead of silently recording consent against a
 * superseded document. Bumping a version here (and in the backend) re-prompts
 * every user through the re-consent modal.
 */
export const LEGAL_VERSIONS = {
    terms: '2026-08-01',
    privacy: '2026-08-01',
    disclaimer: '2026-08-01',
    cookies: '2026-08-01',
};

export default LEGAL_VERSIONS;
