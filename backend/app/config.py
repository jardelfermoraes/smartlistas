"""Configuração centralizada da aplicação usando pydantic-settings."""

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configurações da aplicação carregadas de variáveis de ambiente."""

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[1] / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database
    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/postgres"

    # Redis
    redis_url: str = "redis://redis:6379/0"

    # Queue
    queue_name: str = "receipts"

    # App
    env: str = "development"
    log_level: str = "INFO"
    debug: bool = False

    # Security
    secret_key: str = "change-me-in-production"
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8081",
        "http://localhost:8082",
        "http://localhost:19006",
        "https://smartlistas.com.br",
        "https://cadastro.smartlistas.com.br",
    ]

    # Rate limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds

    # OpenAI
    openai_api_key: str = ""

    # 2Captcha
    twocaptcha_api_key: str = ""

    # Mercado Pago
    mp_access_token: str = ""
    mp_webhook_secret: str = ""
    mp_base_url: str = "https://api.mercadopago.com"
    
    # Permite sobrescrever cupons já processados (útil para desenvolvimento)
    # Em produção, defina como False
    allow_receipt_overwrite: bool = True

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def is_development(self) -> bool:
        return self.env == "development"


@lru_cache
def get_settings() -> Settings:
    """Retorna instância cacheada das configurações."""
    return Settings()


settings = get_settings()
