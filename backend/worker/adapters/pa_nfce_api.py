"""
Adapter para consulta de NFC-e do Pará via Playwright + 2Captcha.

Este adapter:
1. Abre a página da SEFAZ PA com Playwright
2. Preenche a chave de acesso
3. Resolve o reCAPTCHA usando 2Captcha
4. Injeta o token e submete
5. Extrai os dados da página
"""

import asyncio
import logging
import re
import json
from typing import Any

from playwright.async_api import async_playwright
from twocaptcha import TwoCaptcha

logger = logging.getLogger(__name__)

# Configurações da SEFAZ PA
SITEKEY = "6LcVlhsUAAAAABxVW7VYy1nKFim7Ocgu50jT0AXM"
PAGE_URL = "https://app.sefa.pa.gov.br/consulta-nfce/#/consulta"
# URL alternativa do portal antigo (que você mostrou na imagem)
PORTAL_URL = "https://appnfc.sefa.pa.gov.br/portal/view/consultas/nfce/consultanfce.seam"


async def consultar_nfce_pa_async(chave: str, twocaptcha_api_key: str) -> dict[str, Any]:
    """
    Consulta NFC-e do Pará via Playwright com resolução de captcha.
    """
    if not twocaptcha_api_key:
        raise ValueError("API key do 2Captcha não configurada")
    
    # Limpa a chave
    chave = re.sub(r'\D', '', chave)
    if len(chave) != 44:
        raise ValueError(f"Chave deve ter 44 dígitos, tem {len(chave)}")
    
    logger.info(f"Consultando NFC-e PA: {chave[:20]}...")
    
    # 1. Resolve o captcha usando 2Captcha (em paralelo enquanto abre o browser)
    logger.info("Resolvendo reCAPTCHA com 2Captcha...")
    solver = TwoCaptcha(twocaptcha_api_key)
    
    try:
        result = solver.recaptcha(sitekey=SITEKEY, url=PAGE_URL)
        captcha_token = result['code']
        logger.info(f"Captcha resolvido!")
    except Exception as e:
        logger.error(f"Erro ao resolver captcha: {e}")
        raise RuntimeError(f"Falha ao resolver captcha: {e}")
    
    # 2. Usa Playwright para fazer a consulta
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page = await context.new_page()
        
        # Captura as respostas da API
        api_response_data = None
        
        async def capture_response(response):
            nonlocal api_response_data
            if "api" in response.url and "chave" in response.url:
                try:
                    data = await response.json()
                    api_response_data = data
                    logger.info(f"API Response capturada: {response.url}")
                except:
                    pass
        
        page.on("response", capture_response)
        
        # Intercepta requisições para adicionar o captcha
        async def add_captcha_to_request(route, request):
            if "consulta-nfce-api" in request.url and "chave" in request.url:
                # Adiciona o captcha na URL se não tiver
                url = request.url
                if "captcha=" not in url:
                    separator = "&" if "?" in url else "?"
                    url = f"{url}{separator}captcha={captcha_token}"
                logger.info(f"Interceptando requisição: {url[:100]}...")
                await route.continue_(url=url)
            else:
                await route.continue_()
        
        await page.route("**/*", add_captcha_to_request)
        
        try:
            # Acessa a página
            logger.info("Acessando SEFAZ PA...")
            await page.goto(PAGE_URL, wait_until="load", timeout=90000)
            await page.wait_for_timeout(5000)
            
            # Preenche a chave
            logger.info("Preenchendo chave de acesso...")
            input_selector = 'input[ng-model*="chave"], input[name*="chave"], input[placeholder*="chave"]'
            await page.wait_for_selector(input_selector, timeout=10000)
            await page.fill(input_selector, chave)
            await page.wait_for_timeout(500)
            
            # Injeta o token do captcha via JavaScript e chama o callback
            logger.info("Injetando token do captcha...")
            await page.evaluate(f"""
                () => {{
                    const token = '{captcha_token}';
                    
                    // 1. Injeta no textarea do reCAPTCHA
                    const textareas = document.querySelectorAll('textarea[name="g-recaptcha-response"], #g-recaptcha-response');
                    textareas.forEach(textarea => {{
                        textarea.value = token;
                        textarea.innerHTML = token;
                        textarea.style.display = 'block';
                    }});
                    
                    // 2. Encontra e chama o callback do vcRecaptcha (Angular)
                    if (window.angular) {{
                        // Encontra o elemento com vc-recaptcha
                        const vcEl = document.querySelector('[vc-recaptcha]');
                        if (vcEl) {{
                            const scope = angular.element(vcEl).scope();
                            if (scope) {{
                                // O vcRecaptcha usa 'response' no scope
                                scope.response = token;
                                
                                // Procura o callback definido no atributo on-success
                                const onSuccess = vcEl.getAttribute('on-success');
                                if (onSuccess) {{
                                    // Extrai o nome da função (ex: "setResponse(response)")
                                    const match = onSuccess.match(/(\w+)\s*\(/);
                                    if (match && scope[match[1]]) {{
                                        scope[match[1]](token);
                                    }}
                                }}
                                
                                // Tenta chamar setResponse diretamente
                                if (scope.setResponse) scope.setResponse(token);
                                if (scope.chave && scope.chave.setResponse) scope.chave.setResponse(token);
                                
                                try {{ scope.$apply(); }} catch(e) {{}}
                            }}
                        }}
                        
                        // Também tenta no controller principal
                        const ctrl = document.querySelector('[ng-controller]');
                        if (ctrl) {{
                            const scope = angular.element(ctrl).scope();
                            if (scope) {{
                                scope.captchaResponse = token;
                                scope.recaptchaResponse = token;
                                if (scope.chave) {{
                                    scope.chave.captchaResponse = token;
                                    scope.chave.recaptcha = token;
                                }}
                                try {{ scope.$apply(); }} catch(e) {{}}
                            }}
                        }}
                    }}
                    
                    // 3. Chama o callback global do grecaptcha se existir
                    if (typeof ___grecaptcha_cfg !== 'undefined') {{
                        const clients = ___grecaptcha_cfg.clients;
                        if (clients) {{
                            Object.keys(clients).forEach(key => {{
                                const client = clients[key];
                                if (client && client.callback) {{
                                    client.callback(token);
                                }}
                            }});
                        }}
                    }}
                }}
            """)
            
            await page.wait_for_timeout(1000)
            
            # Verifica se o botão está habilitado agora
            btn_disabled = await page.evaluate("""
                () => {
                    const btn = document.querySelector('#consultarChave, button[ng-click*="consultarChave"]');
                    return btn ? btn.disabled : true;
                }
            """)
            
            if btn_disabled:
                logger.warning("Botão ainda desabilitado, tentando forçar habilitação...")
                await page.evaluate("""
                    () => {
                        const btn = document.querySelector('#consultarChave, button[ng-click*="consultarChave"]');
                        if (btn) {
                            btn.disabled = false;
                            btn.removeAttribute('disabled');
                        }
                        
                        // Força o form como válido no Angular
                        if (window.angular) {
                            const el = document.querySelector('[ng-controller]');
                            if (el) {
                                const scope = angular.element(el).scope();
                                if (scope && scope.chave && scope.chave.formAutenticar) {
                                    scope.chave.formAutenticar.$invalid = false;
                                    scope.chave.formAutenticar.$valid = true;
                                    try { scope.$apply(); } catch(e) {}
                                }
                            }
                        }
                    }
                """)
                await page.wait_for_timeout(500)
            
            # Chama a função consultarChave diretamente via Angular
            # Primeiro, garante que o captchaResponse está setado no scope correto
            logger.info("Chamando consultarChave via Angular...")
            await page.evaluate(f"""
                () => {{
                    const token = '{captcha_token}';
                    if (window.angular) {{
                        const el = document.querySelector('[ng-controller]');
                        if (el) {{
                            const scope = angular.element(el).scope();
                            if (scope) {{
                                // Seta o captcha em todos os lugares possíveis
                                scope.captchaResponse = token;
                                scope.recaptchaResponse = token;
                                if (scope.chave) {{
                                    scope.chave.captchaResponse = token;
                                    scope.chave.recaptcha = token;
                                    scope.chave.captcha = token;
                                }}
                                
                                // Chama a função de consulta passando a chave
                                if (scope.consultarChave) {{
                                    scope.consultarChave('{chave}');
                                }}
                                try {{ scope.$apply(); }} catch(e) {{}}
                            }}
                        }}
                    }}
                }}
            """)
            
            # Aguarda a resposta (até 30 segundos)
            logger.info("Aguardando resposta da API...")
            for i in range(60):  # 60 x 500ms = 30 segundos
                await page.wait_for_timeout(500)
                if api_response_data:
                    logger.info(f"Resposta capturada após {(i+1)*0.5}s")
                    break
                # Verifica se a URL mudou (navegou para resultado)
                if "visualizar" in page.url or "resultado" in page.url:
                    logger.info("Página navegou para resultado!")
                    break
            
            # Verifica se capturou dados da API
            if api_response_data:
                logger.info("Dados capturados da API!")
                return normalize_response(api_response_data)
            
            # Tenta extrair o resultado do scope
            logger.info("Extraindo resultado do Angular scope...")
            data = await page.evaluate("""
                () => {
                    if (window.angular) {
                        const el = document.querySelector('[ng-controller]');
                        if (el) {
                            const scope = angular.element(el).scope();
                            if (scope) {
                                // Procura os dados do resultado da consulta
                                // A SEFAZ PA geralmente usa 'nfce', 'nota', 'resultado' ou 'dados'
                                const possibleKeys = ['nfce', 'nota', 'cupom', 'resultado', 'dados', 'nfe', 'consulta'];
                                for (const key of possibleKeys) {
                                    if (scope[key] && typeof scope[key] === 'object') {
                                        // Verifica se tem dados de produtos/emitente
                                        const obj = scope[key];
                                        if (obj.produtos || obj.itens || obj.emitente || obj.emit) {
                                            return obj;
                                        }
                                    }
                                }
                                
                                // Procura em scope.chave (pode ter o resultado lá)
                                if (scope.chave) {
                                    for (const key of possibleKeys) {
                                        if (scope.chave[key] && typeof scope.chave[key] === 'object') {
                                            return scope.chave[key];
                                        }
                                    }
                                }
                                
                            }
                        }
                    }
                    return null;
                }
            """)
            
            if data:
                logger.info("Dados extraídos do Angular!")
                return normalize_response(data)
            
            # Último recurso: screenshot e HTML para debug
            await page.screenshot(path="sefaz_debug.png")
            html = await page.content()
            with open("sefaz_debug.html", "w", encoding="utf-8") as f:
                f.write(html)
            
            # Verifica se há mensagem de erro na página
            try:
                error_el = await page.query_selector('.alert-danger, .erro, [class*="error"]')
                if error_el:
                    error_text = await error_el.text_content()
                    if error_text and error_text.strip():
                        raise RuntimeError(f"Erro na página: {error_text.strip()}")
            except Exception:
                pass
            
            # Verifica se a página mudou para a visualização do cupom
            current_url = page.url
            if "visualizar" in current_url or "resultado" in current_url:
                logger.info("Página redirecionou para visualização, extraindo HTML...")
                # Extrai dados do HTML da página de resultado
                html = await page.content()
                return parse_nfce_html(html)
            
            raise RuntimeError("Não foi possível extrair dados do cupom. A chave pode não existir ou a SEFAZ está indisponível.")
            
        finally:
            await browser.close()


def consultar_nfce_pa_api(chave: str, twocaptcha_api_key: str) -> dict[str, Any]:
    """Versão síncrona."""
    return asyncio.run(consultar_nfce_pa_async(chave, twocaptcha_api_key))


def normalize_response(data: dict) -> dict[str, Any]:
    """Normaliza a resposta da API para o formato esperado."""
    
    # A API pode retornar em diferentes formatos
    # Tenta extrair os dados principais
    
    emitente = data.get("emitente", {}) or {}
    produtos = data.get("produtos", []) or data.get("itens", []) or []
    info = data.get("informacoes_nota", {}) or data.get("nfce", {}) or {}
    
    # Normaliza CNPJ
    cnpj = emitente.get("cnpj", "")
    if cnpj:
        cnpj = re.sub(r'\D', '', cnpj)
    
    # Normaliza produtos
    itens_normalizados = []
    for idx, prod in enumerate(produtos, 1):
        item = {
            "seq": idx,
            "codigo": prod.get("codigo") or prod.get("codigo_produto"),
            "descricao": prod.get("nome") or prod.get("descricao") or "",
            "qtd": float(prod.get("quantidade", 1) or prod.get("qtd", 1) or 1),
            "unidade": prod.get("unidade", "UN") or "UN",
            "preco_unit": float(prod.get("valor_unitario", 0) or prod.get("preco_unitario", 0) or 0),
            "preco_total": float(prod.get("valor_total_produto", 0) or prod.get("valor_total", 0) or 0),
            "gtin": prod.get("codigo") or prod.get("gtin"),
        }
        itens_normalizados.append(item)
    
    # Calcula total se não vier
    total = data.get("valor_total", 0) or data.get("total", 0)
    if not total and itens_normalizados:
        total = sum(i["preco_total"] for i in itens_normalizados)
    
    return {
        "ok": True,
        "emitente": {
            "cnpj": cnpj,
            "nome": emitente.get("nome_razao_social") or emitente.get("nome"),
            "endereco": emitente.get("endereco"),
        },
        "produtos": itens_normalizados,
        "valor_total": float(total or 0),
        "informacoes_nota": {
            "chave_acesso": info.get("chave_acesso") or data.get("chave"),
            "numero": info.get("numero"),
            "serie": info.get("serie"),
            "data_emissao": info.get("data_emissao"),
            "hora_emissao": info.get("hora_emissao"),
        },
        "raw": data,  # Mantém dados originais para debug
    }


def parse_nfce_html(html: str) -> dict[str, Any]:
    """Extrai dados do HTML da página de resultado da NFC-e."""
    
    result = {
        "ok": True,
        "emitente": {},
        "produtos": [],
        "valor_total": 0,
        "informacoes_nota": {},
    }
    
    # Extrai CNPJ
    cnpj_match = re.search(r'CNPJ[:\s]*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})', html, re.I)
    if cnpj_match:
        result["emitente"]["cnpj"] = re.sub(r'\D', '', cnpj_match.group(1))
    
    # Extrai nome/razão social
    nome_match = re.search(r'(?:Razão Social|Nome)[:\s]*([^<\n]+)', html, re.I)
    if nome_match:
        result["emitente"]["nome"] = nome_match.group(1).strip()
    
    # Extrai valor total
    total_match = re.search(r'Valor\s*(?:a\s*)?(?:pagar|Total)[:\s]*R?\$?\s*([\d.,]+)', html, re.I)
    if total_match:
        total_str = total_match.group(1).replace('.', '').replace(',', '.')
        try:
            result["valor_total"] = float(total_str)
        except:
            pass
    
    # Extrai produtos (padrão simplificado)
    # Procura por linhas com descrição, quantidade e valor
    produto_pattern = re.compile(
        r'([A-Z][^<]{5,50})\s*(?:Código[:\s]*\d+)?\s*Qtde[:\s]*(\d+)\s*UN[:\s]*\w+\s*Vl\.\s*Unit[:\s]*([\d,]+)',
        re.I
    )
    
    for idx, match in enumerate(produto_pattern.finditer(html), 1):
        try:
            result["produtos"].append({
                "seq": idx,
                "descricao": match.group(1).strip(),
                "qtd": float(match.group(2)),
                "unidade": "UN",
                "preco_unit": float(match.group(3).replace(',', '.')),
            })
        except:
            pass
    
    return result


if __name__ == "__main__":
    # Teste
    import os
    from dotenv import load_dotenv
    
    load_dotenv()
    
    # Desabilita warnings de SSL
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    api_key = os.getenv("TWOCAPTCHA_API_KEY")
    chave = "15251209634089000201650140001932219401633787"
    
    logging.basicConfig(level=logging.INFO)
    
    try:
        result = consultar_nfce_pa_api(chave, api_key)
        print("\nResultado:")
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    except Exception as e:
        print(f"Erro: {e}")
