"""Intercepta as requisições do browser para descobrir o formato da API."""
import asyncio
from playwright.async_api import async_playwright

CHAVE = "15251209634089000201650140001932319401633787"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        # Intercepta todas as requisições
        requests_log = []
        
        async def log_request(request):
            if 'api' in request.url.lower() or 'nfce' in request.url.lower():
                requests_log.append({
                    'method': request.method,
                    'url': request.url,
                    'headers': dict(request.headers),
                    'post_data': request.post_data
                })
                print(f"\n[REQUEST] {request.method} {request.url}")
                if request.post_data:
                    print(f"   Body: {request.post_data[:200]}")
        
        async def log_response(response):
            if 'api' in response.url.lower() and 'chave' in response.url.lower():
                print(f"\n[RESPONSE] {response.status} {response.url}")
                try:
                    body = await response.text()
                    print(f"   Body: {body[:500]}")
                except:
                    pass
        
        page.on("request", log_request)
        page.on("response", log_response)
        
        print("1. Acessando SEFAZ PA...")
        await page.goto("https://app.sefa.pa.gov.br/consulta-nfce/#/consulta")
        await page.wait_for_timeout(3000)
        
        print("\n2. Preenchendo chave...")
        await page.fill('input[name*="chave"]', CHAVE)
        await page.wait_for_timeout(1000)
        
        print("\n3. Agora resolva o captcha manualmente e clique em CONSULTAR")
        print("   Vou interceptar a requisição para ver o formato...")
        
        # Aguarda o usuário resolver o captcha
        print("\nPressione Enter após ver o resultado...")
        input()
        
        print("\n\nRequisições capturadas:")
        for req in requests_log:
            print(f"\n{req['method']} {req['url']}")
            if req['post_data']:
                print(f"Body: {req['post_data']}")
        
        await browser.close()

asyncio.run(main())
