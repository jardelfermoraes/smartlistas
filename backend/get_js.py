"""Baixa e analisa o JS principal."""
import sys
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

import httpx
import re

base = "https://app.sefa.pa.gov.br/consulta-nfce/"
scripts = [
    "Scripts/index.js",
]

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

with httpx.Client(follow_redirects=True, timeout=30, verify=False) as client:
    for script in scripts:
        url = base + script
        print(f"\n=== {url} ===")
        
        try:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                js = resp.text
                print(f"Tamanho: {len(js)} bytes")
                
                # Procura URLs de API
                patterns = [
                    r'["\']([^"\']*api[^"\']*)["\']',
                    r'["\']([^"\']*consulta[^"\']*)["\']',
                    r'\.get\s*\(\s*["\']([^"\']+)["\']',
                    r'\.post\s*\(\s*["\']([^"\']+)["\']',
                    r'url\s*:\s*["\']([^"\']+)["\']',
                    r'baseURL\s*:\s*["\']([^"\']+)["\']',
                ]
                
                found = set()
                for pattern in patterns:
                    matches = re.findall(pattern, js, re.IGNORECASE)
                    for m in matches:
                        if m and len(m) > 3 and m not in found:
                            if 'http' in m or '/' in m or 'api' in m.lower():
                                found.add(m)
                
                print("\nURLs encontradas:")
                for f in sorted(found):
                    print(f"  {f}")
                    
        except Exception as e:
            print(f"Erro: {e}")
