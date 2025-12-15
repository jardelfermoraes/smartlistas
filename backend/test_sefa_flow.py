"""Testa o fluxo completo de consulta na SEFAZ PA."""
import asyncio
from playwright.async_api import async_playwright
import re

CHAVE = "15251209634089000201650140001932319401633787"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Intercepta requisições para encontrar a API
        async def handle_request(request):
            if "api" in request.url.lower() or "captcha" in request.url.lower():
                print(f"[REQUEST] {request.method} {request.url}")
        
        async def handle_response(response):
            if "api" in response.url.lower() or "captcha" in response.url.lower():
                print(f"[RESPONSE] {response.status} {response.url}")
        
        page.on("request", handle_request)
        page.on("response", handle_response)
        
        print("1. Acessando SEFAZ PA...")
        await page.goto("https://app.sefa.pa.gov.br/consulta-nfce/")
        await page.wait_for_timeout(3000)
        
        print("2. Navegando para consulta por chave...")
        # Clica no menu de consulta por chave
        try:
            await page.click('text=Chave de Acesso', timeout=5000)
            await page.wait_for_timeout(2000)
        except:
            print("   Tentando URL direta...")
            await page.goto("https://app.sefa.pa.gov.br/consulta-nfce/#/consulta")
            await page.wait_for_timeout(2000)
        
        print("3. Preenchendo chave de acesso...")
        # Procura o campo de chave
        input_selectors = [
            'input[placeholder*="chave"]',
            'input[name*="chave"]',
            'input[ng-model*="chave"]',
            'input[type="text"]',
        ]
        
        for selector in input_selectors:
            try:
                await page.fill(selector, CHAVE, timeout=2000)
                print(f"   Preenchido com: {selector}")
                break
            except:
                continue
        
        await page.wait_for_timeout(2000)
        
        # Tira screenshot
        await page.screenshot(path="sefa_consulta.png")
        print("4. Screenshot salvo em sefa_consulta.png")
        
        # Procura o reCAPTCHA
        html = await page.content()
        
        # Procura site key
        sitekey_match = re.search(r'(6L[a-zA-Z0-9_-]{38,40})', html)
        if sitekey_match:
            print(f"\n*** SITE KEY ENCONTRADA: {sitekey_match.group(1)} ***\n")
        
        # Procura elementos do reCAPTCHA
        recaptcha = await page.query_selector('[data-sitekey], .g-recaptcha, iframe[src*="recaptcha"]')
        if recaptcha:
            sitekey = await recaptcha.get_attribute('data-sitekey')
            print(f"\n*** SITE KEY DO ELEMENTO: {sitekey} ***\n")
        
        # Procura iframes do reCAPTCHA
        iframes = await page.query_selector_all('iframe')
        print(f"\nIframes encontrados: {len(iframes)}")
        for iframe in iframes:
            src = await iframe.get_attribute('src')
            if src:
                print(f"  - {src[:100]}")
                if 'recaptcha' in src.lower():
                    # Extrai site key da URL
                    key_match = re.search(r'k=([^&]+)', src)
                    if key_match:
                        print(f"\n*** SITE KEY DA URL: {key_match.group(1)} ***\n")
        
        print("\nPressione Enter para tentar consultar...")
        input()
        
        # Tenta clicar no botão de consultar
        try:
            await page.click('button:has-text("Consultar")', timeout=5000)
            await page.wait_for_timeout(3000)
            await page.screenshot(path="sefa_resultado.png")
            print("Screenshot do resultado salvo")
        except Exception as e:
            print(f"Erro ao consultar: {e}")
        
        print("\nPressione Enter para fechar...")
        input()
        
        await browser.close()

asyncio.run(main())
