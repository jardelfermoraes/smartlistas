"""Router para OCR de cupons fiscais usando GPT-4 Vision."""

import base64
import json
import logging
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from openai import OpenAI

from ..config import settings

logger = logging.getLogger(__name__)
router = APIRouter()


RECEIPT_PROMPT = """Analise esta imagem de um cupom fiscal brasileiro (NFC-e) e extraia as informações em formato JSON.

Retorne APENAS o JSON válido, sem markdown ou explicações. Use este formato exato:

{
  "emitente": {
    "cnpj": "XX.XXX.XXX/XXXX-XX",
    "nome_razao_social": "Nome da Loja",
    "endereco": "Endereço completo"
  },
  "informacoes_nota": {
    "chave_acesso": "44 dígitos sem espaços",
    "data_emissao": "DD/MM/YYYY",
    "hora_emissao": "HH:MM:SS",
    "numero": "número da nota"
  },
  "produtos": [
    {
      "codigo": "código do produto",
      "nome": "DESCRIÇÃO DO PRODUTO",
      "quantidade": 1.0,
      "unidade": "UN",
      "valor_unitario": 10.99,
      "valor_total_produto": 10.99
    }
  ],
  "valor_total": 86.04
}

Regras:
- Extraia TODOS os produtos listados
- Use números decimais (não strings) para valores e quantidades
- A chave de acesso tem 44 dígitos, remova espaços
- Se não conseguir ler algum campo, use null
- Mantenha os nomes dos produtos em MAIÚSCULAS como aparecem no cupom"""


@router.post("/extract")
async def extract_receipt_data(file: UploadFile = File(...)) -> dict[str, Any]:
    """
    Extrai dados de um cupom fiscal a partir de uma imagem usando GPT-4 Vision.
    
    Aceita imagens JPG, PNG ou WEBP.
    """
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=503,
            detail="API do OpenAI não configurada"
        )
    
    # Valida tipo de arquivo
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Arquivo deve ser uma imagem (JPG, PNG ou WEBP)"
        )
    
    try:
        # Lê e codifica a imagem
        image_data = await file.read()
        base64_image = base64.b64encode(image_data).decode("utf-8")
        
        # Determina o tipo MIME
        mime_type = file.content_type or "image/jpeg"
        
        # Chama GPT-4 Vision
        client = OpenAI(api_key=settings.openai_api_key)
        
        response = client.chat.completions.create(
            model="gpt-4o",  # ou gpt-4-vision-preview
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": RECEIPT_PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{base64_image}",
                                "detail": "high"  # Alta resolução para melhor OCR
                            }
                        }
                    ]
                }
            ],
            max_tokens=4096,
            temperature=0.1,  # Baixa temperatura para respostas mais consistentes
        )
        
        # Extrai o JSON da resposta
        content = response.choices[0].message.content
        if not content:
            raise HTTPException(status_code=500, detail="Resposta vazia do GPT-4")
        
        # Remove possíveis marcadores de código
        content = content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        content = content.strip()
        
        # Parse do JSON
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"Erro ao parsear JSON: {e}\nConteúdo: {content}")
            raise HTTPException(
                status_code=500,
                detail="Não foi possível extrair dados estruturados da imagem"
            )
        
        logger.info(f"OCR extraiu {len(data.get('produtos', []))} produtos")
        
        return {
            "success": True,
            "data": data,
            "tokens_used": response.usage.total_tokens if response.usage else 0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro no OCR: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar imagem: {str(e)}"
        )
