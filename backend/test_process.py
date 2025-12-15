"""Testa o processamento completo de um cupom."""
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from urllib.parse import quote_plus
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Conexao
password = quote_plus("Jesus@VIda7000")
DATABASE_URL = f"postgresql+psycopg2://postgres:{password}@db.snbajvvuegxhnetufazx.supabase.co:5432/postgres"
engine = create_engine(DATABASE_URL, connect_args={"client_encoding": "utf8"})

# Chave do cupom
CHAVE = "15251209634089000201650140001932319401633787"

print(f"=== Testando processamento do cupom ===")
print(f"Chave: {CHAVE}")
print()

# 1. Consulta SEFAZ
print("1. Consultando SEFAZ...")
from worker.adapters.pa_nfce import consultar_nfce_pa
result = consultar_nfce_pa(CHAVE)
print(f"   OK: {result.get('ok')}")
print(f"   URL: {result.get('source_url')}")

if not result.get('ok'):
    print(f"   ERRO: {result.get('error')}")
    sys.exit(1)

html = result.get('raw_html', '')
print(f"   HTML: {len(html)} caracteres")
print()

# 2. Parse do HTML
print("2. Parseando HTML...")
from worker.parsers.nfce_parser import parse_nfce_html
parse_result = parse_nfce_html(html)
print(f"   OK: {parse_result.get('ok')}")

if not parse_result.get('ok'):
    print(f"   ERRO: {parse_result.get('error')}")
    sys.exit(1)

print(f"   CNPJ: {parse_result.get('cnpj_emissor')}")
print(f"   Nome: {parse_result.get('nome_emissor')}")
print(f"   Total: R$ {parse_result.get('total')}")
print(f"   Itens: {len(parse_result.get('itens', []))}")
print()

# 3. Mostra alguns itens
print("3. Primeiros itens:")
for i, item in enumerate(parse_result.get('itens', [])[:5], 1):
    print(f"   {i}. {item.get('descricao')[:40]} - R$ {item.get('preco_unit')}")

print()
print("=== Processamento OK! ===")
