"""Cloudflare R2 (S3-compatible) object storage for the Premium PDF Reports feature.

Deliberately isolated from the rest of the backend — mirrors ``db/mongo.py`` — so a
missing or misconfigured R2 bucket can NEVER block startup or degrade any other
endpoint:

  - One lazy singleton boto3 client reused across requests (it owns its own
    connection pool). ``boto3`` is imported lazily inside the getter so a missing
    install can't break ``main.py`` import / startup.
  - Created on first use, NOT in FastAPI ``lifespan``.
  - Any failure / missing config returns ``None`` (logged); callers raise 503,
    never 500.

PDFs are ~3-4 MB. They are NEVER streamed through the backend (512 MB / 0.1 vCPU
Render box) — instead we mint short-TTL **presigned GET URLs** and let the browser
download straight from R2. ``generate_presigned_url`` is a local crypto operation
(no network round-trip to R2), so it is negligible even on 0.1 vCPU.

Callers MUST run the blocking presign/delete calls via ``asyncio.to_thread`` so
they don't stall the event loop.
"""

import os
import logging
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_client = None  # boto3 S3 client singleton

# Default content type for all report objects.
PDF_CONTENT_TYPE = "application/pdf"


def get_bucket() -> Optional[str]:
    """Return the configured R2 bucket name, or None if unset."""
    return os.environ.get("R2_BUCKET") or None


def get_r2_client():
    """Return the shared boto3 R2 client, creating it lazily. None if unavailable.

    Requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.
    """
    global _client
    if _client is not None:
        return _client

    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = get_bucket()

    if not all([account_id, access_key, secret_key, bucket]):
        logger.warning("R2_* env vars not fully set — PDF reports feature is disabled.")
        return None

    try:
        import boto3  # lazy import: a missing install must not break startup
        from botocore.config import Config

        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 2, "mode": "standard"},
                connect_timeout=4,
                read_timeout=8,
            ),
        )
        logger.info("R2 client initialized for PDF reports.")
        return _client
    except Exception as e:  # pragma: no cover - defensive
        logger.error(f"R2 client init failed: {e}")
        _client = None
        return None


def presign_get(
    object_key: str,
    *,
    disposition: str = "inline",
    filename: Optional[str] = None,
    ttl: int = 180,
) -> Optional[str]:
    """Return a short-lived presigned GET URL for ``object_key``, or None.

    ``disposition`` controls the browser behaviour:
      - ``"inline"``     → open in the browser's native PDF viewer (new tab)
      - ``"attachment"`` → force a download

    Raises nothing on a missing client (returns None); the caller maps that to 503.
    """
    client = get_r2_client()
    bucket = get_bucket()
    if client is None or not bucket:
        return None

    disp = "attachment" if disposition == "attachment" else "inline"
    content_disposition = disp
    if filename:
        # Quote conservatively; report filenames are ASCII (report_<STOCK>_<date>.pdf).
        content_disposition = f'{disp}; filename="{filename}"'

    return client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": bucket,
            "Key": object_key,
            "ResponseContentType": PDF_CONTENT_TYPE,
            "ResponseContentDisposition": content_disposition,
        },
        ExpiresIn=ttl,
    )


def put_object(object_key: str, data: bytes) -> bool:
    """Upload PDF bytes to ``object_key``. Returns True on success.

    Used by the manual upload script — NOT by any request path.
    """
    client = get_r2_client()
    bucket = get_bucket()
    if client is None or not bucket:
        raise RuntimeError("R2 is not configured (set R2_* env vars).")
    client.put_object(
        Bucket=bucket,
        Key=object_key,
        Body=data,
        ContentType=PDF_CONTENT_TYPE,
    )
    return True


def delete_object(object_key: str) -> bool:
    """Delete ``object_key`` from the bucket. Used by the --hard removal path."""
    client = get_r2_client()
    bucket = get_bucket()
    if client is None or not bucket:
        raise RuntimeError("R2 is not configured (set R2_* env vars).")
    client.delete_object(Bucket=bucket, Key=object_key)
    return True
