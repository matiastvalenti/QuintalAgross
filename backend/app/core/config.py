import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Quintal Agross API"
    API_V1_STR: str = "/api/v1"
    
    # Auth
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    CORS_ORIGINS: list = ["*"]
    
    # Path logic
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # backend/app
    BACKEND_ROOT: str = os.path.dirname(BASE_DIR) # backend/
    DB_PATH: str = os.path.join(BACKEND_ROOT, "sql_app_v2.db")
    
    DATABASE_URL: str = f"sqlite:///{DB_PATH}"

    model_config = {
        "env_file": ".env",
        "extra": "ignore"
    }

settings = Settings()
