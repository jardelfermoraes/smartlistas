"""Parser para extrair dados de páginas HTML de NFC-e."""

import logging
import re
from datetime import datetime
from typing import Any

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


def parse_nfce_html(html: str) -> dict[str, Any]:
    """
    Parseia o HTML de uma NFC-e e extrai os dados relevantes.

    Args:
        html: Conteúdo HTML da página da NFC-e

    Returns:
        dict com os dados extraídos:
        - ok: bool indicando sucesso
        - cnpj_emissor: CNPJ do estabelecimento
        - nome_emissor: Nome/razão social
        - endereco_emissor: Endereço completo
        - cidade_emissor: Cidade
        - uf_emissor: UF
        - data_emissao: datetime da emissão
        - total: valor total
        - itens: lista de itens
        - error: mensagem de erro (se ok=False)
    """
    try:
        soup = BeautifulSoup(html, "lxml")

        # Tenta diferentes estratégias de parsing
        result = _try_parse_standard(soup)
        if result.get("ok"):
            return result

        result = _try_parse_svrs(soup)
        if result.get("ok"):
            return result

        result = _try_parse_generic(soup)
        if result.get("ok"):
            return result

        return {"ok": False, "error": "Não foi possível extrair dados do HTML"}

    except Exception as e:
        logger.exception(f"Erro ao parsear HTML: {e}")
        return {"ok": False, "error": str(e)}


def _try_parse_standard(soup: BeautifulSoup) -> dict[str, Any]:
    """Tenta parsear formato padrão de NFC-e (PA, maioria dos estados)."""
    try:
        result = {
            "ok": False,
            "cnpj_emissor": None,
            "nome_emissor": None,
            "endereco_emissor": None,
            "cidade_emissor": None,
            "uf_emissor": None,
            "data_emissao": None,
            "total": 0.0,
            "itens": [],
        }

        # === Dados do Emissor ===

        # CNPJ - várias formas de encontrar
        cnpj_patterns = [
            soup.find("span", class_="CNPJ"),
            soup.find("span", {"id": re.compile(r".*cnpj.*", re.I)}),
            soup.find(string=re.compile(r"CNPJ.*?(\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2})", re.I)),
        ]
        for pattern in cnpj_patterns:
            if pattern:
                cnpj = _extract_cnpj(str(pattern))
                if cnpj:
                    result["cnpj_emissor"] = cnpj
                    break

        # Nome do emissor
        nome_elem = (
            soup.find("div", class_="txtTopo") or
            soup.find("div", class_="emit") or
            soup.find("span", class_="txtTopo")
        )
        if nome_elem:
            result["nome_emissor"] = _clean_text(nome_elem.get_text())

        # Endereço
        endereco_elem = (
            soup.find("div", class_="enderEmit") or
            soup.find("div", class_="txtEnder") or
            soup.find("span", class_="endereco")
        )
        if endereco_elem:
            endereco_text = _clean_text(endereco_elem.get_text())
            result["endereco_emissor"] = endereco_text
            # Tenta extrair cidade e UF
            cidade_uf = _extract_cidade_uf(endereco_text)
            if cidade_uf:
                result["cidade_emissor"] = cidade_uf.get("cidade")
                result["uf_emissor"] = cidade_uf.get("uf")

        # === Data de Emissão ===
        data_patterns = [
            soup.find("span", class_="dhEmissao"),
            soup.find("span", {"id": re.compile(r".*data.*emissao.*", re.I)}),
            soup.find(string=re.compile(r"Emissão.*?(\d{2}/\d{2}/\d{4})", re.I)),
        ]
        for pattern in data_patterns:
            if pattern:
                data = _extract_datetime(str(pattern))
                if data:
                    result["data_emissao"] = data
                    break

        # === Total ===
        total_patterns = [
            soup.find("span", class_="totalNumb"),
            soup.find("span", class_="txtMax"),
            soup.find("span", {"id": re.compile(r".*total.*", re.I)}),
        ]
        for pattern in total_patterns:
            if pattern:
                total = _extract_valor(pattern.get_text())
                if total > 0:
                    result["total"] = total
                    break

        # Se não encontrou total nos spans, procura em texto
        if result["total"] == 0:
            total_text = soup.find(string=re.compile(r"Total.*?R\$\s*[\d.,]+", re.I))
            if total_text:
                result["total"] = _extract_valor(str(total_text))

        # === Itens ===
        result["itens"] = _parse_items_standard(soup)

        # Valida se conseguiu extrair dados mínimos
        if result["itens"] or result["cnpj_emissor"]:
            result["ok"] = True

        return result

    except Exception as e:
        logger.debug(f"Parse standard falhou: {e}")
        return {"ok": False, "error": str(e)}


def _try_parse_svrs(soup: BeautifulSoup) -> dict[str, Any]:
    """Tenta parsear formato SVRS (SEFAZ Virtual RS)."""
    try:
        result = {
            "ok": False,
            "cnpj_emissor": None,
            "nome_emissor": None,
            "endereco_emissor": None,
            "cidade_emissor": None,
            "uf_emissor": None,
            "data_emissao": None,
            "total": 0.0,
            "itens": [],
        }

        # SVRS usa estrutura de tabelas
        tables = soup.find_all("table")

        for table in tables:
            text = table.get_text()

            # Procura CNPJ
            if not result["cnpj_emissor"]:
                cnpj = _extract_cnpj(text)
                if cnpj:
                    result["cnpj_emissor"] = cnpj

            # Procura total
            if "Total" in text or "TOTAL" in text:
                total = _extract_valor(text)
                if total > 0:
                    result["total"] = total

        # Itens em SVRS geralmente estão em tabela específica
        item_table = soup.find("table", {"id": re.compile(r".*item.*", re.I)})
        if item_table:
            result["itens"] = _parse_items_table(item_table)
        else:
            result["itens"] = _parse_items_generic(soup)

        if result["itens"] or result["cnpj_emissor"]:
            result["ok"] = True

        return result

    except Exception as e:
        logger.debug(f"Parse SVRS falhou: {e}")
        return {"ok": False, "error": str(e)}


def _try_parse_generic(soup: BeautifulSoup) -> dict[str, Any]:
    """Parser genérico como fallback."""
    try:
        result = {
            "ok": False,
            "cnpj_emissor": None,
            "nome_emissor": None,
            "endereco_emissor": None,
            "cidade_emissor": None,
            "uf_emissor": None,
            "data_emissao": None,
            "total": 0.0,
            "itens": [],
        }

        full_text = soup.get_text()

        # CNPJ
        result["cnpj_emissor"] = _extract_cnpj(full_text)

        # Data
        result["data_emissao"] = _extract_datetime(full_text)

        # Total - procura padrões comuns
        total_match = re.search(
            r"(?:Total|TOTAL|Valor\s+Total).*?R?\$?\s*([\d.,]+)",
            full_text,
            re.I
        )
        if total_match:
            result["total"] = _extract_valor(total_match.group(1))

        # Itens
        result["itens"] = _parse_items_generic(soup)

        if result["itens"] or result["cnpj_emissor"]:
            result["ok"] = True

        return result

    except Exception as e:
        logger.debug(f"Parse genérico falhou: {e}")
        return {"ok": False, "error": str(e)}


def _parse_items_standard(soup: BeautifulSoup) -> list[dict]:
    """Parseia itens no formato padrão."""
    items = []

    # Procura container de itens
    item_containers = (
        soup.find_all("tr", class_="Item") or
        soup.find_all("div", class_="Item") or
        soup.find_all("tr", class_=re.compile(r".*item.*", re.I))
    )

    for idx, container in enumerate(item_containers, start=1):
        try:
            item = _extract_item_data(container, idx)
            if item:
                items.append(item)
        except Exception as e:
            logger.debug(f"Erro ao parsear item {idx}: {e}")
            continue

    # Se não encontrou items em containers, tenta tabela
    if not items:
        items = _parse_items_generic(soup)

    return items


def _parse_items_table(table) -> list[dict]:
    """Parseia itens de uma tabela HTML."""
    items = []
    rows = table.find_all("tr")

    for idx, row in enumerate(rows[1:], start=1):  # Pula header
        cells = row.find_all(["td", "th"])
        if len(cells) >= 3:
            try:
                item = {
                    "descricao": _clean_text(cells[0].get_text()),
                    "qtd": _extract_valor(cells[1].get_text()) or 1.0,
                    "unidade": "un",
                    "preco_unit": 0.0,
                    "preco_total": 0.0,
                    "desconto": 0.0,
                    "gtin": None,
                    "ncm": None,
                }

                # Tenta extrair mais dados se houver mais colunas
                if len(cells) >= 4:
                    item["preco_unit"] = _extract_valor(cells[2].get_text())
                    item["preco_total"] = _extract_valor(cells[3].get_text())
                elif len(cells) >= 3:
                    item["preco_total"] = _extract_valor(cells[2].get_text())
                    if item["qtd"] > 0:
                        item["preco_unit"] = item["preco_total"] / item["qtd"]

                if item["descricao"]:
                    items.append(item)

            except Exception as e:
                logger.debug(f"Erro ao parsear linha de tabela: {e}")
                continue

    return items


def _parse_items_generic(soup: BeautifulSoup) -> list[dict]:
    """Parser genérico de itens usando regex no texto."""
    items = []
    full_text = soup.get_text()

    # Padrão comum: "DESCRICAO QTD UN VALOR"
    # Exemplo: "ARROZ TIPO 1 5KG    2,000 UN    15,90    31,80"
    pattern = re.compile(
        r"([A-Z][A-Z0-9\s\-\.]+?)\s+"  # Descrição
        r"(\d+[,.]?\d*)\s*"             # Quantidade
        r"(UN|KG|L|ML|G|PCT|CX|DZ|M|M2|M3)?\s*"  # Unidade (opcional)
        r"R?\$?\s*(\d+[,.]?\d{2})\s*"   # Preço unitário ou total
        r"(?:R?\$?\s*(\d+[,.]?\d{2}))?", # Preço total (opcional)
        re.I | re.M
    )

    matches = pattern.findall(full_text)
    for idx, match in enumerate(matches[:50], start=1):  # Limita a 50 itens
        try:
            descricao = _clean_text(match[0])
            if len(descricao) < 3:
                continue

            qtd = _extract_valor(match[1]) or 1.0
            unidade = match[2].upper() if match[2] else "UN"
            preco1 = _extract_valor(match[3])
            preco2 = _extract_valor(match[4]) if match[4] else 0.0

            # Determina preço unitário e total
            if preco2 > 0:
                preco_unit = preco1
                preco_total = preco2
            else:
                preco_total = preco1
                preco_unit = preco_total / qtd if qtd > 0 else preco_total

            item = {
                "descricao": descricao,
                "qtd": qtd,
                "unidade": unidade,
                "preco_unit": preco_unit,
                "preco_total": preco_total,
                "desconto": 0.0,
                "gtin": None,
                "ncm": None,
            }
            items.append(item)

        except Exception as e:
            logger.debug(f"Erro ao parsear item genérico: {e}")
            continue

    return items


def _extract_item_data(container, idx: int) -> dict | None:
    """Extrai dados de um container de item."""
    try:
        # Descrição
        desc_elem = (
            container.find("span", class_="txtTit") or
            container.find("span", class_="descricao") or
            container.find("td", class_="descricao")
        )
        descricao = _clean_text(desc_elem.get_text()) if desc_elem else ""

        if not descricao:
            # Tenta pegar primeiro texto significativo
            descricao = _clean_text(container.get_text().split("\n")[0])

        if len(descricao) < 3:
            return None

        # Quantidade
        qtd_elem = (
            container.find("span", class_="Rqtd") or
            container.find("span", class_="qtd")
        )
        qtd = _extract_valor(qtd_elem.get_text()) if qtd_elem else 1.0

        # Unidade
        un_elem = container.find("span", class_="RUN")
        unidade = _clean_text(un_elem.get_text()) if un_elem else "UN"

        # Preço unitário
        vun_elem = (
            container.find("span", class_="RvlUnit") or
            container.find("span", class_="vlUnit")
        )
        preco_unit = _extract_valor(vun_elem.get_text()) if vun_elem else 0.0

        # Preço total
        vtotal_elem = (
            container.find("span", class_="valor") or
            container.find("span", class_="vlTotal")
        )
        preco_total = _extract_valor(vtotal_elem.get_text()) if vtotal_elem else 0.0

        # Se não tem preço unitário, calcula
        if preco_unit == 0 and preco_total > 0 and qtd > 0:
            preco_unit = preco_total / qtd

        # GTIN/EAN
        gtin_elem = container.find("span", class_="RCod")
        gtin = _clean_text(gtin_elem.get_text()) if gtin_elem else None
        if gtin and not re.match(r"^\d{8,14}$", gtin):
            gtin = None

        return {
            "descricao": descricao,
            "qtd": qtd,
            "unidade": unidade[:10],
            "preco_unit": preco_unit,
            "preco_total": preco_total,
            "desconto": 0.0,
            "gtin": gtin,
            "ncm": None,
        }

    except Exception as e:
        logger.debug(f"Erro ao extrair dados do item {idx}: {e}")
        return None


# === Funções auxiliares ===


def _clean_text(text: str) -> str:
    """Limpa e normaliza texto."""
    if not text:
        return ""
    # Remove espaços extras e quebras de linha
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_cnpj(text: str) -> str | None:
    """Extrai CNPJ de um texto."""
    # Formato: XX.XXX.XXX/XXXX-XX ou XXXXXXXXXXXXXX
    match = re.search(r"(\d{2}\.?\d{3}\.?\d{3}/?\.?\d{4}-?\d{2})", text)
    if match:
        # Remove formatação
        cnpj = re.sub(r"\D", "", match.group(1))
        if len(cnpj) == 14:
            return cnpj
    return None


def _extract_datetime(text: str) -> datetime | None:
    """Extrai datetime de um texto."""
    # Formatos comuns: DD/MM/YYYY HH:MM:SS ou DD/MM/YYYY
    patterns = [
        (r"(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2}:\d{2})", "%d/%m/%Y %H:%M:%S"),
        (r"(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})", "%d/%m/%Y %H:%M"),
        (r"(\d{2}/\d{2}/\d{4})", "%d/%m/%Y"),
        (r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})", "%Y-%m-%dT%H:%M:%S"),
    ]

    for pattern, fmt in patterns:
        match = re.search(pattern, text)
        if match:
            try:
                date_str = " ".join(match.groups())
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue

    return None


def _extract_valor(text: str) -> float:
    """Extrai valor numérico de um texto."""
    if not text:
        return 0.0

    # Remove R$ e espaços
    text = re.sub(r"R\$\s*", "", text)

    # Procura número no formato brasileiro (1.234,56) ou americano (1,234.56)
    match = re.search(r"([\d.,]+)", text)
    if match:
        num_str = match.group(1)

        # Detecta formato
        if "," in num_str and "." in num_str:
            # Formato brasileiro: 1.234,56
            if num_str.rfind(",") > num_str.rfind("."):
                num_str = num_str.replace(".", "").replace(",", ".")
            # Formato americano: 1,234.56
            else:
                num_str = num_str.replace(",", "")
        elif "," in num_str:
            # Assume brasileiro: 1234,56
            num_str = num_str.replace(",", ".")

        try:
            return float(num_str)
        except ValueError:
            pass

    return 0.0


def _extract_cidade_uf(endereco: str) -> dict | None:
    """Extrai cidade e UF de um endereço."""
    # Padrão: "... CIDADE - UF" ou "... CIDADE/UF"
    match = re.search(r"([A-Za-zÀ-ú\s]+)\s*[-/]\s*([A-Z]{2})\s*$", endereco)
    if match:
        return {
            "cidade": _clean_text(match.group(1)),
            "uf": match.group(2).upper(),
        }
    return None
