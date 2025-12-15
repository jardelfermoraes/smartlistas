"""Testa diferentes URLs para consulta NFC-e PA."""
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import httpx

CHAVE = "15251209634089000201650140001932319401633787"

urls = [
    f"https://appnfe.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam?chave={CHAVE}",
    f"https://appnfe.sefa.pa.gov.br/portal/view/consultas/nfce/nfceForm.seam?chave={CHAVE}",
    f"https://www.sefa.pa.gov.br/nfce/consulta?chNFe={CHAVE}",
    f"https://nfe.sefa.pa.gov.br/consulta?chave={CHAVE}",
    # URL do QR Code padrao
    f"http://www.sefa.pa.gov.br/nfce/consulta?p={CHAVE}|2|1|1|1",
]

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
}

with httpx.Client(follow_redirects=True, timeout=30) as client:
    for url in urls:
        print(f"\nTestando: {url[:70]}...")
        try:
            resp = client.get(url, headers=headers)
            print(f"  Status: {resp.status_code}")
            print(f"  Tamanho: {len(resp.text)} bytes")
            
            # Verifica se tem dados uteis
            text = resp.text.lower()
            if 'cnpj' in text:
                print("  [OK] Contem CNPJ!")
            if 'total' in text:
                print("  [OK] Contem TOTAL!")
            if 'item' in text or 'produto' in text:
                print("  [OK] Contem ITEM/PRODUTO!")
            if 'angular' in text or 'app-root' in text:
                print("  [!] Parece ser SPA (Angular)")
            if 'erro' in text or 'error' in text:
                print("  [!] Pode conter erro")
                
        except Exception as e:
            print(f"  ERRO: {e}")
