"""Debug do HTML da NFC-e."""
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from worker.adapters.pa_nfce import consultar_nfce_pa

CHAVE = "15251209634089000201650140001932319401633787"

result = consultar_nfce_pa(CHAVE)
html = result.get('raw_html', '')

# Salva o HTML para análise
with open('nfce_sample.html', 'w', encoding='utf-8') as f:
    f.write(html)

print(f"HTML salvo em nfce_sample.html ({len(html)} bytes)")

# Mostra estrutura básica
from bs4 import BeautifulSoup
soup = BeautifulSoup(html, 'lxml')

print("\n=== Estrutura do HTML ===")
print(f"Title: {soup.title.string if soup.title else 'N/A'}")

# Procura por padrões comuns
print("\n=== Buscando padrões ===")

# CNPJ
cnpj_patterns = soup.find_all(string=lambda t: t and 'CNPJ' in t.upper() if t else False)
print(f"Textos com CNPJ: {len(cnpj_patterns)}")
for p in cnpj_patterns[:3]:
    print(f"  - {p.strip()[:80]}")

# Total
total_patterns = soup.find_all(string=lambda t: t and 'TOTAL' in t.upper() if t else False)
print(f"\nTextos com TOTAL: {len(total_patterns)}")
for p in total_patterns[:3]:
    print(f"  - {p.strip()[:80]}")

# Tabelas
tables = soup.find_all('table')
print(f"\nTabelas: {len(tables)}")

# Divs com classes importantes
for cls in ['txtTopo', 'NFCDetalhe', 'Item', 'totalNumb', 'linhaShort']:
    elements = soup.find_all(class_=cls)
    if elements:
        print(f"\nClasse '{cls}': {len(elements)} elementos")
        for e in elements[:2]:
            print(f"  - {e.get_text()[:60].strip()}")
