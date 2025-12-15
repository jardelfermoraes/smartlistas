"""Descobre a API do portal NFC-e PA."""
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import httpx

# Primeiro, vamos acessar a pagina principal e ver os scripts
url = "https://app.sefa.pa.gov.br/consulta-nfce/"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html",
}

print(f"Acessando: {url}\n")

with httpx.Client(follow_redirects=True, timeout=30, verify=False) as client:
    resp = client.get(url, headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"URL final: {resp.url}")
    
    html = resp.text
    
    # Procura por URLs de API no HTML/JS
    import re
    
    # Procura padroes de API
    api_patterns = [
        r'api["\']?\s*:\s*["\']([^"\']+)["\']',
        r'baseUrl["\']?\s*:\s*["\']([^"\']+)["\']',
        r'endpoint["\']?\s*:\s*["\']([^"\']+)["\']',
        r'https?://[^"\'\s]+api[^"\'\s]*',
        r'/api/[^"\'\s]+',
        r'consultar[^"\'\s]*',
    ]
    
    print("\n=== URLs/APIs encontradas ===")
    found = set()
    for pattern in api_patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        for m in matches:
            if m not in found and len(m) > 5:
                found.add(m)
                print(f"  {m}")
    
    # Procura scripts
    print("\n=== Scripts ===")
    scripts = re.findall(r'src=["\']([^"\']+\.js)["\']', html)
    for s in scripts[:10]:
        print(f"  {s}")
