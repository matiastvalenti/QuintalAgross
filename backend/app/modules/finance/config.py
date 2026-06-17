from pydantic_settings import BaseSettings, SettingsConfigDict
import os

class Settings(BaseSettings):
    # App
    app_name: str = "Cheques Alertas"
    env: str = "dev"
    cors_origins: str = "*"  # comma-separated or *
    timezone: str = "America/Argentina/Cordoba"

    # SMTP (mail)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_to: str = "comercial@quintalagross.ar"
    smtp_use_tls: bool = True

    # Scheduler
    alerts_hour: int = 8
    alerts_minute: int = 0

    model_config = SettingsConfigDict(env_file=os.path.join(os.path.dirname(__file__), "../../../.env"), env_file_encoding="utf-8", extra="ignore")

settings = Settings()
