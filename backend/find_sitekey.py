"""Encontra a site key do reCAPTCHA usando Playwright."""
import asyncio
from playwright.async_api import async_playwright
import re

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # headless=False para ver
        page = await browser.new_page()
        
        print("Acessando SEFAZ PA...")
        await page.goto("https://app.sefa.pa.gov.br/consulta-nfce/")
        
        # Aguarda a página carregar
        await page.wait_for_timeout(3000)
        
        # Pega o HTML renderizado
        html = await page.content()
        
        print(f"HTML: {len(html)} bytes")
        
        # Procura site key
        patterns = [
            r'data-sitekey=["\']([^"\']+)["\']',
            r'sitekey["\s:=]+["\']([^"\']+)["\']',
            r'(6L[a-zA-Z0-9_-]{38,40})',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, html, re.I)
            if matches:
                print(f"Padrão: {pattern[:30]}...")
                for m in matches:
                    print(f"  Site Key: {m}")
        
        # Procura no JavaScript também
        scripts = await page.evaluate("""
            () => {
                const scripts = document.querySelectorAll('script');
                let content = '';
                scripts.forEach(s => {
                    if (s.textContent) content += s.textContent + '\\n';
                });
                return content;
            }
        """)
        
        for pattern in patterns:
            matches = re.findall(pattern, scripts, re.I)
            if matches:
                print(f"No JS - Padrão: {pattern[:30]}...")
                for m in matches:
                    print(f"  Site Key: {m}")
        
        # Procura elementos do reCAPTCHA
        recaptcha_elements = await page.query_selector_all('[data-sitekey], .g-recaptcha, #recaptcha')
        print(f"\nElementos reCAPTCHA encontrados: {len(recaptcha_elements)}")
        
        for el in recaptcha_elements:
            sitekey = await el.get_attribute('data-sitekey')
            if sitekey:
                print(f"  Site Key do elemento: {sitekey}")
        
        # Salva screenshot
        await page.screenshot(path="sefa_screenshot.png")
        print("\nScreenshot salvo em sefa_screenshot.png")
        
        # Mantém aberto para inspeção
        print("\nPressione Enter para fechar...")
        input()
        
        await browser.close()

asyncio.run(main())
