"""Configuração do banco de dados e sessões SQLAlchemy."""

from collections.abc import Generator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

# URL do banco com senha codificada
# Supabase: postgres:Jesus@VIda7000@db.snbajvvuegxhnetufazx.supabase.co
DATABASE_URL = settings.database_url

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,
    connect_args={"client_encoding": "utf8"},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class para todos os models SQLAlchemy."""

    pass


def get_db() -> Generator[Session, None, None]:
    """Dependency que fornece uma sessão do banco de dados."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Type alias para uso com Depends
DbSession = Annotated[Session, Depends(get_db)]
