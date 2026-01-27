from pydantic import BaseModel
from typing import List, Optional

class StockDataPoint(BaseModel):
    Date: str
    Open: float
    High: float
    Low: float
    Close: float
    Volume: int
    Type: str # 'History' or 'Forecast'
    
    # Technical Indicators (Optional)
    SMA_5: Optional[float] = None
    SMA_20: Optional[float] = None
    RSI: Optional[float] = None
    
class PredictionResponse(BaseModel):
    ticker: str
    history: List[StockDataPoint]
    forecast: List[StockDataPoint]
    lower_bound: List[float]
    upper_bound: List[float]

class TickerList(BaseModel):
    tickers: List[str]
