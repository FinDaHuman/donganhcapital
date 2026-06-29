"""Parameterized SQL for the Premium PDF Reports feature (NeonDB).

All queries are parameterized via SQLAlchemy ``text()`` bind params — never raw
string interpolation. List reads are always bounded by ``LIMIT`` (free-tier
constraint: no unbounded SELECT).
"""

from db.connection import get_engine
from sqlalchemy import text

# Hard cap on rows returned by the list endpoint (Vercel 4.5 MB / NeonDB budget).
MAX_LIST_LIMIT = 200


def list_reports(stock=None, sector=None, date_from=None, date_to=None, limit=MAX_LIST_LIMIT):
    """Return active reports (metadata only — no object_key/checksum), newest first.

    Optional filters: stock_id (exact, case-insensitive), sector (exact),
    report_date range. Returns a list of plain dicts.
    """
    engine = get_engine()
    if engine is None:
        return []

    limit = max(1, min(int(limit), MAX_LIST_LIMIT))

    clauses = ["is_active = TRUE"]
    params = {"limit": limit}
    if stock:
        clauses.append("UPPER(stock_id) = UPPER(:stock)")
        params["stock"] = stock
    if sector:
        clauses.append("sector = :sector")
        params["sector"] = sector
    if date_from:
        clauses.append("report_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        clauses.append("report_date <= :date_to")
        params["date_to"] = date_to

    where = " AND ".join(clauses)
    query = text(f"""
        SELECT id, stock_id, sector, report_date, title, file_size_bytes, created_at
        FROM reports
        WHERE {where}
        ORDER BY report_date DESC, created_at DESC
        LIMIT :limit
    """)

    with engine.connect() as conn:
        rows = conn.execute(query, params).mappings().all()

    out = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        d["report_date"] = d["report_date"].isoformat() if d.get("report_date") else None
        d["created_at"] = d["created_at"].isoformat() if d.get("created_at") else None
        out.append(d)
    return out


def get_report_object(report_id):
    """Return {object_key, file_name} for an ACTIVE report by id, or None.

    Used by the presigned-URL endpoint; never exposed to the client directly.
    """
    engine = get_engine()
    if engine is None:
        return None

    query = text("""
        SELECT object_key, file_name
        FROM reports
        WHERE id = :id AND is_active = TRUE
    """)
    with engine.connect() as conn:
        row = conn.execute(query, {"id": report_id}).mappings().first()
    return dict(row) if row else None


def upsert_report(meta: dict):
    """Insert or update a report row, keyed on ``object_key``. Used by the upload script.

    ``meta`` keys: stock_id, sector, report_date, title, file_name, object_key,
    file_size_bytes, checksum.
    """
    engine = get_engine()
    if engine is None:
        raise RuntimeError("No database engine available (set DATABASE_URL).")

    query = text("""
        INSERT INTO reports (
            stock_id, sector, report_date, title, file_name,
            object_key, file_size_bytes, checksum, is_active, updated_at
        )
        VALUES (
            :stock_id, :sector, :report_date, :title, :file_name,
            :object_key, :file_size_bytes, :checksum, TRUE, NOW()
        )
        ON CONFLICT (object_key) DO UPDATE SET
            stock_id = EXCLUDED.stock_id,
            sector = EXCLUDED.sector,
            report_date = EXCLUDED.report_date,
            title = EXCLUDED.title,
            file_name = EXCLUDED.file_name,
            file_size_bytes = EXCLUDED.file_size_bytes,
            checksum = EXCLUDED.checksum,
            is_active = TRUE,
            updated_at = NOW()
        RETURNING id
    """)
    with engine.begin() as conn:
        report_id = conn.execute(query, meta).scalar()
    return str(report_id)


def deactivate_report(object_key: str) -> bool:
    """Soft-delete: mark a report inactive. Returns True if a row was affected."""
    engine = get_engine()
    if engine is None:
        raise RuntimeError("No database engine available (set DATABASE_URL).")
    query = text("""
        UPDATE reports SET is_active = FALSE, updated_at = NOW()
        WHERE object_key = :object_key
    """)
    with engine.begin() as conn:
        result = conn.execute(query, {"object_key": object_key})
    return result.rowcount > 0


def delete_report(object_key: str) -> bool:
    """Hard-delete: remove the metadata row. Returns True if a row was deleted."""
    engine = get_engine()
    if engine is None:
        raise RuntimeError("No database engine available (set DATABASE_URL).")
    query = text("DELETE FROM reports WHERE object_key = :object_key")
    with engine.begin() as conn:
        result = conn.execute(query, {"object_key": object_key})
    return result.rowcount > 0
