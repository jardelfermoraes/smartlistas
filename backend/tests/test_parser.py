"""Testes para o parser de NFC-e."""

import pytest

from worker.parsers.nfce_parser import (
    parse_nfce_html,
    _extract_cnpj,
    _extract_datetime,
    _extract_valor,
    _clean_text,
)


class TestExtractCnpj:
    """Testes para extração de CNPJ."""

    def test_cnpj_formatted(self):
        """Extrai CNPJ formatado."""
        assert _extract_cnpj("CNPJ: 12.345.678/0001-90") == "12345678000190"

    def test_cnpj_unformatted(self):
        """Extrai CNPJ sem formatação."""
        assert _extract_cnpj("CNPJ: 12345678000190") == "12345678000190"

    def test_cnpj_in_text(self):
        """Extrai CNPJ de texto maior."""
        text = "Empresa XYZ - CNPJ: 12.345.678/0001-90 - Endereço..."
        assert _extract_cnpj(text) == "12345678000190"

    def test_no_cnpj(self):
        """Retorna None quando não há CNPJ."""
        assert _extract_cnpj("texto sem cnpj") is None


class TestExtractDatetime:
    """Testes para extração de datetime."""

    def test_datetime_br_format(self):
        """Extrai datetime no formato brasileiro."""
        dt = _extract_datetime("Emissão: 15/12/2024 14:30:00")
        assert dt is not None
        assert dt.day == 15
        assert dt.month == 12
        assert dt.year == 2024
        assert dt.hour == 14
        assert dt.minute == 30

    def test_date_only(self):
        """Extrai apenas data."""
        dt = _extract_datetime("Data: 15/12/2024")
        assert dt is not None
        assert dt.day == 15
        assert dt.month == 12

    def test_iso_format(self):
        """Extrai datetime no formato ISO."""
        dt = _extract_datetime("2024-12-15T14:30:00")
        assert dt is not None
        assert dt.year == 2024

    def test_no_datetime(self):
        """Retorna None quando não há datetime."""
        assert _extract_datetime("texto sem data") is None


class TestExtractValor:
    """Testes para extração de valores monetários."""

    def test_valor_br_format(self):
        """Extrai valor no formato brasileiro."""
        assert _extract_valor("R$ 1.234,56") == 1234.56

    def test_valor_simple(self):
        """Extrai valor simples."""
        assert _extract_valor("15,90") == 15.90

    def test_valor_with_currency(self):
        """Extrai valor com símbolo de moeda."""
        assert _extract_valor("R$15,90") == 15.90

    def test_valor_us_format(self):
        """Extrai valor no formato americano."""
        assert _extract_valor("1,234.56") == 1234.56

    def test_valor_integer(self):
        """Extrai valor inteiro."""
        assert _extract_valor("100") == 100.0

    def test_no_valor(self):
        """Retorna 0 quando não há valor."""
        assert _extract_valor("sem valor") == 0.0
        assert _extract_valor("") == 0.0


class TestCleanText:
    """Testes para limpeza de texto."""

    def test_removes_extra_spaces(self):
        """Remove espaços extras."""
        assert _clean_text("  texto   com   espaços  ") == "texto com espaços"

    def test_removes_newlines(self):
        """Remove quebras de linha."""
        assert _clean_text("linha1\nlinha2\n") == "linha1 linha2"

    def test_empty_string(self):
        """Retorna string vazia para entrada vazia."""
        assert _clean_text("") == ""
        assert _clean_text(None) == ""


class TestParseNfceHtml:
    """Testes para parser completo de NFC-e."""

    def test_parse_empty_html(self):
        """Retorna erro para HTML vazio."""
        result = parse_nfce_html("")
        assert result["ok"] is False

    def test_parse_invalid_html(self):
        """Tenta parsear HTML inválido."""
        result = parse_nfce_html("<html><body>Conteúdo inválido</body></html>")
        # Pode retornar ok=False ou ok=True com dados vazios
        assert "ok" in result

    def test_parse_sample_nfce(self):
        """Parseia HTML de exemplo de NFC-e."""
        html = """
        <html>
        <body>
            <div class="txtTopo">SUPERMERCADO EXEMPLO LTDA</div>
            <span class="CNPJ">CNPJ: 12.345.678/0001-90</span>
            <div class="enderEmit">Rua Exemplo, 123 - BELÉM - PA</div>
            <span class="dhEmissao">15/12/2024 14:30:00</span>
            <tr class="Item">
                <span class="txtTit">ARROZ TIPO 1 5KG</span>
                <span class="Rqtd">2,000</span>
                <span class="RUN">UN</span>
                <span class="RvlUnit">15,90</span>
                <span class="valor">31,80</span>
            </tr>
            <tr class="Item">
                <span class="txtTit">FEIJÃO CARIOCA 1KG</span>
                <span class="Rqtd">3,000</span>
                <span class="RUN">UN</span>
                <span class="RvlUnit">8,50</span>
                <span class="valor">25,50</span>
            </tr>
            <span class="totalNumb">57,30</span>
        </body>
        </html>
        """
        result = parse_nfce_html(html)

        assert result["ok"] is True
        assert result["cnpj_emissor"] == "12345678000190"
        assert result["nome_emissor"] == "SUPERMERCADO EXEMPLO LTDA"
        assert result["total"] == 57.30
        assert len(result["itens"]) == 2

        # Verifica primeiro item
        item1 = result["itens"][0]
        assert "ARROZ" in item1["descricao"]
        assert item1["qtd"] == 2.0
        assert item1["preco_unit"] == 15.90
