from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import router as api_router

def create_app() -> FastAPI:
    app = FastAPI(title="Stock Prediction API", version="2.0")

    # CORS
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://dong-anh-capital.vercel.app", # User's specific production URL
        "https://donganhcapital.onrender.com", 
        "*" 
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix="/api")

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.API_PORT, reload=True)
