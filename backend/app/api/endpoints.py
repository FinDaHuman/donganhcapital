from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.services.data_service import get_tickers
from app.services.model_service import predict_stock
from app.schemas.stock import PredictionResponse, TickerList, StockDataPoint
import asyncio

router = APIRouter()

@router.get("/tickers", response_model=TickerList)
def get_stock_tickers():
    try:
        tickers = get_tickers()
        return {"tickers": tickers}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@router.get("/predict/{ticker}", response_model=PredictionResponse)
async def predict_stock_price(ticker: str):
    try:
        # Wrap the synchronous prediction in a timeout shield if needed, 
        # but since we use n_jobs=1 and it returns fast, simple await is usually fine for def.
        # Actually proper way for CPU bound task in endpoints:
        # FastAPI runs 'def' (non-async) in threadpool automatically.
        # But we made this 'async def' to demonstrate control? 
        # No, 'predict_stock' is sync. If we make this 'async def', we must allow it to block or run in executor.
        # Let's use 'def' to let FastAPI handle threadpooling for CPU task.
        pass
    except Exception:
        pass
        
    # Re-writing as standard def to use FastAPI's threadpool
    pass

@router.get("/predict_sync/{ticker}", response_model=PredictionResponse, tags=["Predict"])
def predict_stock_endpoint(ticker: str):
    try:
        result = predict_stock(ticker)
        
        if result is None:
            raise HTTPException(status_code=404, detail="Ticker not found or insufficient data")
            
        history, forecast, lower, upper = result
        
        # Convert to Pydantic models
        history_objs = [StockDataPoint(**x) for x in history]
        forecast_objs = [StockDataPoint(**x) for x in forecast]
        
        return {
            "ticker": ticker,
            "history": history_objs,
            "forecast": forecast_objs,
            "lower_bound": lower,
            "upper_bound": upper
        }
    except Exception as e:
        # Graceful error for "Server Busy" simulation or actual errors
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=503, detail="Server đang bận hoặc gặp lỗi xử lý, vui lòng thử lại sau giây lát.")
