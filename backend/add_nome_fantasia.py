"""Script para adicionar nome_fantasia na tabela lojas."""
import os
os.environ["DATABASE_URL"] = "postgresql+psycopg2://postgres:Jesus@VIda7000@db.snbajvvuegxhnetufazx.supabase.co:5432/postgres"

from app.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    # Adicionar coluna nome_fantasia
    print("Adicionando coluna nome_fantasia...")
    try:
        conn.execute(text("ALTER TABLE lojas ADD COLUMN nome_fantasia VARCHAR(255)"))
        conn.commit()
        print("  OK!")
    except Exception as e:
        if "already exists" in str(e):
            print("  Já existe!")
        else:
            print(f"  Erro: {e}")
        conn.rollback()
    
    # Adicionar coluna telefone
    print("Adicionando coluna telefone...")
    try:
        conn.execute(text("ALTER TABLE lojas ADD COLUMN telefone VARCHAR(20)"))
        conn.commit()
        print("  OK!")
    except Exception as e:
        if "already exists" in str(e):
            print("  Já existe!")
        else:
            print(f"  Erro: {e}")
        conn.rollback()
    
    # Adicionar coluna verificado (admin revisou)
    print("Adicionando coluna verificado...")
    try:
        conn.execute(text("ALTER TABLE lojas ADD COLUMN verificado BOOLEAN DEFAULT FALSE"))
        conn.commit()
        print("  OK!")
    except Exception as e:
        if "already exists" in str(e):
            print("  Já existe!")
        else:
            print(f"  Erro: {e}")
        conn.rollback()
    
    print("\nColunas adicionadas com sucesso!")
