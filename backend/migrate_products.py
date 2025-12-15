"""Script para migrar produtos legados para canônicos."""
import os

# Configure via variáveis de ambiente:
# - DATABASE_URL
# - OPENAI_API_KEY (opcional)

from app.database import SessionLocal
from app.models import Product, CanonicalProduct, ProductAlias, Price
from app.services.product_normalizer import find_or_create_canonical

db = SessionLocal()

try:
    # Busca produtos legados que não têm canônico associado
    produtos = db.query(Product).all()
    print(f"Encontrados {len(produtos)} produtos legados para migrar")
    
    migrados = 0
    erros = 0
    
    for produto in produtos:
        try:
            # Verifica se já existe alias para esta descrição
            alias_existente = db.query(ProductAlias).filter(
                ProductAlias.descricao_normalizada == produto.descricao_norm
            ).first()
            
            if alias_existente:
                print(f"  [SKIP] {produto.descricao_norm} - já tem alias")
                continue
            
            # Usa o normalizador para criar canônico
            canonical, alias, is_new = find_or_create_canonical(
                db=db,
                descricao_original=produto.descricao_norm,
                loja_id=None,  # Sem loja específica
                gtin=produto.gtin,
                use_ai=True
            )
            
            # Migra os preços do produto legado para o canônico
            precos_migrados = db.query(Price).filter(
                Price.produto_id == produto.id
            ).update({"canonical_id": canonical.id, "produto_id": None})
            
            print(f"  [OK] {produto.descricao_norm} -> {canonical.nome} ({precos_migrados} preços)")
            migrados += 1
            
        except Exception as e:
            print(f"  [ERRO] {produto.descricao_norm}: {e}")
            erros += 1
    
    db.commit()
    print(f"\nMigração concluída: {migrados} migrados, {erros} erros")
    
finally:
    db.close()
