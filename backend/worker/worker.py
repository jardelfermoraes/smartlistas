"""Worker RQ para processamento de cupons fiscais."""

import logging
from datetime import UTC, datetime

from redis import Redis
from rq import Connection, Queue, Worker
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import Product, Receipt, ReceiptItem, Store

from .adapters.pa_nfce import consultar_nfce_pa
from .parsers.nfce_parser import parse_nfce_html

# Logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def process_chave(chave: str) -> dict:
    """
    Processa a chave do cupom fiscal.

    1. Cria ou recupera o registro do cupom
    2. Baixa o HTML do portal da SEFAZ
    3. Parseia o HTML para extrair dados
    4. Salva itens e atualiza o cupom

    Args:
        chave: Chave de acesso de 44 dígitos

    Returns:
        dict com status do processamento
    """
    logger.info(f"Iniciando processamento da chave: {chave}")

    db: Session = SessionLocal()
    try:
        # 1. Busca ou cria o cupom
        rec = db.get(Receipt, chave)
        if not rec:
            # Extrai estado da chave (posições 0-1)
            estado = _extract_estado_from_chave(chave)
            rec = Receipt(
                chave_acesso=chave,
                estado=estado,
                tipo="NFC-e",
                status="pendente",
            )
            db.add(rec)
            db.commit()
            db.refresh(rec)
            logger.info(f"Cupom {chave} criado com status pendente")

        # Se já foi processado, retorna
        if rec.status == "processado":
            logger.info(f"Cupom {chave} já processado anteriormente")
            return {
                "chave": chave,
                "status": rec.status,
                "message": "Cupom já processado",
            }

        # 2. Baixa o HTML do portal
        logger.info(f"Consultando NFC-e para chave {chave}")
        res = consultar_nfce_pa(chave)

        if not res.get("ok"):
            error_msg = res.get("error", "Erro desconhecido ao consultar NFC-e")
            rec.status = "erro"
            rec.error_message = error_msg[:500]  # Limita tamanho
            db.commit()
            logger.error(f"Erro ao baixar cupom {chave}: {error_msg}")
            return {"chave": chave, "status": "erro", "error": error_msg}

        # Salva HTML bruto
        rec.source_url = res.get("source_url")
        rec.raw_html = res.get("raw_html")
        rec.status = "baixado"
        db.commit()
        logger.info(f"HTML baixado para cupom {chave}")

        # 3. Parseia o HTML
        html_content = res.get("raw_html", "")
        if not html_content:
            rec.status = "erro"
            rec.error_message = "HTML vazio retornado"
            db.commit()
            return {"chave": chave, "status": "erro", "error": "HTML vazio"}

        parsed = parse_nfce_html(html_content)
        if not parsed.get("ok"):
            error_msg = parsed.get("error", "Erro ao parsear HTML")
            rec.status = "erro"
            rec.error_message = error_msg[:500]
            db.commit()
            logger.error(f"Erro ao parsear cupom {chave}: {error_msg}")
            return {"chave": chave, "status": "erro", "error": error_msg}

        # 4. Atualiza dados do cupom
        rec.cnpj_emissor = parsed.get("cnpj_emissor")
        rec.data_emissao = parsed.get("data_emissao")
        rec.total = parsed.get("total", 0.0)

        # 5. Cria ou atualiza loja
        loja = _get_or_create_store(db, parsed)
        if loja:
            rec.loja_id = loja.id

        # 6. Cria itens do cupom
        _create_receipt_items(db, rec, parsed.get("itens", []))

        # 7. Marca como processado
        rec.status = "processado"
        rec.error_message = None
        db.commit()

        logger.info(f"Cupom {chave} processado com sucesso. {len(parsed.get('itens', []))} itens.")
        return {
            "chave": chave,
            "status": "processado",
            "total": rec.total,
            "itens_count": len(parsed.get("itens", [])),
            "loja_id": rec.loja_id,
        }

    except Exception as e:
        logger.exception(f"Erro inesperado ao processar chave {chave}: {e}")
        db.rollback()

        # Tenta marcar como erro
        try:
            rec = db.get(Receipt, chave)
            if rec:
                rec.status = "erro"
                rec.error_message = str(e)[:500]
                db.commit()
        except Exception:
            pass

        return {"chave": chave, "status": "erro", "error": str(e)}

    finally:
        db.close()


def _extract_estado_from_chave(chave: str) -> str:
    """Extrai o código do estado da chave de acesso."""
    # Código UF está nas posições 0-1 da chave
    uf_codes = {
        "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA",
        "16": "AP", "17": "TO", "21": "MA", "22": "PI", "23": "CE",
        "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE",
        "29": "BA", "31": "MG", "32": "ES", "33": "RJ", "35": "SP",
        "41": "PR", "42": "SC", "43": "RS", "50": "MS", "51": "MT",
        "52": "GO", "53": "DF",
    }
    code = chave[:2]
    return uf_codes.get(code, "XX")


def _get_or_create_store(db: Session, parsed: dict) -> Store | None:
    """Busca ou cria uma loja baseado nos dados parseados."""
    cnpj = parsed.get("cnpj_emissor")
    if not cnpj:
        return None

    # Busca existente
    store = db.query(Store).filter(Store.cnpj == cnpj).first()
    if store:
        # Atualiza dados se necessário
        if parsed.get("nome_emissor") and not store.nome:
            store.nome = parsed.get("nome_emissor")
        if parsed.get("endereco_emissor") and not store.endereco:
            store.endereco = parsed.get("endereco_emissor")
        db.commit()
        return store

    # Cria nova loja
    store = Store(
        cnpj=cnpj,
        nome=parsed.get("nome_emissor"),
        endereco=parsed.get("endereco_emissor"),
        cidade=parsed.get("cidade_emissor"),
        uf=parsed.get("uf_emissor"),
    )
    db.add(store)
    db.commit()
    db.refresh(store)
    logger.info(f"Loja criada: {store.nome} (CNPJ: {cnpj})")
    return store


def _create_receipt_items(db: Session, receipt: Receipt, itens: list) -> None:
    """Cria os itens do cupom no banco de dados."""
    # Remove itens existentes (para reprocessamento)
    db.query(ReceiptItem).filter(ReceiptItem.cupom_id == receipt.chave_acesso).delete()

    for idx, item_data in enumerate(itens, start=1):
        item = ReceiptItem(
            cupom_id=receipt.chave_acesso,
            seq=idx,
            descricao_raw=item_data.get("descricao", "")[:255],
            qtd=item_data.get("qtd", 1.0),
            unidade=item_data.get("unidade", "un")[:10],
            preco_unit=item_data.get("preco_unit", 0.0),
            preco_total=item_data.get("preco_total", 0.0),
            desconto=item_data.get("desconto", 0.0),
            gtin_opt=item_data.get("gtin"),
            ncm=item_data.get("ncm"),
        )
        db.add(item)

    db.commit()
    logger.debug(f"Criados {len(itens)} itens para cupom {receipt.chave_acesso}")


def main():
    """Entrypoint para rodar o worker RQ."""
    logger.info(f"Iniciando worker RQ. Queue: {settings.queue_name}")

    redis_conn = Redis.from_url(settings.redis_url)
    with Connection(redis_conn):
        queues = [Queue(settings.queue_name)]
        worker = Worker(queues, name=f"worker-{settings.queue_name}")
        worker.work(with_scheduler=True, logging_level=settings.log_level.upper())


if __name__ == "__main__":
    main()
