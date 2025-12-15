"""Testa chamada direta à API da SEFAZ PA com token do captcha."""
import requests
from twocaptcha import TwoCaptcha
import os
from dotenv import load_dotenv

load_dotenv()

CHAVE = "15251209634089000201650140001932319401633787"
SITEKEY = "6LcVlhsUAAAAABxVW7VYy1nKFim7Ocgu50jT0AXM"
PAGE_URL = "https://app.sefa.pa.gov.br/consulta-nfce/#/consulta"
API_URL = "https://app.sefa.pa.gov.br/consulta-nfce-api/api/extranet/chave"

api_key = os.getenv("TWOCAPTCHA_API_KEY")

print("1. Resolvendo captcha...")
solver = TwoCaptcha(api_key)
result = solver.recaptcha(sitekey=SITEKEY, url=PAGE_URL)
token = result['code']
print(f"   Token: {token[:50]}...")

print("\n2. Chamando API da SEFAZ...")

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Origin": "https://app.sefa.pa.gov.br",
    "Referer": "https://app.sefa.pa.gov.br/consulta-nfce/",
}

# Tenta diferentes formatos de payload
payloads = [
    {"chave": CHAVE, "captcha": token},
    {"chave": CHAVE, "g-recaptcha-response": token},
    {"chave": CHAVE, "recaptchaResponse": token},
    {"chaveDeAcesso": CHAVE, "captcha": token},
    {"chaveDeAcesso": CHAVE, "recaptchaResponse": token},
]

for i, payload in enumerate(payloads):
    print(f"\n   Tentativa {i+1}: {list(payload.keys())}")
    try:
        resp = requests.post(API_URL, json=payload, headers=headers, verify=False, timeout=30)
        print(f"   Status: {resp.status_code}")
        print(f"   Response: {resp.text[:500]}")
        
        if resp.status_code == 200:
            print("\n*** SUCESSO! ***")
            break
    except Exception as e:
        print(f"   Erro: {e}")

# Tenta também com GET
print("\n3. Tentando GET...")
get_url = f"{API_URL}/{CHAVE}"
params = {"captcha": token}
try:
    resp = requests.get(get_url, params=params, headers=headers, verify=False, timeout=30)
    print(f"   Status: {resp.status_code}")
    print(f"   Response: {resp.text[:500]}")
except Exception as e:
    print(f"   Erro: {e}")
