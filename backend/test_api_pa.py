"""Testa a API JSON da SEFA PA."""
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import httpx
import json

CHAVE = "15251209634089000201650140001932319401633787"

# Headers
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Origin": "https://app.sefa.pa.gov.br",
    "Referer": "https://app.sefa.pa.gov.br/consulta-nfce/",
}

# Endpoints para testar
endpoints = [
    ("GET", f"https://app.sefa.pa.gov.br/consulta-nfce/api/v1/consultar/{CHAVE}"),
    ("GET", f"https://app.sefa.pa.gov.br/consulta-nfce/api/consultar/{CHAVE}"),
    ("POST", "https://app.sefa.pa.gov.br/consulta-nfce/api/v1/consultar", {"chave_acesso": CHAVE}),
    ("POST", "https://app.sefa.pa.gov.br/consulta-nfce/api/v1/consultar", {"nfce": CHAVE}),
]

print(f"Testando chave: {CHAVE}\n")

with httpx.Client(follow_redirects=True, timeout=30, verify=False) as client:
    for method, url, *payload in endpoints:
        payload = payload[0] if payload else None
        print(f"\n{'='*60}")
        print(f"{method} {url}")
        if payload:
            print(f"Payload: {payload}")
        
        try:
            if method == "GET":
                resp = client.get(url, headers=headers)
            else:
                resp = client.post(url, headers=headers, json=payload)
            
            print(f"Status: {resp.status_code}")
            print(f"Content-Type: {resp.headers.get('content-type', 'N/A')}")
            
            # Tenta parsear como JSON
            try:
                data = resp.json()
                print(f"JSON Keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
                
                if isinstance(data, dict):
                    if data.get("emitente"):
                        print(f"  Emitente: {data['emitente'].get('nome_razao_social', 'N/A')[:50]}")
                    if data.get("produtos"):
                        print(f"  Produtos: {len(data['produtos'])} itens")
                    if data.get("valor_total"):
                        print(f"  Total: R$ {data['valor_total']}")
                    if data.get("mensagem"):
                        print(f"  Mensagem: {data['mensagem']}")
                        
            except json.JSONDecodeError:
                print(f"Resposta (primeiros 200 chars): {resp.text[:200]}")
                
        except Exception as e:
            print(f"ERRO: {e}")
