"""Script para limpar nomes de produtos existentes."""
import os
import re
os.environ["DATABASE_URL"] = "postgresql+psycopg2://postgres:Jesus@VIda7000@db.snbajvvuegxhnetufazx.supabase.co:5432/postgres"

from app.database import engine
from sqlalchemy import text


def clean_description(text: str) -> str:
    """Remove códigos e caracteres indesejados da descrição."""
    # Remove "(Código: xxxxx)" ou "(CÓDIGO: xxxxx)"
    text = re.sub(r'\s*\(C[óo]digo:\s*\d+\s*\)', '', text, flags=re.IGNORECASE)
    # Remove espaços extras
    return ' '.join(text.split()).strip()


with engine.connect() as conn:
    # Busca produtos com "(Código:" na descrição
    result = conn.execute(text("""
        SELECT id, descricao_norm 
        FROM produtos 
        WHERE descricao_norm ILIKE '%Código:%'
    """))
    
    produtos = list(result)
    print(f"Encontrados {len(produtos)} produtos para limpar")
    
    for produto in produtos:
        id_prod = produto[0]
        desc_antiga = produto[1]
        desc_nova = clean_description(desc_antiga)
        
        print(f"  {id_prod}: '{desc_antiga}' -> '{desc_nova}'")
        
        conn.execute(
            text("UPDATE produtos SET descricao_norm = :desc WHERE id = :id"),
            {"desc": desc_nova, "id": id_prod}
        )
    
    conn.commit()
    print(f"\n{len(produtos)} produtos atualizados!")
    
    # Também limpa produtos canônicos
    result = conn.execute(text("""
        SELECT id, nome 
        FROM produtos_canonicos 
        WHERE nome ILIKE '%Código:%'
    """))
    
    canonicos = list(result)
    print(f"\nEncontrados {len(canonicos)} produtos canônicos para limpar")
    
    for prod in canonicos:
        id_prod = prod[0]
        nome_antigo = prod[1]
        nome_novo = clean_description(nome_antigo)
        
        print(f"  {id_prod}: '{nome_antigo}' -> '{nome_novo}'")
        
        conn.execute(
            text("UPDATE produtos_canonicos SET nome = :nome WHERE id = :id"),
            {"nome": nome_novo, "id": id_prod}
        )
    
    conn.commit()
    print(f"\n{len(canonicos)} produtos canônicos atualizados!")
    
    # Limpa aliases também
    result = conn.execute(text("""
        SELECT id, descricao_original, descricao_normalizada 
        FROM produtos_aliases 
        WHERE descricao_original ILIKE '%Código:%' OR descricao_normalizada ILIKE '%Código:%'
    """))
    
    aliases = list(result)
    print(f"\nEncontrados {len(aliases)} aliases para limpar")
    
    for alias in aliases:
        id_alias = alias[0]
        desc_orig = clean_description(alias[1])
        desc_norm = clean_description(alias[2])
        
        conn.execute(
            text("UPDATE produtos_aliases SET descricao_original = :orig, descricao_normalizada = :norm WHERE id = :id"),
            {"orig": desc_orig, "norm": desc_norm, "id": id_alias}
        )
    
    conn.commit()
    print(f"{len(aliases)} aliases atualizados!")
    
    print("\nLimpeza concluída!")
