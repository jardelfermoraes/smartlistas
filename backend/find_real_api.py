"""Encontra a API real analisando o HTML da SPA."""
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import httpx
import re

CHAVE = "15251209634089000201650140001932319401633787"

# Baixa a pagina principal
url = "https://app.sefa.pa.gov.br/consulta-nfce/"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

with httpx.Client(follow_redirects=True, timeout=30, verify=False) as client:
    resp = client.get(url, headers=headers)
    html = resp.text
    
    # Salva para analise
    with open("sefa_spa.html", "w", encoding="utf-8") as f:
        f.write(html)
    
    print(f"HTML salvo: {len(html)} bytes")
    
    # Procura todos os scripts inline e externos
    print("\n=== Scripts inline ===")
    inline_scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    for i, script in enumerate(inline_scripts):
        if len(script.strip()) > 50:
            # Procura URLs
            urls = re.findall(r'["\']([^"\']*(?:api|consulta|nfce)[^"\']*)["\']', script, re.IGNORECASE)
            if urls:
                print(f"\nScript {i+1}:")
                for u in urls[:5]:
                    print(f"  {u}")
    
    # Procura ng-app ou angular
    print("\n=== Angular config ===")
    ng_patterns = re.findall(r'ng-app\s*=\s*["\']([^"\']+)["\']', html)
    for p in ng_patterns:
        print(f"  ng-app: {p}")
    
    # Procura apiUrl, baseUrl, etc
    print("\n=== Configuracoes ===")
    config_patterns = [
        r'apiUrl\s*[=:]\s*["\']([^"\']+)["\']',
        r'baseUrl\s*[=:]\s*["\']([^"\']+)["\']',
        r'API_URL\s*[=:]\s*["\']([^"\']+)["\']',
        r'endpoint\s*[=:]\s*["\']([^"\']+)["\']',
        r'serviceUrl\s*[=:]\s*["\']([^"\']+)["\']',
    ]
    for pattern in config_patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        for m in matches:
            print(f"  {m}")
