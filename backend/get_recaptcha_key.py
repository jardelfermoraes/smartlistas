"""Busca a site key do reCAPTCHA."""
import requests
import re

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# Baixa o JS do reCAPTCHA
base_url = "https://app.sefa.pa.gov.br/consulta-nfce"
js_url = f"{base_url}/assets/js/reCaptcha.js"

print(f"Baixando: {js_url}")

try:
    resp = requests.get(js_url, headers=headers, verify=False, timeout=30)
    print(f"Status: {resp.status_code}")
    
    js_content = resp.text
    print(f"Tamanho: {len(js_content)} bytes")
    print()
    
    # Procura site key (geralmente começa com 6L)
    sitekey_patterns = [
        r'sitekey["\s:=]+["\']([^"\']+)["\']',
        r'data-sitekey=["\']([^"\']+)["\']',
        r'(6L[a-zA-Z0-9_-]{38})',  # Formato típico de site key
        r'grecaptcha\.render\([^,]+,\s*\{[^}]*sitekey["\s:]+["\']([^"\']+)["\']',
    ]
    
    for pattern in sitekey_patterns:
        matches = re.findall(pattern, js_content, re.I)
        if matches:
            print(f"Padrão: {pattern[:30]}...")
            for m in matches:
                print(f"  Site Key: {m}")
    
    # Salva o JS
    with open("recaptcha.js", "w", encoding="utf-8") as f:
        f.write(js_content)
    print()
    print("JS salvo em recaptcha.js")
    
    # Mostra primeiras linhas
    print()
    print("Conteúdo:")
    print(js_content[:1000])
    
except Exception as e:
    print(f"Erro: {e}")

# Tenta também buscar na API
print()
print("=" * 50)
print("Analisando API...")

api_url = "https://app.sefa.pa.gov.br/consulta-nfce-api/api/extranet/chave"
try:
    # Faz um POST para ver a resposta
    resp = requests.post(api_url, json={"chave": "test"}, headers=headers, verify=False, timeout=30)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text[:500]}")
except Exception as e:
    print(f"Erro: {e}")
