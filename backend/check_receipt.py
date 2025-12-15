"""Verifica cupons e testa processamento."""
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from urllib.parse import quote_plus
from sqlalchemy import create_engine, text

password = quote_plus("Jesus@VIda7000")
DATABASE_URL = f"postgresql+psycopg2://postgres:{password}@db.snbajvvuegxhnetufazx.supabase.co:5432/postgres"

engine = create_engine(DATABASE_URL, connect_args={"client_encoding": "utf8"})

print("=== Cupons no banco ===")
with engine.connect() as conn:
    result = conn.execute(text("SELECT chave_acesso, status, error_message FROM cupons"))
    for row in result:
        print(f"Chave: {row[0]}")
        print(f"Status: {row[1]}")
        print(f"Erro: {row[2]}")
        print()
        
        # Testa consulta na SEFAZ
        if row[1] in ('pendente', 'erro'):
            print("Testando consulta na SEFAZ...")
            from worker.adapters.pa_nfce import consultar_nfce_pa
            result = consultar_nfce_pa(row[0])
            print(f"OK: {result.get('ok')}")
            print(f"URL: {result.get('source_url')}")
            if result.get('error'):
                print(f"Erro: {result.get('error')}")
            if result.get('raw_html'):
                print(f"HTML: {len(result.get('raw_html', ''))} caracteres")
