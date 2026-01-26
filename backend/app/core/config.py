import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    API_PORT: int = 8000
    DATA_PATH: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'data', 'all_stocks.xlsx')
    
    class Config:
        env_file = ".env"

settings = Settings()
