"""Testes para schemas Pydantic."""

import pytest
from pydantic import ValidationError

from app.schemas import (
    ReceiptImportRequest,
    ReceiptStatus,
    extract_chave_from_text,
)


class TestExtractChave:
    """Testes para extração de chave de acesso."""

    def test_extract_from_plain_text(self):
        """Extrai chave de texto simples."""
        text = "15241200000100000100650010000000011000000019"
        assert extract_chave_from_text(text) == text

    def test_extract_from_url(self):
        """Extrai chave de URL."""
        url = "https://example.com/nfce?p=15241200000100000100650010000000011000000019|2|1"
        assert extract_chave_from_text(url) == "15241200000100000100650010000000011000000019"

    def test_extract_from_qr_text(self):
        """Extrai chave de texto de QR code."""
        qr = "NFCe|15241200000100000100650010000000011000000019|2|1|1|1|..."
        assert extract_chave_from_text(qr) == "15241200000100000100650010000000011000000019"

    def test_no_chave_found(self):
        """Retorna None quando não encontra chave."""
        assert extract_chave_from_text("texto sem chave") is None
        assert extract_chave_from_text("12345") is None


class TestReceiptImportRequest:
    """Testes para schema de importação de cupom."""

    def test_valid_chave_acesso(self):
        """Aceita chave de acesso válida."""
        req = ReceiptImportRequest(
            chave_acesso="15241200000100000100650010000000011000000019"
        )
        assert req.chave_acesso == "15241200000100000100650010000000011000000019"

    def test_valid_qr_text(self):
        """Aceita qr_text válido."""
        req = ReceiptImportRequest(
            qr_text="https://example.com?p=15241200000100000100650010000000011000000019"
        )
        assert req.get_chave() == "15241200000100000100650010000000011000000019"

    def test_extracts_chave_from_url(self):
        """Extrai chave de URL no campo chave_acesso."""
        req = ReceiptImportRequest(
            chave_acesso="https://sefaz.pa.gov.br/nfce?chave=15241200000100000100650010000000011000000019"
        )
        assert req.chave_acesso == "15241200000100000100650010000000011000000019"

    def test_requires_at_least_one_field(self):
        """Requer pelo menos um campo preenchido."""
        with pytest.raises(ValidationError) as exc_info:
            ReceiptImportRequest()
        assert "Forneça qr_text ou chave_acesso" in str(exc_info.value)

    def test_invalid_chave_format(self):
        """Rejeita chave com formato inválido."""
        with pytest.raises(ValidationError) as exc_info:
            ReceiptImportRequest(chave_acesso="12345")
        assert "44 dígitos" in str(exc_info.value)

    def test_get_chave_prefers_chave_acesso(self):
        """get_chave() prefere chave_acesso sobre qr_text."""
        req = ReceiptImportRequest(
            chave_acesso="15241200000100000100650010000000011000000019",
            qr_text="https://example.com?p=99999999999999999999999999999999999999999999"
        )
        assert req.get_chave() == "15241200000100000100650010000000011000000019"


class TestReceiptStatus:
    """Testes para enum de status."""

    def test_status_values(self):
        """Verifica valores do enum."""
        assert ReceiptStatus.PENDENTE.value == "pendente"
        assert ReceiptStatus.BAIXADO.value == "baixado"
        assert ReceiptStatus.PROCESSADO.value == "processado"
        assert ReceiptStatus.ERRO.value == "erro"
