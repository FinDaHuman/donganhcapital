import os
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()

def get_engine():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is not set")
    
    # SQLAlchemy requires `postgresql://` or `postgresql+psycopg2://`
    engine = create_engine(database_url)
    return engine