"""Routers module."""

from .ocr import router as ocr_router
from .prices import router as prices_router
from .products import router as products_router
from .receipts import router as receipts_router
from .stores import router as stores_router
from .app_shopping import router as app_shopping_router

__all__ = ["ocr_router", "prices_router", "products_router", "receipts_router", "stores_router", "app_shopping_router"]