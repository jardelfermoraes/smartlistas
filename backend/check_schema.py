"""Script para corrigir constraint de precos."""
import os
os.environ["DATABASE_URL"] = "postgresql+psycopg2://postgres:Jesus@VIda7000@db.snbajvvuegxhnetufazx.supabase.co:5432/postgres"

from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Tornar produto_id nullable em precos
    print("Tornando produto_id nullable em precos...")
    try:
        conn.execute(text("ALTER TABLE precos ALTER COLUMN produto_id DROP NOT NULL"))
        conn.commit()
        print("  OK!")
    except Exception as e:
        print(f"  Erro ou já está nullable: {e}")
        conn.rollback()
    
    print("Pronto!")
    # Dropar tabelas se existirem (na ordem correta por causa das FKs)
    print("Dropando tabelas existentes...")
    conn.execute(text("DROP TABLE IF EXISTS produtos_aliases CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS produtos_canonicos CASCADE"))
    conn.commit()
    
    # Criar tabela produtos_canonicos
    print("Criando tabela produtos_canonicos...")
    conn.execute(text("""
        CREATE TABLE produtos_canonicos (
            id SERIAL PRIMARY KEY,
            nome VARCHAR(255) NOT NULL,
            marca VARCHAR(120),
            categoria VARCHAR(120),
            subcategoria VARCHAR(120),
            unidade_padrao VARCHAR(10) NOT NULL DEFAULT 'un',
            quantidade_padrao FLOAT,
            gtin_principal VARCHAR(32) UNIQUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """))
    conn.execute(text("CREATE INDEX ix_produtos_canonicos_nome ON produtos_canonicos(nome)"))
    conn.execute(text("CREATE INDEX ix_produtos_canonicos_marca ON produtos_canonicos(marca)"))
    conn.execute(text("CREATE INDEX ix_produtos_canonicos_categoria ON produtos_canonicos(categoria)"))
    conn.execute(text("CREATE INDEX ix_canonicos_nome_marca ON produtos_canonicos(nome, marca)"))
    conn.commit()
    print("  OK!")
    
    # Criar tabela produtos_aliases
    print("Criando tabela produtos_aliases...")
    conn.execute(text("""
        CREATE TABLE produtos_aliases (
            id SERIAL PRIMARY KEY,
            canonical_id INTEGER NOT NULL REFERENCES produtos_canonicos(id) ON DELETE CASCADE,
            loja_id INTEGER REFERENCES lojas(id) ON DELETE SET NULL,
            descricao_original VARCHAR(255) NOT NULL,
            descricao_normalizada VARCHAR(255) NOT NULL,
            gtin VARCHAR(32),
            confianca FLOAT DEFAULT 1.0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(descricao_normalizada, loja_id)
        )
    """))
    conn.execute(text("CREATE INDEX ix_produtos_aliases_canonical_id ON produtos_aliases(canonical_id)"))
    conn.execute(text("CREATE INDEX ix_produtos_aliases_loja_id ON produtos_aliases(loja_id)"))
    conn.execute(text("CREATE INDEX ix_produtos_aliases_descricao_normalizada ON produtos_aliases(descricao_normalizada)"))
    conn.execute(text("CREATE INDEX ix_produtos_aliases_gtin ON produtos_aliases(gtin)"))
    conn.commit()
    print("  OK!")
    
    # Adicionar coluna canonical_id em produtos se não existir
    print("Adicionando canonical_id em produtos...")
    try:
        conn.execute(text("ALTER TABLE produtos ADD COLUMN canonical_id INTEGER REFERENCES produtos_canonicos(id)"))
        conn.execute(text("CREATE INDEX ix_produtos_canonical_id ON produtos(canonical_id)"))
        conn.commit()
        print("  OK!")
    except Exception as e:
        if "already exists" in str(e):
            print("  Já existe!")
        else:
            print(f"  Erro: {e}")
    
    # Adicionar coluna canonical_id em precos se não existir
    print("Adicionando canonical_id em precos...")
    try:
        conn.execute(text("ALTER TABLE precos ADD COLUMN canonical_id INTEGER REFERENCES produtos_canonicos(id)"))
        conn.execute(text("CREATE INDEX ix_precos_canonical_id ON precos(canonical_id)"))
        conn.commit()
        print("  OK!")
    except Exception as e:
        if "already exists" in str(e):
            print("  Já existe!")
        else:
            print(f"  Erro: {e}")
    
    print("\nTabelas criadas com sucesso!")
