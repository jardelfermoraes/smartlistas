"""
Adapter para consulta de NFC-e na SEFA do Pará.

NOTA: A API da SEFA PA requer captcha, então a consulta automática não é possível.
Este adapter retorna um erro informativo para que o usuário saiba que precisa
inserir os dados manualmente ou usar o QR Code completo.
"""

from typing import Dict, Any
import re


def _normalize_chave(chave: str) -> str:
    """Remove caracteres não numéricos e limita a 44 dígitos."""
    return re.sub(r"\D", "", chave)[:44]


class FetchError(Exception):
    """Erro ao buscar dados da SEFAZ."""
    pass


def consultar_nfce_pa(chave: str) -> Dict[str, Any]:
    """
    Consulta NFC-e na SEFA PA.
    
    NOTA: A API da SEFA PA requer captcha para consulta.
    Por isso, retornamos um erro informativo.
    
    Args:
        chave: Chave de acesso de 44 dígitos
        
    Returns:
        Dict com erro informando que a consulta automática não é possível
    """
    c = _normalize_chave(chave)
    
    if len(c) != 44:
        return {"ok": False, "error": "Chave deve ter 44 dígitos"}
    
    # A API da SEFA PA requer captcha
    # URL: https://app.sefa.pa.gov.br/consulta-nfce-api/api/extranet/chave
    # Parâmetros: chave, captcha (obrigatório)
    
    return {
        "ok": False,
        "error": "A consulta automática não está disponível (SEFAZ PA requer captcha). Use a entrada manual de dados.",
        "source_url": "https://app.sefa.pa.gov.br/consulta-nfce/",
        "data": None,
        "requires_manual": True,
    }


def parse_nfce_json(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extrai dados estruturados do JSON da API da SEFA PA.
    
    Args:
        data: JSON retornado pela API
        
    Returns:
        Dict com dados normalizados
    """
    if not data:
        return {"ok": False, "error": "Dados vazios"}
    
    try:
        # Emitente (loja)
        emitente = data.get("emitente", {}) or {}
        
        # Informações da nota
        info = data.get("informacoes_nota", {}) or {}
        
        # Produtos/itens
        produtos = data.get("produtos", []) or []
        
        # Monta lista de itens
        itens = []
        for idx, prod in enumerate(produtos, 1):
            itens.append({
                "seq": idx,
                "codigo": prod.get("codigo"),
                "descricao": prod.get("nome", ""),
                "qtd": float(prod.get("quantidade", 1) or 1),
                "unidade": prod.get("unidade", "UN"),
                "preco_unit": float(prod.get("valor_unitario", 0) or prod.get("normalizado_valor_unitario", 0) or 0),
                "preco_total": float(prod.get("valor_total_produto", 0) or prod.get("normalizado_valor_total_produto", 0) or 0),
                "gtin": prod.get("codigo"),
            })
        
        # Data de emissão
        data_emissao = None
        if info.get("data_emissao"):
            from datetime import datetime
            try:
                # Tenta diferentes formatos
                for fmt in ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"]:
                    try:
                        data_str = info.get("data_emissao", "")
                        hora_str = info.get("hora_emissao", "00:00:00")
                        data_emissao = datetime.strptime(f"{data_str} {hora_str}", f"{fmt} %H:%M:%S")
                        break
                    except ValueError:
                        continue
            except Exception:
                pass
        
        return {
            "ok": True,
            "cnpj_emissor": emitente.get("cnpj", "").replace(".", "").replace("/", "").replace("-", ""),
            "nome_emissor": emitente.get("nome_razao_social"),
            "endereco_emissor": emitente.get("endereco"),
            "data_emissao": data_emissao,
            "total": float(data.get("valor_total", 0) or data.get("normalizado_valor_total", 0) or 0),
            "itens": itens,
            "numero_nota": info.get("numero"),
            "serie": info.get("serie"),
            "chave_acesso": info.get("chave_acesso"),
        }
        
    except Exception as e:
        return {"ok": False, "error": f"Erro ao processar JSON: {str(e)}"}
