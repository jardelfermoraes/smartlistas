"""Extrai a site key do reCAPTCHA após clicar em consultar."""
import asyncio
from playwright.async_api import async_playwright
import re

CHAVE = "15251209634089000201650140001932319401633787"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        
        print("1. Acessando SEFAZ PA...")
        await page.goto("https://app.sefa.pa.gov.br/consulta-nfce/#/consulta")
        await page.wait_for_timeout(3000)
        
        print("2. Preenchendo chave...")
        await page.fill('input[name*="chave"]', CHAVE)
        await page.wait_for_timeout(1000)
        
        print("3. Clicando em Consultar...")
        await page.click('button:has-text("CONSULTAR")')
        await page.wait_for_timeout(3000)
        
        # Tira screenshot
        await page.screenshot(path="sefa_captcha.png")
        print("4. Screenshot salvo em sefa_captcha.png")
        
        # Procura a site key no HTML
        html = await page.content()
        
        # Padrões para encontrar site key
        patterns = [
            r'data-sitekey=["\']([^"\']+)["\']',
            r'sitekey["\s:=]+["\']([^"\']+)["\']',
            r'(6L[a-zA-Z0-9_-]{38,40})',
            r'k=([a-zA-Z0-9_-]{40})',
        ]
        
        found_keys = set()
        for pattern in patterns:
            matches = re.findall(pattern, html)
            for m in matches:
                if len(m) >= 40:
                    found_keys.add(m)
        
        if found_keys:
            print("\n*** SITE KEYS ENCONTRADAS ***")
            for key in found_keys:
                print(f"  {key}")
        
        # Procura em iframes
        iframes = await page.query_selector_all('iframe')
        print(f"\nIframes: {len(iframes)}")
        for iframe in iframes:
            src = await iframe.get_attribute('src') or ''
            if 'recaptcha' in src.lower():
                print(f"  reCAPTCHA iframe: {src[:150]}")
                key_match = re.search(r'k=([^&]+)', src)
                if key_match:
                    print(f"\n*** SITE KEY: {key_match.group(1)} ***")
        
        # Procura no JavaScript
        all_scripts = await page.evaluate("""
            () => {
                let text = '';
                document.querySelectorAll('script').forEach(s => {
                    text += s.textContent + ' ';
                });
                return text;
            }
        """)
        
        for pattern in patterns:
            matches = re.findall(pattern, all_scripts)
            for m in matches:
                if len(m) >= 40 and m not in found_keys:
                    print(f"  No JS: {m}")
        
        print("\nPressione Enter para fechar...")
        input()
        
        await browser.close()

asyncio.run(main())
