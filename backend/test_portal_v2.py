"""Testa o portal antigo da SEFAZ PA com requests."""
import requests
import urllib3
import ssl

# Desabilita warnings de SSL
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Chave de acesso (removendo espaços)
chave = "15251209634089000201650140001932319401633787"

# URLs para testar
urls = [
    f"https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam",
    f"https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam?chaveAcesso={chave}",
    f"http://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam",
]

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "Connection": "keep-alive",
}

print(f"Chave: {chave}")
print(f"Tamanho: {len(chave)} dígitos")
print()

# Cria sessão com configurações especiais
session = requests.Session()
session.headers.update(headers)

for url in urls:
    print(f"Testando: {url[:60]}...")
    try:
        resp = session.get(url, verify=False, timeout=30)
        print(f"  Status: {resp.status_code}")
        print(f"  URL final: {resp.url}")
        
        if resp.status_code == 200:
            # Salva HTML
            filename = f"portal_test_{urls.index(url)}.html"
            with open(filename, "w", encoding="utf-8") as f:
                f.write(resp.text)
            print(f"  Salvo em: {filename}")
            
            # Verifica conteúdo
            if "chaveAcesso" in resp.text:
                print("  ✓ Tem campo chaveAcesso")
            if "CNPJ" in resp.text and "Razão" in resp.text:
                print("  ✓ Parece ter dados do cupom!")
            if "captcha" in resp.text.lower():
                print("  ⚠ Tem captcha")
            if "javax.faces" in resp.text:
                print("  ℹ É uma aplicação JSF")
                
    except Exception as e:
        print(f"  Erro: {e}")
    print()

# Tenta também a URL do QR Code diretamente
print("=" * 50)
print("Testando URL do QR Code...")
qr_url = f"https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam?p={chave}"
try:
    resp = session.get(qr_url, verify=False, timeout=30)
    print(f"Status: {resp.status_code}")
    with open("portal_qr.html", "w", encoding="utf-8") as f:
        f.write(resp.text)
    print("Salvo em portal_qr.html")
except Exception as e:
    print(f"Erro: {e}")
