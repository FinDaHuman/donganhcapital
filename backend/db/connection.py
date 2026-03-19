import os
from sqlalchemy import create_engine
from dotenv import load_dotenv
from sqlalchemy.pool import NullPool

load_dotenv()

_engine = None

def get_engine():
    global _engine
    if _engine is not None:
        return _engine

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return None
    
    _engine = create_engine(
        database_url,
        poolclass=NullPool
    )
    return _engine
