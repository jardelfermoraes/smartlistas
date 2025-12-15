"""Testa diferentes endpoints da SEFA PA."""
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import httpx

CHAVE = "15251209634089000201650140001932319401633787"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://app.sefa.pa.gov.br",
    "Referer": "https://app.sefa.pa.gov.br/consulta-nfce/",
}

# Diferentes endpoints para testar
endpoints = [
    # Baseado no padrao comum de APIs Angular
    f"https://app.sefa.pa.gov.br/api/nfce/{CHAVE}",
    f"https://app.sefa.pa.gov.br/api/consulta/{CHAVE}",
    f"https://app.sefa.pa.gov.br/nfce/api/{CHAVE}",
    f"https://app.sefa.pa.gov.br/consulta-nfce/nfce/{CHAVE}",
    
    # Backend services
    f"https://sefa.pa.gov.br/api/nfce/{CHAVE}",
    f"https://nfce.sefa.pa.gov.br/api/{CHAVE}",
    
    # Servicos internos
    f"https://app.sefa.pa.gov.br/sefa-nfce-consulta/api/consulta/{CHAVE}",
    f"https://app.sefa.pa.gov.br/sefa-nfce/api/consulta/{CHAVE}",
]

print(f"Testando chave: {CHAVE}\n")

with httpx.Client(follow_redirects=True, timeout=15, verify=False) as client:
    for url in endpoints:
        try:
            resp = client.get(url, headers=headers)
            status = resp.status_code
            ct = resp.headers.get('content-type', '')
            
            # Mostra apenas respostas interessantes
            if status != 404:
                print(f"[{status}] {url}")
                if 'json' in ct:
                    try:
                        data = resp.json()
                        print(f"      JSON: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                    except:
                        pass
                elif status == 200:
                    print(f"      Content-Type: {ct}")
                    print(f"      Size: {len(resp.text)} bytes")
                    
        except Exception as e:
            pass  # Ignora erros de conexao
