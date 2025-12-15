"""Serviço de normalização de produtos usando IA."""

import json
import logging
import re
import unicodedata
from typing import Optional

from openai import OpenAI
from sqlalchemy.orm import Session

from ..config import settings
from ..models import CanonicalProduct, ProductAlias, Store

logger = logging.getLogger(__name__)


def clean_product_description(text: str) -> str:
    """Remove códigos e caracteres indesejados da descrição."""
    # Remove "(Código: xxxxx)" ou "(CÓDIGO: xxxxx)"
    text = re.sub(r'\s*\(C[óo]digo:\s*\d+\s*\)', '', text, flags=re.IGNORECASE)
    # Remove espaços extras
    return ' '.join(text.split()).strip()


def normalize_text(text: str) -> str:
    """Remove acentos, códigos e converte para maiúsculas."""
    # Primeiro limpa a descrição
    text = clean_product_description(text)
    # Remove acentos
    nfkd = unicodedata.normalize('NFKD', text)
    ascii_text = nfkd.encode('ASCII', 'ignore').decode('ASCII')
    # Maiúsculas e remove espaços extras
    return ' '.join(ascii_text.upper().split())


def extract_product_info_with_ai(descricao: str, client: OpenAI) -> dict:
    """Usa IA para extrair informações estruturadas do produto."""
    
    prompt = f"""Você é um especialista em produtos de supermercado brasileiro. Analise a descrição abaixo e extraia informações estruturadas.

DESCRIÇÃO ORIGINAL: "{descricao}"

INSTRUÇÕES IMPORTANTES:
1. CORRIJA abreviações comuns de cupom fiscal:
   - "AG" ou "AZ" no início geralmente é "Água"
   - "MIN" = "Mineral", "REF" = "Refrigerante", "REFRI" = "Refrigerante"
   - "S/" = "Sem", "C/" = "Com"
   - "INTEG" = "Integral", "DESC" = "Desnatado"
   - "SAB" = "Sabonete", "DET" = "Detergente", "LIMP" = "Limpeza"
   - "HIGI" = "Higiênico", "PAP" = "Papel"
   - "E V" ou "EV" após marca de água = provavelmente parte do nome ou erro de OCR

2. IDENTIFIQUE a marca corretamente:
   - Marcas conhecidas: Gallo, Minalba, Crystal, Nestlé, Bauducco, Panco, Pullman, Wickbold, Ypê, Brilux, Veja, Omo, etc.
   - A marca geralmente vem no início ou após o tipo do produto

3. GERE um nome COMPLETO e DESCRITIVO:
   - Inclua o tipo específico do produto (não apenas "Água", mas "Água Mineral")
   - O nome deve ser claro para qualquer pessoa entender o que é

4. CATEGORIZE corretamente:
   - Bebidas: águas, refrigerantes, sucos, cervejas, vinhos
   - Padaria: pães, bolos, biscoitos
   - Laticínios: leites, queijos, iogurtes, manteigas
   - Hortifruti: frutas, verduras, legumes
   - Limpeza: detergentes, desinfetantes, água sanitária
   - Higiene: sabonetes, shampoos, papel higiênico
   - Mercearia: arroz, feijão, massas, óleos, temperos
   - Carnes: bovinas, suínas, aves
   - Frios: presuntos, mortadelas, queijos fatiados
   - Congelados: pizzas, lasanhas, sorvetes

Retorne um JSON com:
- nome: nome COMPLETO e descritivo do produto (ex: "Água Mineral Sem Gás", não apenas "Água")
- marca: marca identificada (null se não identificável)
- categoria: uma das categorias listadas acima
- subcategoria: tipo específico dentro da categoria
- unidade: un, kg, g, ml ou l
- quantidade: valor numérico da quantidade

EXEMPLOS:
- "AG GALLO E V 500ML" → {{"nome": "Água Mineral", "marca": "Gallo", "categoria": "Bebidas", "subcategoria": "Águas", "unidade": "ml", "quantidade": 500}}
- "PAO PULLMAN INTEG 450G" → {{"nome": "Pão Integral", "marca": "Pullman", "categoria": "Padaria", "subcategoria": "Pães", "unidade": "g", "quantidade": 450}}
- "DET LIMPOL 500ML" → {{"nome": "Detergente Líquido", "marca": "Limpol", "categoria": "Limpeza", "subcategoria": "Detergentes", "unidade": "ml", "quantidade": 500}}
- "BISCOITO BAUDUCCO CHOC 140G" → {{"nome": "Biscoito de Chocolate", "marca": "Bauducco", "categoria": "Padaria", "subcategoria": "Biscoitos", "unidade": "g", "quantidade": 140}}

Retorne APENAS o JSON válido, sem explicações ou markdown."""

    try:
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "Você é um assistente especializado em classificar produtos de supermercado. Responda apenas com JSON válido."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=200
        )
        
        content = response.choices[0].message.content.strip()
        # Remove possíveis marcadores de código
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()
        
        return json.loads(content)
    except Exception as e:
        logger.error(f"Erro ao processar com IA: {e}")
        return {}


def find_or_create_canonical(
    db: Session,
    descricao_original: str,
    loja_id: Optional[int] = None,
    gtin: Optional[str] = None,
    use_ai: bool = True
) -> tuple[CanonicalProduct, ProductAlias, bool]:
    """
    Encontra ou cria um produto canônico para a descrição.
    
    Retorna:
        (CanonicalProduct, ProductAlias, is_new): produto canônico, alias criado, se é novo
    """
    # Mantém a normalização de texto para alias match e delega o restante ao agente mais robusto
    descricao_norm = normalize_text(descricao_original)

    # 1. Busca alias existente (exato)
    alias = db.query(ProductAlias).filter(
        ProductAlias.descricao_normalizada == descricao_norm,
        ProductAlias.loja_id == loja_id
    ).first()

    if alias:
        logger.info(f"Alias existente encontrado: {descricao_norm} -> {alias.canonical_product.nome}")
        return alias.canonical_product, alias, False

    # 2. Delegar para o agente (inclui: GTIN match, IA, variações, tamanho, similaridade)
    from .product_agent import ProductNormalizationAgent

    agent = ProductNormalizationAgent(db, use_ai=use_ai)
    canonical, created_alias, is_new = agent.find_or_create_canonical(
        descricao_original=descricao_original,
        loja_id=loja_id,
        gtin=gtin,
    )

    # 3. Garantir que a normalização do alias fique consistente com normalize_text (mesma usada no match acima)
    if created_alias.descricao_normalizada != descricao_norm:
        created_alias.descricao_normalizada = descricao_norm
        db.flush()

    return canonical, created_alias, is_new


def normalize_existing_products(db: Session, batch_size: int = 50) -> dict:
    """
    Normaliza produtos existentes que ainda não têm produto canônico.
    
    Retorna estatísticas do processamento.
    """
    from ..models import Product
    
    stats = {"processed": 0, "created": 0, "matched": 0, "errors": 0}
    
    # Busca produtos sem canonical_id
    products = db.query(Product).filter(
        Product.canonical_id.is_(None)
    ).limit(batch_size).all()
    
    for product in products:
        try:
            canonical, alias, is_new = find_or_create_canonical(
                db=db,
                descricao_original=product.descricao_norm,
                gtin=product.gtin,
                use_ai=True
            )
            
            # Atualiza produto legado
            product.canonical_id = canonical.id
            
            stats["processed"] += 1
            if is_new:
                stats["created"] += 1
            else:
                stats["matched"] += 1
                
        except Exception as e:
            logger.error(f"Erro ao normalizar produto {product.id}: {e}")
            stats["errors"] += 1
    
    db.commit()
    return stats
