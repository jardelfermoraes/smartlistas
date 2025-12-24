"""SmartListas API - Aplicação principal FastAPI."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from redis import Redis
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import text

from .config import settings
from .database import Base, engine
from app.routers import (
    auth,
    app_auth,
    app_billing,
    app_billing_admin,
    app_notifications_admin,
    app_payments,
    app_payments_admin,
    app_receipt_keys,
    app_receipt_keys_admin,
    receipts,
    ocr,
    stores,
    products,
    prices,
    shopping,
    stats,
    canonical,
    app_shopping,
    app_purchases,
)
from app.routers.app_locations import router as app_locations
from .schemas import HealthResponse

# === Logging ===

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# === Rate Limiter ===

limiter = Limiter(key_func=get_remote_address)


# === Lifespan ===


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Gerencia o ciclo de vida da aplicação."""
    logger.info("Iniciando SmartListas API...")

    # Startup: criar tabelas (em produção, usar Alembic)
    if settings.is_development:
        logger.info("Ambiente de desenvolvimento: criando tabelas...")
        Base.metadata.create_all(bind=engine)

    logger.info("API iniciada com sucesso!")
    yield

    # Shutdown
    logger.info("Encerrando SmartListas API...")


# === App ===

app = FastAPI(
    title="SmartListas API",
    description="API para importação e consulta de cupons fiscais (NFC-e)",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# === Middleware ===

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https://([a-z0-9-]+\.)*smartlistas\.com\.br$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


# === Exception Handlers ===


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handler global para exceções não tratadas."""
    logger.exception(f"Erro não tratado: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Erro interno do servidor"
            if settings.is_production
            else str(exc)
        },
    )


# === Routers ===

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(app_auth.router, prefix="/app", tags=["app-auth"])
app.include_router(app_billing.router, prefix="/app", tags=["app-billing"])
app.include_router(app_billing_admin.router, prefix="/app", tags=["app-billing-admin"])
app.include_router(app_notifications_admin.router, prefix="/app", tags=["app-notifications-admin"])
app.include_router(app_payments.router, prefix="/app", tags=["app-payments"])
app.include_router(app_payments_admin.router, prefix="/app", tags=["app-payments-admin"])
app.include_router(app_locations, prefix="/app", tags=["app-locations"])
app.include_router(app_shopping.router, prefix="/app", tags=["app-shopping"])
app.include_router(app_purchases.router, prefix="/app", tags=["app-purchases"])
app.include_router(app_receipt_keys.router, prefix="/app", tags=["app-receipt-keys"])
app.include_router(app_receipt_keys_admin.router, prefix="/app", tags=["app-receipt-keys-admin"])
app.include_router(receipts.router, prefix="/receipts", tags=["receipts"])
app.include_router(stores.router, prefix="/stores", tags=["stores"])
app.include_router(products.router, prefix="/products", tags=["products"])
app.include_router(prices.router, prefix="/prices", tags=["prices"])
app.include_router(ocr.router, prefix="/ocr", tags=["ocr"])
app.include_router(canonical.router, prefix="/canonical", tags=["canonical"])
app.include_router(shopping.router, prefix="/shopping-lists", tags=["shopping"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])


# === Health Check ===


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health_check() -> HealthResponse:
    """Verifica a saúde da aplicação e suas dependências."""
    # DB check
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:
        logger.warning(f"Health check DB falhou: {e}")

    # Redis check
    redis_ok = False
    try:
        r = Redis.from_url(settings.redis_url)
        r.ping()
        redis_ok = True
    except Exception as e:
        logger.warning(f"Health check Redis falhou: {e}")

    # Status geral
    if db_ok and redis_ok:
        status = "ok"
    elif db_ok or redis_ok:
        status = "degraded"
    else:
        status = "down"

    return HealthResponse(status=status, db=db_ok, redis=redis_ok)


@app.get("/", tags=["root"])
def root() -> dict:
    """Endpoint raiz com informações básicas da API."""
    return {
        "app": "SmartListas API",
        "version": "1.0.0",
        "docs": "/docs" if settings.is_development else None,
        "health": "/health",
    }
