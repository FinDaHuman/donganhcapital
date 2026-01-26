@echo off
echo Starting Stock Prediction App (Refactored)...

:: Start Backend
echo Starting Backend...
start "Stock Backend" cmd /k "cd backend && python main.py"

:: Start Frontend
echo Starting Frontend...
start "Stock Frontend" cmd /k "cd frontend && npm run dev"

echo ===================================================
echo Backend API: http://localhost:8000/docs
echo Frontend UI: http://localhost:5173
echo ===================================================
pause
