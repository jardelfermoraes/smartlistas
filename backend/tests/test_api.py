"""Testes para endpoints da API."""

import pytest
from unittest.mock import patch, MagicMock

from app.models import Receipt


class TestHealthEndpoint:
    """Testes para endpoint /health."""

    def test_health_check(self, client):
        """Health check retorna status."""
        with patch("app.main.Redis") as mock_redis:
            mock_redis.from_url.return_value.ping.return_value = True
            response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "db" in data
        assert "redis" in data


class TestRootEndpoint:
    """Testes para endpoint /."""

    def test_root(self, client):
        """Root retorna informações da API."""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["app"] == "MelhorCompra API"
        assert "version" in data


class TestReceiptsEndpoints:
    """Testes para endpoints /receipts."""

    def test_list_receipts_empty(self, client):
        """Lista vazia quando não há cupons."""
        response = client.get("/receipts/")
        assert response.status_code == 200
        data = response.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_list_receipts_with_pagination(self, client, db_session, sample_receipt_data):
        """Lista cupons com paginação."""
        # Cria alguns cupons
        for i in range(5):
            chave = f"1524120000010000010065001000000001100000001{i}"
            receipt = Receipt(
                chave_acesso=chave,
                cnpj_emissor=sample_receipt_data["cnpj_emissor"],
                estado="PA",
                status="pendente",
            )
            db_session.add(receipt)
        db_session.commit()

        response = client.get("/receipts/?page=1&page_size=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 2
        assert data["total"] == 5
        assert data["pages"] == 3

    def test_get_receipt_not_found(self, client, sample_chave):
        """Retorna 404 para cupom não encontrado."""
        response = client.get(f"/receipts/{sample_chave}")
        assert response.status_code == 404
        assert "não encontrado" in response.json()["detail"]

    def test_get_receipt_invalid_chave(self, client):
        """Retorna 400 para chave inválida."""
        response = client.get("/receipts/12345")
        assert response.status_code == 400
        assert "inválida" in response.json()["detail"]

    def test_get_receipt_success(self, client, db_session, sample_chave):
        """Retorna cupom existente."""
        receipt = Receipt(
            chave_acesso=sample_chave,
            cnpj_emissor="00000100000100",
            estado="PA",
            status="processado",
            total=100.50,
        )
        db_session.add(receipt)
        db_session.commit()

        response = client.get(f"/receipts/{sample_chave}")
        assert response.status_code == 200
        data = response.json()
        assert data["chave_acesso"] == sample_chave
        assert data["total"] == 100.50

    @patch("app.routers.receipts.get_queue")
    def test_import_receipt(self, mock_queue, client, sample_chave):
        """Importa cupom com sucesso."""
        mock_job = MagicMock()
        mock_job.id = "test-job-id"
        mock_job.get_status.return_value = "queued"
        mock_queue.return_value.enqueue.return_value = mock_job

        response = client.post(
            "/receipts/import",
            json={"chave_acesso": sample_chave}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == "test-job-id"
        assert data["status"] == "queued"

    def test_import_receipt_invalid_payload(self, client):
        """Rejeita payload sem chave válida."""
        response = client.post(
            "/receipts/import",
            json={"chave_acesso": "12345"}
        )
        assert response.status_code == 422  # Validation error

    def test_delete_receipt(self, client, db_session, sample_chave):
        """Remove cupom existente."""
        receipt = Receipt(
            chave_acesso=sample_chave,
            estado="PA",
            status="pendente",
        )
        db_session.add(receipt)
        db_session.commit()

        response = client.delete(f"/receipts/{sample_chave}")
        assert response.status_code == 200
        assert "removido" in response.json()["message"]

        # Verifica que foi removido
        assert db_session.get(Receipt, sample_chave) is None

    def test_delete_receipt_not_found(self, client, sample_chave):
        """Retorna 404 ao tentar remover cupom inexistente."""
        response = client.delete(f"/receipts/{sample_chave}")
        assert response.status_code == 404
