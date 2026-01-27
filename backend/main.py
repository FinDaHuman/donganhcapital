from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.services.data_service import get_tickers
from app.services.model_service import predict_with_global_model
from app.schemas.stock import PredictionResponse, TickerList
import uvicorn
import os

app = FastAPI(title="Stock Prediction API", version="2.0")

# CORS
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/tickers", response_model=TickerList)
def read_tickers():
    tickers = get_tickers()
    return {"tickers": tickers}

@app.get("/api/predict/{ticker}", response_model=PredictionResponse)
def predict(ticker: str):
    history, forecast, lower, upper = predict_with_global_model(ticker, None)
    
    if not history:
        raise HTTPException(status_code=404, detail="Ticker not found or insufficient history")
    
    return {
        "ticker": ticker,
        "history": history,
        "forecast": forecast,
        "lower_bound": lower if lower else [],
        "upper_bound": upper if upper else []
    }

if __name__ == "__main__":
    port = int(os.getenv("API_PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
