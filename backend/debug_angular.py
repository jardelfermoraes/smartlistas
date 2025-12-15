"""Debug do Angular para entender como o captcha é processado."""
import asyncio
from playwright.async_api import async_playwright

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
        
        print("3. Analisando estrutura Angular...")
        
        # Analisa o scope do Angular
        result = await page.evaluate("""
            () => {
                const info = {
                    hasAngular: !!window.angular,
                    controllers: [],
                    scopes: [],
                    recaptchaWidget: null
                };
                
                if (window.angular) {
                    // Lista controllers
                    document.querySelectorAll('[ng-controller]').forEach(el => {
                        info.controllers.push(el.getAttribute('ng-controller'));
                    });
                    
                    // Analisa scopes
                    document.querySelectorAll('[ng-controller]').forEach(el => {
                        try {
                            const scope = angular.element(el).scope();
                            if (scope) {
                                const keys = Object.keys(scope).filter(k => !k.startsWith('$') && !k.startsWith('_'));
                                info.scopes.push({
                                    controller: el.getAttribute('ng-controller'),
                                    keys: keys.slice(0, 20)
                                });
                            }
                        } catch(e) {}
                    });
                    
                    // Procura widget do reCAPTCHA
                    const vcRecaptcha = document.querySelector('[vc-recaptcha]');
                    if (vcRecaptcha) {
                        info.recaptchaWidget = {
                            onSuccess: vcRecaptcha.getAttribute('on-success'),
                            onCreate: vcRecaptcha.getAttribute('on-create'),
                            key: vcRecaptcha.getAttribute('key'),
                            ngModel: vcRecaptcha.getAttribute('ng-model')
                        };
                    }
                }
                
                // Procura o formulário
                const form = document.querySelector('form');
                if (form) {
                    info.formName = form.getAttribute('name');
                    info.formNgSubmit = form.getAttribute('ng-submit');
                }
                
                // Procura o botão
                const btn = document.querySelector('#consultarChave');
                if (btn) {
                    info.buttonNgClick = btn.getAttribute('ng-click');
                    info.buttonNgDisabled = btn.getAttribute('ng-disabled');
                }
                
                return info;
            }
        """)
        
        print("\nResultado da análise:")
        import json
        print(json.dumps(result, indent=2))
        
        print("\n4. Procurando diretiva vc-recaptcha...")
        
        vc_recaptcha = await page.evaluate("""
            () => {
                const el = document.querySelector('[vc-recaptcha]');
                if (el) {
                    return {
                        outerHTML: el.outerHTML,
                        attributes: Array.from(el.attributes).map(a => ({name: a.name, value: a.value}))
                    };
                }
                return null;
            }
        """)
        
        if vc_recaptcha:
            print("Elemento vc-recaptcha encontrado:")
            print(json.dumps(vc_recaptcha, indent=2))
        
        print("\nPressione Enter para fechar...")
        input()
        
        await browser.close()

asyncio.run(main())
