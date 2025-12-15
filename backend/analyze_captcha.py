"""Analisa o tipo de captcha usado pela SEFAZ PA."""
import requests
import re

# Tenta acessar a página de consulta
url = "https://app.sefa.pa.gov.br/consulta-nfce/"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

print("Analisando página da SEFAZ PA...")
print(f"URL: {url}")
print()

try:
    resp = requests.get(url, headers=headers, verify=False, timeout=30)
    print(f"Status: {resp.status_code}")
    
    html = resp.text
    
    # Procura por reCAPTCHA
    if "recaptcha" in html.lower():
        print("✓ Encontrado: reCAPTCHA")
        
        # Procura site key
        sitekey_match = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
        if sitekey_match:
            print(f"  Site Key: {sitekey_match.group(1)}")
        
        sitekey_match2 = re.search(r'sitekey["\s:]+["\']([^"\']+)["\']', html)
        if sitekey_match2:
            print(f"  Site Key (alt): {sitekey_match2.group(1)}")
    
    # Procura por hCaptcha
    if "hcaptcha" in html.lower():
        print("✓ Encontrado: hCaptcha")
        sitekey_match = re.search(r'data-sitekey=["\']([^"\']+)["\']', html)
        if sitekey_match:
            print(f"  Site Key: {sitekey_match.group(1)}")
    
    # Procura por imagem de captcha
    if "captcha" in html.lower() and "img" in html.lower():
        print("✓ Pode ter captcha de imagem")
        captcha_imgs = re.findall(r'<img[^>]*captcha[^>]*>', html, re.I)
        for img in captcha_imgs[:3]:
            print(f"  {img[:100]}...")
    
    # Procura por Cloudflare
    if "cf-turnstile" in html.lower() or "cloudflare" in html.lower():
        print("✓ Encontrado: Cloudflare Turnstile")
    
    # Salva HTML para análise
    with open("sefa_page.html", "w", encoding="utf-8") as f:
        f.write(html)
    print()
    print("HTML salvo em sefa_page.html")
    
    # Procura scripts
    scripts = re.findall(r'<script[^>]*src=["\']([^"\']+)["\']', html)
    print()
    print("Scripts encontrados:")
    for s in scripts[:10]:
        print(f"  - {s}")

except Exception as e:
    print(f"Erro: {e}")

# Tenta também o portal antigo
print()
print("=" * 50)
print("Analisando portal antigo...")
url2 = "https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam"

try:
    resp2 = requests.get(url2, headers=headers, verify=False, timeout=30)
    print(f"Status: {resp2.status_code}")
    
    html2 = resp2.text
    
    if "recaptcha" in html2.lower():
        print("✓ Encontrado: reCAPTCHA")
        sitekey_match = re.search(r'data-sitekey=["\']([^"\']+)["\']', html2)
        if sitekey_match:
            print(f"  Site Key: {sitekey_match.group(1)}")
    
    if "captcha" in html2.lower():
        print("✓ Tem algum tipo de captcha")
        # Procura imagens de captcha
        captcha_refs = re.findall(r'["\'][^"\']*captcha[^"\']*["\']', html2, re.I)
        for ref in captcha_refs[:5]:
            print(f"  Ref: {ref}")
    
    with open("sefa_antigo.html", "w", encoding="utf-8") as f:
        f.write(html2)
    print("HTML salvo em sefa_antigo.html")
    
except Exception as e:
    print(f"Erro: {e}")
