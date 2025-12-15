"""Extrai a site key do reCAPTCHA clicando no checkbox."""
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
        
        # Procura a site key ANTES de clicar
        html = await page.content()
        sitekey_match = re.search(r'(6L[a-zA-Z0-9_-]{38,40})', html)
        if sitekey_match:
            print(f"\n*** SITE KEY: {sitekey_match.group(1)} ***\n")
        
        # Procura o iframe do reCAPTCHA
        print("3. Procurando iframe do reCAPTCHA...")
        
        # Aguarda o iframe aparecer
        await page.wait_for_timeout(2000)
        
        # Lista todos os iframes
        iframes = page.frames
        print(f"   Frames encontrados: {len(iframes)}")
        
        for frame in iframes:
            url = frame.url
            if 'recaptcha' in url:
                print(f"   reCAPTCHA frame: {url[:100]}")
                # Extrai site key da URL
                key_match = re.search(r'k=([^&]+)', url)
                if key_match:
                    print(f"\n*** SITE KEY: {key_match.group(1)} ***\n")
        
        # Tenta clicar no checkbox do reCAPTCHA
        print("4. Tentando clicar no checkbox 'Não sou um robô'...")
        
        try:
            # O checkbox está dentro de um iframe
            recaptcha_frame = None
            for frame in iframes:
                if 'recaptcha' in frame.url and 'anchor' in frame.url:
                    recaptcha_frame = frame
                    break
            
            if recaptcha_frame:
                # Clica no checkbox dentro do iframe
                checkbox = await recaptcha_frame.wait_for_selector('.recaptcha-checkbox', timeout=5000)
                await checkbox.click()
                print("   Checkbox clicado!")
                await page.wait_for_timeout(3000)
            else:
                print("   Frame do checkbox não encontrado")
                
        except Exception as e:
            print(f"   Erro: {e}")
        
        # Screenshot após clicar
        await page.screenshot(path="sefa_captcha_challenge.png")
        print("5. Screenshot salvo em sefa_captcha_challenge.png")
        
        # Procura novamente os iframes (o desafio pode ter aparecido)
        iframes = page.frames
        print(f"\n   Frames após clique: {len(iframes)}")
        for frame in iframes:
            if 'recaptcha' in frame.url:
                print(f"   - {frame.url[:100]}")
        
        print("\nPressione Enter para fechar...")
        input()
        
        await browser.close()

asyncio.run(main())
