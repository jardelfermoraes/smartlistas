"""Configuração de fixtures para testes."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app


# Banco de dados em memória para testes
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Cria uma sessão de banco de dados para testes."""
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Cria um cliente de teste com banco de dados isolado."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_chave():
    """Retorna uma chave de acesso válida para testes."""
    return "15241200000100000100650010000000011000000019"


@pytest.fixture
def sample_receipt_data():
    """Retorna dados de exemplo para um cupom."""
    return {
        "chave_acesso": "15241200000100000100650010000000011000000019",
        "cnpj_emissor": "00000100000100",
        "estado": "PA",
        "tipo": "NFC-e",
        "status": "pendente",
        "total": 150.50,
    }
