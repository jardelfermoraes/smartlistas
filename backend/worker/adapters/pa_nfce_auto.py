"""
Adapter para consulta automática de NFC-e do Pará usando 2Captcha.

Este adapter:
1. Acessa a página da SEFAZ PA
2. Preenche a chave de acesso
3. Usa 2Captcha para resolver o reCAPTCHA
4. Extrai os dados do cupom
"""

import asyncio
import logging
import re
from typing import Any

from playwright.async_api import async_playwright
from twocaptcha import TwoCaptcha

logger = logging.getLogger(__name__)

# Configurações da SEFAZ PA
SEFA_URL = "https://app.sefa.pa.gov.br/consulta-nfce/#/consulta"
RECAPTCHA_SITEKEY = "6LcVlhsUAAAAABxVW7VYy1nKFim7Ocgu50jT0AXM"


async def fetch_nfce_pa(chave: str, twocaptcha_api_key: str) -> dict[str, Any]:
    """
    Consulta NFC-e do Pará com resolução automática de captcha.
    
    Args:
        chave: Chave de acesso de 44 dígitos
        twocaptcha_api_key: API key do 2Captcha
        
    Returns:
        Dicionário com dados do cupom
    """
    if not twocaptcha_api_key:
        raise ValueError("API key do 2Captcha não configurada")
    
    # Limpa a chave
    chave = re.sub(r'\D', '', chave)
    if len(chave) != 44:
        raise ValueError(f"Chave deve ter 44 dígitos, tem {len(chave)}")
    
    logger.info(f"Iniciando consulta NFC-e PA: {chave[:20]}...")
    
    # Resolve o captcha usando 2Captcha
    logger.info("Resolvendo reCAPTCHA com 2Captcha...")
    solver = TwoCaptcha(twocaptcha_api_key)
    
    try:
        result = solver.recaptcha(
            sitekey=RECAPTCHA_SITEKEY,
            url=SEFA_URL,
        )
        captcha_token = result['code']
        logger.info(f"Captcha resolvido! Token: {captcha_token[:50]}...")
    except Exception as e:
        logger.error(f"Erro ao resolver captcha: {e}")
        raise RuntimeError(f"Falha ao resolver captcha: {e}")
    
    # Usa Playwright para fazer a consulta
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            # Acessa a página
            logger.info("Acessando SEFAZ PA...")
            await page.goto(SEFA_URL)
            await page.wait_for_timeout(3000)
            
            # Preenche a chave
            logger.info("Preenchendo chave de acesso...")
            await page.fill('input[name*="chave"]', chave)
            await page.wait_for_timeout(1000)
            
            # Injeta o token do captcha
            logger.info("Injetando token do captcha...")
            await page.evaluate(f"""
                () => {{
                    // Encontra o textarea do g-recaptcha-response (pode haver vários)
                    const textareas = document.querySelectorAll('textarea[name="g-recaptcha-response"], #g-recaptcha-response');
                    textareas.forEach(textarea => {{
                        textarea.value = '{captcha_token}';
                        textarea.innerHTML = '{captcha_token}';
                    }});
                    
                    // Injeta via Angular - procura o controller correto
                    if (window.angular) {{
                        const elements = document.querySelectorAll('[ng-controller]');
                        elements.forEach(el => {{
                            try {{
                                const scope = angular.element(el).scope();
                                if (scope) {{
                                    // Tenta diferentes nomes de variáveis
                                    if (typeof scope.captchaResponse !== 'undefined') {{
                                        scope.captchaResponse = '{captcha_token}';
                                    }}
                                    if (typeof scope.recaptchaResponse !== 'undefined') {{
                                        scope.recaptchaResponse = '{captcha_token}';
                                    }}
                                    if (scope.chave && typeof scope.chave.captchaResponse !== 'undefined') {{
                                        scope.chave.captchaResponse = '{captcha_token}';
                                    }}
                                    // Chama o callback do vcRecaptcha se existir
                                    if (scope.setResponse) {{
                                        scope.setResponse('{captcha_token}');
                                    }}
                                    scope.$apply();
                                }}
                            }} catch(e) {{}}
                        }});
                        
                        // Tenta via serviço do vcRecaptcha
                        try {{
                            const injector = angular.element(document.body).injector();
                            if (injector) {{
                                const vcRecaptchaService = injector.get('vcRecaptchaService');
                                if (vcRecaptchaService) {{
                                    // Força a resposta
                                    vcRecaptchaService.data = vcRecaptchaService.data || {{}};
                                    vcRecaptchaService.data.response = '{captcha_token}';
                                }}
                            }}
                        }} catch(e) {{}}
                    }}
                    
                    // Chama o callback global do reCAPTCHA se existir
                    if (window.vcRecaptchaApiLoaded) {{
                        // O callback foi definido
                    }}
                    
                    // Tenta chamar o callback definido no widget
                    const callbacks = ['onCaptchaSuccess', 'captchaCallback', 'recaptchaCallback', 'onRecaptchaSuccess'];
                    callbacks.forEach(cb => {{
                        if (typeof window[cb] === 'function') {{
                            window[cb]('{captcha_token}');
                        }}
                    }});
                }}
            """)
            
            await page.wait_for_timeout(500)
            
            # Clica no botão consultar
            logger.info("Clicando em Consultar...")
            await page.click('button:has-text("CONSULTAR")')
            
            # Aguarda a resposta
            await page.wait_for_timeout(5000)
            
            # Verifica se houve erro
            error_el = await page.query_selector('.alert-danger, .error, [class*="erro"]')
            if error_el:
                error_text = await error_el.text_content()
                raise RuntimeError(f"Erro na consulta: {error_text}")
            
            # Extrai os dados da página
            logger.info("Extraindo dados do cupom...")
            
            # Tenta extrair via Angular scope
            data = await page.evaluate("""
                () => {
                    if (window.angular) {
                        const scope = angular.element(document.querySelector('[ng-controller]')).scope();
                        if (scope) {
                            return {
                                nfce: scope.nfce || scope.nota || scope.cupom,
                                emitente: scope.emitente,
                                produtos: scope.produtos || scope.itens,
                                total: scope.total || scope.valorTotal
                            };
                        }
                    }
                    return null;
                }
            """)
            
            if data and (data.get('nfce') or data.get('produtos')):
                logger.info("Dados extraídos com sucesso!")
                return data
            
            # Fallback: extrai do HTML
            html = await page.content()
            
            # Salva para debug
            with open("sefa_resultado.html", "w", encoding="utf-8") as f:
                f.write(html)
            
            # Tenta parsear o HTML
            result = parse_nfce_html(html)
            if result:
                return result
            
            raise RuntimeError("Não foi possível extrair dados do cupom")
            
        finally:
            await browser.close()


def parse_nfce_html(html: str) -> dict[str, Any] | None:
    """Parseia o HTML da NFC-e para extrair dados."""
    
    # Extrai CNPJ
    cnpj_match = re.search(r'CNPJ[:\s]*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})', html, re.I)
    cnpj = cnpj_match.group(1).replace('.', '').replace('/', '').replace('-', '').replace(' ', '') if cnpj_match else None
    
    # Extrai nome
    nome_match = re.search(r'Razão Social[:\s]*([^<]+)', html, re.I)
    nome = nome_match.group(1).strip() if nome_match else None
    
    # Extrai produtos (simplificado)
    produtos = []
    # Padrão para produtos na tabela
    produto_pattern = re.compile(
        r'<tr[^>]*>.*?(\d+).*?([A-Z][^<]+).*?(\d+[,\.]\d+).*?(\d+[,\.]\d+).*?</tr>',
        re.I | re.S
    )
    
    for match in produto_pattern.finditer(html):
        produtos.append({
            'codigo': match.group(1),
            'nome': match.group(2).strip(),
            'quantidade': float(match.group(3).replace(',', '.')),
            'valor_total': float(match.group(4).replace(',', '.'))
        })
    
    # Extrai total
    total_match = re.search(r'Valor\s*Total[:\s]*R?\$?\s*([\d,\.]+)', html, re.I)
    total = float(total_match.group(1).replace('.', '').replace(',', '.')) if total_match else 0
    
    if cnpj or produtos:
        return {
            'emitente': {
                'cnpj': cnpj,
                'nome': nome
            },
            'produtos': produtos,
            'valor_total': total
        }
    
    return None


# Função síncrona para uso no worker
def fetch_nfce_pa_sync(chave: str, twocaptcha_api_key: str) -> dict[str, Any]:
    """Versão síncrona do fetch_nfce_pa."""
    return asyncio.run(fetch_nfce_pa(chave, twocaptcha_api_key))


if __name__ == "__main__":
    # Teste
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    api_key = os.getenv("TWOCAPTCHA_API_KEY")
    chave = "15251209634089000201650140001932319401633787"
    
    logging.basicConfig(level=logging.INFO)
    
    try:
        result = fetch_nfce_pa_sync(chave, api_key)
        print("Resultado:")
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"Erro: {e}")
