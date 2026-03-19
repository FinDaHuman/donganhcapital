import os
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()

def get_engine():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return None
    
    return create_engine(database_url)
