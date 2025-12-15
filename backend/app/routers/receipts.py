"""Router para operações com cupons fiscais."""

import logging
from datetime import datetime, UTC
from math import ceil

from fastapi import APIRouter, HTTPException, Query, Request
from redis import Redis
from rq import Queue
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..database import DbSession
from ..models import CanonicalProduct, Price, Product, ProductAlias, Receipt, ReceiptItem, Store
from ..services.product_normalizer import clean_product_description, find_or_create_canonical
from ..schemas import (
    CHAVE_PATTERN,
    ImportResponse,
    JobStatusResponse,
    ReceiptImportRequest,
    ReceiptListResponse,
    ReceiptManualInput,
    ReceiptOut,
    ReceiptSummary,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Redis/Queue - lazy initialization
_redis: Redis | None = None
_queue: Queue | None = None


def get_redis() -> Redis:
    """Retorna conexão Redis (lazy init)."""
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.redis_url)
    return _redis


def get_queue() -> Queue:
    """Retorna fila RQ (lazy init)."""
    global _queue
    if _queue is None:
        _queue = Queue(settings.queue_name, connection=get_redis())
    return _queue


# Worker function import path
JOB_FUNC = "worker.worker.process_chave"


# === Endpoints ===


@router.post("/import", response_model=ImportResponse)
@limiter.limit("30/minute")
def import_receipt(request: Request, payload: ReceiptImportRequest, db: DbSession):
    """
    Importa um cupom fiscal.

    - **qr_text**: Texto do QR code do cupom (opcional)
    - **chave_acesso**: Chave de acesso de 44 dígitos (opcional)

    Pelo menos um dos campos deve ser fornecido.
    
    Se o Redis estiver disponível, enfileira para processamento assíncrono.
    Caso contrário, cria o registro diretamente no banco.
    """
    chave = payload.get_chave()
    if not chave:
        raise HTTPException(
            status_code=400,
            detail="Não foi possível extrair chave de acesso (44 dígitos) do payload",
        )

    # Verifica se já existe
    existing = db.get(Receipt, chave)
    if existing:
        if existing.status == "processado":
            logger.info(f"Cupom {chave} já processado, retornando existente")
            return ImportResponse(
                job_id="",
                status="already_processed",
                message="Cupom já foi processado anteriormente",
            )
        else:
            return ImportResponse(
                job_id="",
                status=existing.status,
                message=f"Cupom já existe com status: {existing.status}",
            )

    # Tenta enfileirar para processamento assíncrono
    try:
        q = get_queue()
        job = q.enqueue(JOB_FUNC, chave, job_timeout="5m")
        logger.info(f"Job {job.id} criado para chave {chave}")
        return ImportResponse(job_id=job.id, status=job.get_status())
    except Exception as e:
        logger.warning(f"Redis indisponível, criando registro síncrono: {e}")
        
        # Fallback: cria registro diretamente no banco
        # Extrai estado da chave (posições 0-1)
        estado = chave[0:2]
        estado_map = {
            "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA",
            "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE",
            "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE",
            "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
            "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT",
            "52": "GO", "53": "DF",
        }
        uf = estado_map.get(estado, None)
        
        # Extrai CNPJ (posições 6-19)
        cnpj = chave[6:20]
        
        receipt = Receipt(
            chave_acesso=chave,
            cnpj_emissor=cnpj,
            estado=uf,
            tipo="NFC-e",
            status="pendente",
        )
        db.add(receipt)
        db.commit()
        
        logger.info(f"Cupom {chave} criado com status pendente (modo síncrono)")
        return ImportResponse(
            job_id="sync",
            status="created",
            message="Cupom registrado. Processamento será feito quando o worker estiver disponível.",
        )


@router.post("/manual")
@limiter.limit("30/minute")
def create_receipt_manual(request: Request, payload: ReceiptManualInput, db: DbSession):
    """
    Cria um cupom fiscal com entrada manual de dados.
    
    Use este endpoint quando a consulta automática não estiver disponível.
    Permite inserir todos os dados do cupom manualmente.
    """
    chave = payload.chave_acesso
    
    # Verifica se já existe
    existing = db.get(Receipt, chave)
    if existing:
        if existing.status == "processado":
            # Verifica se pode sobrescrever
            if not settings.allow_receipt_overwrite:
                raise HTTPException(
                    status_code=409,
                    detail="Cupom já foi processado anteriormente. Não é permitido sobrescrever cupons em produção."
                )
            logger.info(f"Cupom {chave} já processado, sobrescrevendo (allow_receipt_overwrite=True)...")
        else:
            logger.info(f"Cupom {chave} existe com status {existing.status}, recriando...")
        
        # Deleta itens antigos, preços vinculados ao cupom, e o cupom
        db.query(ReceiptItem).filter(ReceiptItem.cupom_id == chave).delete()
        db.query(Price).filter(Price.cupom_id == chave).delete()
        db.delete(existing)
        db.flush()
    
    try:
        # 1. Cria ou busca a loja
        store = db.query(Store).filter(Store.cnpj == payload.cnpj_emissor).first()
        if not store:
            store = Store(
                cnpj=payload.cnpj_emissor,
                nome=payload.nome_emissor,
                endereco=payload.endereco_emissor,
                cidade=payload.cidade_emissor,
                uf=payload.uf_emissor,
            )
            db.add(store)
            db.flush()
        
        # 2. Cria o cupom
        receipt = Receipt(
            chave_acesso=chave,
            cnpj_emissor=payload.cnpj_emissor,
            estado=payload.uf_emissor,
            tipo="NFC-e",
            data_emissao=payload.data_emissao,
            total=payload.total,
            status="processado",
            loja_id=store.id,
        )
        db.add(receipt)
        
        # 3. Processa os itens
        for item_data in payload.itens:
            # Cria o item do cupom
            receipt_item = ReceiptItem(
                cupom_id=chave,
                seq=item_data.seq,
                descricao_raw=item_data.descricao,
                qtd=item_data.qtd,
                unidade=item_data.unidade,
                preco_unit=item_data.preco_unit,
                preco_total=item_data.preco_total,
                desconto=item_data.desconto,
                gtin_opt=item_data.gtin,
            )
            db.add(receipt_item)
            
            # Limpa a descrição removendo "(Código: xxxxx)"
            descricao = clean_product_description(item_data.descricao)
            gtin = item_data.gtin
            
            # Usa o normalizador para encontrar/criar produto canônico
            try:
                canonical, alias, is_new = find_or_create_canonical(
                    db=db,
                    descricao_original=descricao,
                    loja_id=store.id,
                    gtin=gtin,
                    use_ai=bool(settings.openai_api_key)
                )
                
                # Registra o preço vinculado ao produto canônico
                if item_data.preco_unit > 0:
                    price = Price(
                        canonical_id=canonical.id,
                        loja_id=store.id,
                        preco_por_unidade=item_data.preco_unit,
                        unidade_base=item_data.unidade,
                        data_coleta=payload.data_emissao or datetime.now(UTC),
                        fonte="manual",
                        cupom_id=chave,
                    )
                    db.add(price)
                    
                logger.info(f"Item '{descricao}' -> Canônico '{canonical.nome}' (novo={is_new})")
                
            except Exception as e:
                logger.error(f"Erro ao normalizar '{descricao}': {e}")
                # Fallback: busca ou cria produto legado (evita duplicados)
                descricao_upper = descricao.upper()
                product = db.query(Product).filter(
                    Product.descricao_norm == descricao_upper
                ).first()
                
                if not product:
                    product = Product(
                        gtin=gtin,
                        descricao_norm=descricao_upper,
                        unidade_base=item_data.unidade,
                    )
                    db.add(product)
                    db.flush()
                    
                receipt_item.produto_id = product.id
        
        db.commit()
        
        logger.info(f"Cupom {chave} criado manualmente: {len(payload.itens)} itens")
        
        return {
            "message": "Cupom criado com sucesso",
            "status": "processado",
            "chave_acesso": chave,
            "total": payload.total,
            "itens": len(payload.itens),
            "loja": store.nome,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Erro ao criar cupom manual {chave}: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao criar cupom: {str(e)}")


@router.get("/", response_model=ReceiptListResponse)
@limiter.limit("60/minute")
def list_receipts(
    request: Request,
    db: DbSession,
    page: int = Query(1, ge=1, description="Número da página"),
    page_size: int = Query(20, ge=1, le=100, description="Itens por página"),
    status: str | None = Query(None, description="Filtrar por status"),
    estado: str | None = Query(None, max_length=2, description="Filtrar por estado (UF)"),
):
    """
    Lista cupons fiscais com paginação.

    - **page**: Número da página (default: 1)
    - **page_size**: Itens por página (default: 20, max: 100)
    - **status**: Filtrar por status (pendente, baixado, processado, erro)
    - **estado**: Filtrar por estado (UF)
    """
    query = db.query(Receipt)

    # Filtros
    if status:
        query = query.filter(Receipt.status == status)
    if estado:
        query = query.filter(Receipt.estado == estado.upper())

    # Contagem total
    total = query.count()

    # Paginação
    offset = (page - 1) * page_size
    receipts = (
        query.order_by(Receipt.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return ReceiptListResponse(
        items=[ReceiptSummary.model_validate(r) for r in receipts],
        total=total,
        page=page,
        page_size=page_size,
        pages=ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/job/{job_id}", response_model=JobStatusResponse)
@limiter.limit("120/minute")
def get_job_status(request: Request, job_id: str):
    """
    Consulta o status de um job de importação.

    - **job_id**: ID do job retornado no endpoint /import
    """
    try:
        q = get_queue()
        job = q.fetch_job(job_id)
    except Exception as e:
        logger.error(f"Erro ao buscar job: {e}")
        raise HTTPException(status_code=503, detail="Serviço de fila indisponível")

    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")

    return JobStatusResponse(
        job_id=job.id,
        status=job.get_status(),
        enqueued_at=job.enqueued_at,
        started_at=job.started_at,
        ended_at=job.ended_at,
        result=job.result if job.is_finished else None,
        error=str(job.exc_info) if job.is_failed else None,
    )


@router.get("/{chave}", response_model=ReceiptOut)
@limiter.limit("60/minute")
def get_receipt(request: Request, chave: str, db: DbSession):
    """
    Busca um cupom fiscal pela chave de acesso.

    - **chave**: Chave de acesso de 44 dígitos
    """
    # Validação
    if not CHAVE_PATTERN.match(chave):
        raise HTTPException(
            status_code=400,
            detail="Chave de acesso inválida. Deve conter exatamente 44 dígitos numéricos.",
        )

    # Busca com itens
    receipt = db.get(Receipt, chave)
    if not receipt:
        raise HTTPException(status_code=404, detail="Cupom não encontrado")

    # Carrega itens
    items_data = []
    for item in receipt.itens:
        items_data.append({
            "id": item.id,
            "seq": item.seq,
            "descricao": item.descricao_raw,
            "qtd": item.qtd,
            "unidade": item.unidade,
            "preco_unit": item.preco_unit,
            "preco_total": item.preco_total,
            "desconto": item.desconto,
            "gtin": item.gtin_opt,
        })

    return ReceiptOut(
        chave_acesso=receipt.chave_acesso,
        cnpj_emissor=receipt.cnpj_emissor,
        estado=receipt.estado,
        data_emissao=receipt.data_emissao,
        total=receipt.total,
        status=receipt.status,
        loja_id=receipt.loja_id,
        created_at=receipt.created_at,
        itens=items_data,
    )


@router.delete("/{chave}")
@limiter.limit("10/minute")
def delete_receipt(request: Request, chave: str, db: DbSession):
    """
    Remove um cupom fiscal e seus itens.

    - **chave**: Chave de acesso de 44 dígitos
    """
    if not CHAVE_PATTERN.match(chave):
        raise HTTPException(status_code=400, detail="Chave de acesso inválida")

    receipt = db.get(Receipt, chave)
    if not receipt:
        raise HTTPException(status_code=404, detail="Cupom não encontrado")

    db.delete(receipt)
    db.commit()

    logger.info(f"Cupom {chave} removido")
    return {"message": "Cupom removido com sucesso", "chave_acesso": chave}


@router.post("/{chave}/process")
@limiter.limit("10/minute")
def process_receipt(request: Request, chave: str, db: DbSession):
    """
    Processa um cupom fiscal de forma síncrona.
    
    Baixa o HTML da SEFAZ, extrai os dados e salva no banco.
    
    - **chave**: Chave de acesso de 44 dígitos
    """
    if not CHAVE_PATTERN.match(chave):
        raise HTTPException(status_code=400, detail="Chave de acesso inválida")
    
    receipt = db.get(Receipt, chave)
    if not receipt:
        raise HTTPException(status_code=404, detail="Cupom não encontrado")
    
    if receipt.status == "processado":
        return {"message": "Cupom já foi processado", "status": "processado"}
    
    try:
        import os
        import json
        
        logger.info(f"Processando cupom {chave}")
        
        # 1. Consulta a SEFAZ usando 2Captcha
        receipt.status = "baixando"
        db.commit()
        
        # Tenta usar o adapter automático com 2Captcha
        twocaptcha_key = os.getenv("TWOCAPTCHA_API_KEY")
        logger.info(f"TWOCAPTCHA_API_KEY presente: {bool(twocaptcha_key)}")
        
        if twocaptcha_key:
            try:
                import sys
                import urllib3
                urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                
                sys.path.insert(0, str(__file__).replace("app/routers/receipts.py", ""))
                from worker.adapters.pa_nfce_api import consultar_nfce_pa_api
                
                logger.info("Usando 2Captcha para resolver captcha...")
                api_result = consultar_nfce_pa_api(chave, twocaptcha_key)
                
                # Salva dados brutos
                receipt.raw_html = json.dumps(api_result, ensure_ascii=False)
                receipt.source_url = "https://app.sefa.pa.gov.br/consulta-nfce/"
                receipt.status = "baixado"
                db.commit()
                
                # Usa os dados retornados diretamente
                parse_result = {
                    "ok": True,
                    "cnpj_emissor": api_result.get("emitente", {}).get("cnpj"),
                    "nome_emissor": api_result.get("emitente", {}).get("nome"),
                    "total": api_result.get("valor_total", 0),
                    "itens": [
                        {
                            "descricao": p.get("nome", ""),
                            "qtd": p.get("quantidade", 1),
                            "unidade": p.get("unidade", "UN"),
                            "preco_unit": p.get("valor_unitario", 0),
                            "preco_total": p.get("valor_total", p.get("valor_total_produto", 0)),
                            "gtin": p.get("codigo"),
                        }
                        for p in api_result.get("produtos", [])
                    ]
                }
            except Exception as e:
                logger.error(f"Erro com 2Captcha: {e}")
                receipt.status = "erro"
                receipt.error_message = f"Erro ao consultar SEFAZ: {str(e)}"
                db.commit()
                raise HTTPException(status_code=502, detail=str(e))
        else:
            # Fallback: adapter sem captcha (vai falhar)
            import sys
            sys.path.insert(0, str(__file__).replace("app/routers/receipts.py", ""))
            from worker.adapters.pa_nfce import consultar_nfce_pa, parse_nfce_json
            
            api_result = consultar_nfce_pa(chave)
            
            if not api_result.get("ok"):
                receipt.status = "erro"
                receipt.error_message = api_result.get("error", "Erro ao consultar SEFAZ")
                db.commit()
                raise HTTPException(status_code=502, detail=receipt.error_message)
            
            receipt.raw_html = json.dumps(api_result.get("data", {}), ensure_ascii=False)
            receipt.source_url = api_result.get("source_url", "")
            receipt.status = "baixado"
            db.commit()
            
            parse_result = parse_nfce_json(api_result.get("data", {}))
        
        if not parse_result.get("ok"):
            receipt.status = "erro"
            receipt.error_message = parse_result.get("error", "Erro ao processar dados")
            db.commit()
            raise HTTPException(status_code=422, detail=receipt.error_message)
        
        # 3. Atualiza dados do cupom
        receipt.cnpj_emissor = parse_result.get("cnpj_emissor")
        receipt.data_emissao = parse_result.get("data_emissao")
        receipt.total = parse_result.get("total", 0)
        
        # 4. Cria ou busca a loja
        store = None
        cnpj = parse_result.get("cnpj_emissor")
        if cnpj:
            store = db.query(Store).filter(Store.cnpj == cnpj).first()
            if not store:
                store = Store(
                    cnpj=cnpj,
                    nome=parse_result.get("nome_emissor"),
                    endereco=parse_result.get("endereco_emissor"),
                    cidade=parse_result.get("cidade_emissor"),
                    uf=receipt.estado,
                )
                db.add(store)
                db.flush()
            receipt.loja_id = store.id
        
        # 5. Processa os itens
        itens = parse_result.get("itens", [])
        for idx, item_data in enumerate(itens, 1):
            # Cria o item do cupom
            receipt_item = ReceiptItem(
                cupom_id=chave,
                seq=idx,
                descricao_raw=item_data.get("descricao", ""),
                qtd=item_data.get("qtd", 1),
                unidade=item_data.get("unidade", "un"),
                preco_unit=item_data.get("preco_unit", 0),
                preco_total=item_data.get("preco_total", 0),
                gtin_opt=item_data.get("gtin"),
            )
            db.add(receipt_item)
            
            # Cria ou busca o produto
            descricao = item_data.get("descricao", "").strip().upper()
            gtin = item_data.get("gtin")
            
            product = None
            if gtin:
                product = db.query(Product).filter(Product.gtin == gtin).first()
            if not product and descricao:
                product = db.query(Product).filter(Product.descricao_norm == descricao).first()
            
            if not product and descricao:
                product = Product(
                    gtin=gtin,
                    descricao_norm=descricao,
                    unidade_base=item_data.get("unidade", "un"),
                )
                db.add(product)
                db.flush()
            
            # Registra o preço
            if product and store and item_data.get("preco_unit", 0) > 0:
                price = Price(
                    produto_id=product.id,
                    loja_id=store.id,
                    preco_por_unidade=item_data.get("preco_unit", 0),
                    unidade_base=item_data.get("unidade", "un"),
                    data_coleta=receipt.data_emissao or datetime.now(UTC),
                    fonte="cupom",
                    cupom_id=chave,
                )
                db.add(price)
            
            receipt_item.produto_id = product.id if product else None
        
        # 6. Finaliza
        receipt.status = "processado"
        receipt.error_message = None
        db.commit()
        
        logger.info(f"Cupom {chave} processado com sucesso: {len(itens)} itens")
        
        return {
            "message": "Cupom processado com sucesso",
            "status": "processado",
            "total": receipt.total,
            "itens": len(itens),
            "loja": store.nome if store else None,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Erro ao processar cupom {chave}: {e}")
        receipt.status = "erro"
        receipt.error_message = str(e)[:500]
        db.commit()
        raise HTTPException(status_code=500, detail=f"Erro ao processar: {str(e)}")
