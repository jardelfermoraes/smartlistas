"""
Adapter para consulta de NFC-e do Pará via Portal antigo.

Este portal parece não exigir captcha para consulta por chave.
"""

import asyncio
import logging
import re
from typing import Any

from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

# URL do portal antigo
PORTAL_URL = "https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam"


async def consultar_nfce_portal_async(chave: str) -> dict[str, Any]:
    """
    Consulta NFC-e do Pará via portal antigo.
    """
    # Limpa a chave
    chave = re.sub(r'\D', '', chave)
    if len(chave) != 44:
        raise ValueError(f"Chave deve ter 44 dígitos, tem {len(chave)}")
    
    logger.info(f"Consultando NFC-e PA via portal: {chave[:20]}...")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            ignore_https_errors=True
        )
        page = await context.new_page()
        
        try:
            # Acessa a página
            logger.info("Acessando portal SEFAZ PA...")
            await page.goto(PORTAL_URL, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(2000)
            
            # Procura o campo de chave
            logger.info("Preenchendo chave de acesso...")
            input_selector = 'input[id*="chave"], input[name*="chave"], input[type="text"]'
            await page.wait_for_selector(input_selector, timeout=10000)
            await page.fill(input_selector, chave)
            await page.wait_for_timeout(500)
            
            # Clica no botão consultar
            logger.info("Clicando em Consultar...")
            btn_selector = 'input[type="submit"], button[type="submit"], input[value*="Consultar"], button:has-text("Consultar")'
            await page.click(btn_selector)
            
            # Aguarda o resultado
            await page.wait_for_timeout(5000)
            
            # Extrai os dados da página
            logger.info("Extraindo dados...")
            html = await page.content()
            
            # Salva para debug
            with open("portal_debug.html", "w", encoding="utf-8") as f:
                f.write(html)
            
            return parse_portal_html(html)
            
        finally:
            await browser.close()


def parse_portal_html(html: str) -> dict[str, Any]:
    """Extrai dados do HTML do portal."""
    
    result = {
        "ok": True,
        "emitente": {},
        "produtos": [],
        "valor_total": 0,
        "informacoes_nota": {},
    }
    
    # Extrai CNPJ
    cnpj_match = re.search(r'CNPJ[:\s]*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})', html, re.I)
    if cnpj_match:
        result["emitente"]["cnpj"] = re.sub(r'\D', '', cnpj_match.group(1))
    
    # Extrai nome/razão social
    nome_match = re.search(r'(?:Razão Social|Nome)[:\s]*</?\w*>?\s*([^<\n]+)', html, re.I)
    if nome_match:
        result["emitente"]["nome"] = nome_match.group(1).strip()
    
    # Extrai valor total
    total_match = re.search(r'Valor\s*(?:a\s*)?(?:pagar|Total)[:\s]*R?\$?\s*([\d.,]+)', html, re.I)
    if total_match:
        total_str = total_match.group(1).replace('.', '').replace(',', '.')
        try:
            result["valor_total"] = float(total_str)
        except:
            pass
    
    # Extrai produtos da tabela
    # Padrão: descrição, código, quantidade, unidade, valor unitário, valor total
    produto_rows = re.findall(
        r'<tr[^>]*>.*?<td[^>]*>([^<]+)</td>.*?<td[^>]*>(\d+)</td>.*?<td[^>]*>([\d,]+)</td>.*?<td[^>]*>([\d,]+)</td>.*?</tr>',
        html,
        re.I | re.S
    )
    
    for idx, row in enumerate(produto_rows, 1):
        try:
            result["produtos"].append({
                "seq": idx,
                "descricao": row[0].strip(),
                "qtd": float(row[1]),
                "unidade": "UN",
                "preco_unit": float(row[2].replace(',', '.')),
                "preco_total": float(row[3].replace(',', '.')),
            })
        except:
            pass
    
    return result


def consultar_nfce_portal(chave: str) -> dict[str, Any]:
    """Versão síncrona."""
    return asyncio.run(consultar_nfce_portal_async(chave))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    chave = "15251209634089000201650140001932319401633787"
    
    try:
        result = consultar_nfce_portal(chave)
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Erro: {e}")
