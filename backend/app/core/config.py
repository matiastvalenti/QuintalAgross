import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Quintal Agross API"
    API_V1_STR: str = "/api/v1"
    
    # Auth
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Gemini: solo modelos con nivel gratuito. La clave vive exclusivamente en backend/.env.
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"

    # CORS
    CORS_ORIGINS: list = ["*"]
    
    # Path logic
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # backend/app
    BACKEND_ROOT: str = os.path.dirname(BASE_DIR) # backend/
    DB_PATH: str = os.path.join(BACKEND_ROOT, "sql_app_v2.db")
    
    DATABASE_URL: str = f"sqlite:///{DB_PATH}"

    model_config = {
        "env_file": os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore"
    }

settings = Settings()
