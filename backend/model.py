import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from pandas.tseries.offsets import BusinessDay

def predict_next_10_days(df):
    """
    Trains a LinearRegression model on the LAST 60 DAYS of the dataframe.
    Predicts the next 10 business days.
    Returns:
        history (list of dict): Last 60 days history for visualization context.
        forecast (list of dict): 10 days prediction.
    """
    # 1. Prepare Data
    df = df.sort_values('Date')
    
    # Use only the last 60 days for training
    train_df = df.iloc[-60:].copy()
    
    if len(train_df) < 5:
        # Not enough data
        return [], []

    train_df['OrdinalDate'] = train_df['Date'].apply(lambda d: d.toordinal())
    
    X = train_df[['OrdinalDate']].values
    y = train_df['Close'].values

    # 2. Train Model
    model = LinearRegression()
    model.fit(X, y)

    # 3. Predict Future
    last_date = train_df['Date'].max()
    future_dates = []
    
    # Generate next 10 business days
    current_date = last_date
    for _ in range(10):
        current_date = current_date + BusinessDay()
        future_dates.append(current_date)
        
    future_dates_ordinal = np.array([d.toordinal() for d in future_dates]).reshape(-1, 1)
    predicted_close = model.predict(future_dates_ordinal)

    # 4. Construct Forecast Data (Heuristic for OHLC)
    forecast = []
    
    # Calculate average daily range/volatility from training data for better headers
    avg_volatility = (train_df['High'] - train_df['Low']).mean()
    if pd.isna(avg_volatility) or avg_volatility == 0:
        avg_volatility = train_df['Close'].mean() * 0.02 # fallback 2%

    for date, close_price in zip(future_dates, predicted_close):
        # Heuristic: Create a small random candle around the predicted close
        # This is strictly visual
        noise = np.random.uniform(-0.1, 0.1) * avg_volatility
        
        sim_close = close_price
        sim_open = close_price + noise # Open near Close for continuity? or previous close. 
        # Let's simple: Open = Close of preivous (or predicted) - random shift
        
        # Determine High/Low
        high = max(sim_open, sim_close) + (avg_volatility * 0.2)
        low = min(sim_open, sim_close) - (avg_volatility * 0.2)
        
        forecast.append({
            'Date': date.strftime('%Y-%m-%d'),
            'Open': round(sim_open, 2),
            'High': round(high, 2),
            'Low': round(low, 2),
            'Close': round(sim_close, 2),
            'Volume': 0, # Placeholder
            'Type': 'Forecast'
        })

    # Prepare History for return (converting dates to string)
    history = []
    for _, row in train_df.iterrows():
        history.append({
            'Date': row['Date'].strftime('%Y-%m-%d'),
            'Open': row['Open'],
            'High': row['High'],
            'Low': row['Low'],
            'Close': row['Close'],
            'Volume': row['Volume'],
            'Type': 'History'
        })
        
    return history, forecast
