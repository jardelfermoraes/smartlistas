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
