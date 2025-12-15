"""Testa o portal antigo da SEFAZ PA."""
import httpx

# Chave de acesso (removendo espaços)
chave = "15251209634089000201650140001932319401633787"

# URL do portal antigo
base_url = "https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam"

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

print(f"Chave: {chave}")
print(f"Tamanho: {len(chave)} dígitos")
print()

with httpx.Client(follow_redirects=True, timeout=30, verify=False) as client:
    # Primeiro, acessa a página inicial
    print("1. Acessando página inicial...")
    resp = client.get(base_url, headers=headers)
    print(f"   Status: {resp.status_code}")
    print(f"   URL final: {resp.url}")
    
    # Salva o HTML para análise
    with open("portal_antigo.html", "w", encoding="utf-8") as f:
        f.write(resp.text)
    print("   HTML salvo em portal_antigo.html")
    
    # Verifica se tem formulário
    if "chaveAcesso" in resp.text or "chave" in resp.text.lower():
        print("   ✓ Encontrou campo de chave!")
    
    # Procura por action do form
    import re
    forms = re.findall(r'<form[^>]*action="([^"]*)"[^>]*>', resp.text, re.IGNORECASE)
    print(f"   Forms encontrados: {forms}")
    
    # Tenta acessar com a chave na URL
    print()
    print("2. Tentando com chave na URL...")
    url_com_chave = f"{base_url}?chaveAcesso={chave}"
    resp2 = client.get(url_com_chave, headers=headers)
    print(f"   Status: {resp2.status_code}")
    
    # Verifica se retornou dados
    if "CNPJ" in resp2.text or "Razão Social" in resp2.text or "Total" in resp2.text:
        print("   ✓ Parece ter dados do cupom!")
        with open("portal_antigo_resultado.html", "w", encoding="utf-8") as f:
            f.write(resp2.text)
        print("   HTML salvo em portal_antigo_resultado.html")
    else:
        print("   ✗ Não encontrou dados do cupom")
    
    # Tenta POST
    print()
    print("3. Tentando POST...")
    
    # Extrai viewstate se existir (JSF)
    viewstate = re.search(r'name="javax\.faces\.ViewState"[^>]*value="([^"]*)"', resp.text)
    
    data = {
        "chaveAcesso": chave,
        "consultarNFCe": "Consultar",
    }
    
    if viewstate:
        data["javax.faces.ViewState"] = viewstate.group(1)
        print(f"   ViewState encontrado!")
    
    resp3 = client.post(base_url, headers=headers, data=data)
    print(f"   Status: {resp3.status_code}")
    
    with open("portal_antigo_post.html", "w", encoding="utf-8") as f:
        f.write(resp3.text)
    print("   HTML salvo em portal_antigo_post.html")
    
    if "CNPJ" in resp3.text or "Razão Social" in resp3.text:
        print("   ✓ POST retornou dados!")
