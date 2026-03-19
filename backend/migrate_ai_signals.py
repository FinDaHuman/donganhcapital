import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def migrate():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("No DATABASE_URL found.")
        return
    
    # psycopg2 needs postgresql:// instead of postgresql+psycopg2://
    if url.startswith("postgresql+psycopg2://"):
        url = url.replace("postgresql+psycopg2://", "postgresql://")
        
    conn = psycopg2.connect(url)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ai_signals (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      stock_id VARCHAR(10) NOT NULL,
      entry_price NUMERIC,
      tp_price NUMERIC,
      sl_price NUMERIC,
      prob NUMERIC,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(date, stock_id)
    );
    """)
    conn.commit()
    print("ai_signals table created/verified")

if __name__ == "__main__":
    migrate()
