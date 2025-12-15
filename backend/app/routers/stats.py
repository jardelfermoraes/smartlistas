"""Router para estatísticas do dashboard administrativo."""

import logging
from datetime import UTC, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, desc

from ..database import DbSession
from ..models import CanonicalProduct, Price, ProductAlias, Receipt, Store

logger = logging.getLogger(__name__)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


# === Schemas ===

class DashboardStats(BaseModel):
    """Estatísticas gerais do dashboard."""
    total_lojas: int
    lojas_verificadas: int
    lojas_pendentes: int
    total_produtos: int
    produtos_com_preco: int
    produtos_sem_preco: int
    total_cupons: int
    cupons_processados: int
    cupons_com_erro: int
    total_precos: int
    precos_ultimos_7_dias: int
    precos_ultimos_30_dias: int


class ChartDataPoint(BaseModel):
    """Ponto de dados para gráficos."""
    label: str
    value: int


class RecentActivity(BaseModel):
    """Atividade recente."""
    tipo: str  # cupom, preco, loja, produto
    descricao: str
    data: str
    icone: str


class Alert(BaseModel):
    """Alerta do sistema."""
    tipo: str  # warning, error, info
    titulo: str
    descricao: str
    acao: Optional[str] = None
    link: Optional[str] = None


class DashboardData(BaseModel):
    """Dados completos do dashboard."""
    stats: DashboardStats
    cupons_por_dia: List[ChartDataPoint]
    precos_por_dia: List[ChartDataPoint]
    produtos_por_categoria: List[ChartDataPoint]
    atividade_recente: List[RecentActivity]
    alertas: List[Alert]


# === Endpoints ===

@router.get("/dashboard", response_model=DashboardData)
@limiter.limit("30/minute")
def get_dashboard_stats(request: Request, db: DbSession):
    """Retorna todas as estatísticas do dashboard administrativo."""
    
    now = datetime.now(UTC)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    
    # === Estatísticas gerais ===
    
    # Lojas
    total_lojas = db.query(Store).count()
    lojas_verificadas = db.query(Store).filter(Store.verificado == True).count()
    lojas_pendentes = total_lojas - lojas_verificadas
    
    # Produtos canônicos
    total_produtos = db.query(CanonicalProduct).count()
    
    # Produtos com pelo menos um preço
    produtos_com_preco = db.query(Price.canonical_id).distinct().count()
    produtos_sem_preco = total_produtos - produtos_com_preco
    
    # Cupons
    total_cupons = db.query(Receipt).count()
    cupons_processados = db.query(Receipt).filter(Receipt.status == "processado").count()
    cupons_com_erro = db.query(Receipt).filter(Receipt.status == "erro").count()
    
    # Preços
    total_precos = db.query(Price).count()
    precos_ultimos_7_dias = db.query(Price).filter(Price.data_coleta >= seven_days_ago).count()
    precos_ultimos_30_dias = db.query(Price).filter(Price.data_coleta >= thirty_days_ago).count()
    
    stats = DashboardStats(
        total_lojas=total_lojas,
        lojas_verificadas=lojas_verificadas,
        lojas_pendentes=lojas_pendentes,
        total_produtos=total_produtos,
        produtos_com_preco=produtos_com_preco,
        produtos_sem_preco=produtos_sem_preco,
        total_cupons=total_cupons,
        cupons_processados=cupons_processados,
        cupons_com_erro=cupons_com_erro,
        total_precos=total_precos,
        precos_ultimos_7_dias=precos_ultimos_7_dias,
        precos_ultimos_30_dias=precos_ultimos_30_dias,
    )
    
    # === Gráfico: Cupons por dia (últimos 7 dias) ===
    cupons_por_dia = []
    for i in range(6, -1, -1):
        dia = now - timedelta(days=i)
        dia_inicio = dia.replace(hour=0, minute=0, second=0, microsecond=0)
        dia_fim = dia_inicio + timedelta(days=1)
        
        count = db.query(Receipt).filter(
            Receipt.created_at >= dia_inicio,
            Receipt.created_at < dia_fim
        ).count()
        
        cupons_por_dia.append(ChartDataPoint(
            label=dia.strftime("%d/%m"),
            value=count
        ))
    
    # === Gráfico: Preços por dia (últimos 7 dias) ===
    precos_por_dia = []
    for i in range(6, -1, -1):
        dia = now - timedelta(days=i)
        dia_inicio = dia.replace(hour=0, minute=0, second=0, microsecond=0)
        dia_fim = dia_inicio + timedelta(days=1)
        
        count = db.query(Price).filter(
            Price.data_coleta >= dia_inicio,
            Price.data_coleta < dia_fim
        ).count()
        
        precos_por_dia.append(ChartDataPoint(
            label=dia.strftime("%d/%m"),
            value=count
        ))
    
    # === Gráfico: Produtos por categoria ===
    categorias = db.query(
        CanonicalProduct.categoria,
        func.count(CanonicalProduct.id).label("count")
    ).filter(
        CanonicalProduct.categoria.isnot(None)
    ).group_by(
        CanonicalProduct.categoria
    ).order_by(
        desc("count")
    ).limit(8).all()
    
    produtos_por_categoria = [
        ChartDataPoint(label=cat or "Sem categoria", value=count)
        for cat, count in categorias
    ]
    
    # === Atividade recente ===
    atividade_recente = []
    
    # Últimos cupons
    ultimos_cupons = db.query(Receipt).order_by(desc(Receipt.created_at)).limit(5).all()
    for cupom in ultimos_cupons:
        loja = db.get(Store, cupom.loja_id) if cupom.loja_id else None
        atividade_recente.append(RecentActivity(
            tipo="cupom",
            descricao=f"Cupom importado - {loja.nome_fantasia or loja.nome if loja else 'Loja desconhecida'}",
            data=cupom.created_at.isoformat() if cupom.created_at else "",
            icone="receipt"
        ))
    
    # Últimos preços
    ultimos_precos = db.query(Price).order_by(desc(Price.created_at)).limit(5).all()
    for preco in ultimos_precos:
        produto = db.get(CanonicalProduct, preco.canonical_id) if preco.canonical_id else None
        loja = db.get(Store, preco.loja_id) if preco.loja_id else None
        if produto:
            atividade_recente.append(RecentActivity(
                tipo="preco",
                descricao=f"Preço atualizado: {produto.nome} - R$ {preco.preco_por_unidade:.2f}",
                data=preco.created_at.isoformat() if preco.created_at else "",
                icone="dollar"
            ))
    
    # Ordena por data
    atividade_recente.sort(key=lambda x: x.data, reverse=True)
    atividade_recente = atividade_recente[:10]
    
    # === Alertas ===
    alertas = []
    
    # Lojas não verificadas
    if lojas_pendentes > 0:
        alertas.append(Alert(
            tipo="warning",
            titulo=f"{lojas_pendentes} loja(s) pendente(s) de verificação",
            descricao="Revise os dados das lojas cadastradas automaticamente",
            acao="Verificar lojas",
            link="/stores"
        ))
    
    # Produtos sem preço
    if produtos_sem_preco > 0:
        alertas.append(Alert(
            tipo="info",
            titulo=f"{produtos_sem_preco} produto(s) sem preço",
            descricao="Importe mais cupons para coletar preços",
            acao="Importar cupom",
            link="/receipts"
        ))
    
    # Cupons com erro
    if cupons_com_erro > 0:
        alertas.append(Alert(
            tipo="error",
            titulo=f"{cupons_com_erro} cupom(s) com erro",
            descricao="Verifique os cupons que falharam na importação",
            acao="Ver cupons",
            link="/receipts"
        ))
    
    # Poucos preços recentes
    if precos_ultimos_7_dias < 10:
        alertas.append(Alert(
            tipo="warning",
            titulo="Poucos preços coletados recentemente",
            descricao=f"Apenas {precos_ultimos_7_dias} preços nos últimos 7 dias",
            acao="Importar cupons",
            link="/receipts"
        ))
    
    return DashboardData(
        stats=stats,
        cupons_por_dia=cupons_por_dia,
        precos_por_dia=precos_por_dia,
        produtos_por_categoria=produtos_por_categoria,
        atividade_recente=atividade_recente,
        alertas=alertas,
    )


@router.get("/chart/cupons")
@limiter.limit("60/minute")
def get_cupons_chart(request: Request, db: DbSession, days: int = 7):
    """Retorna dados do gráfico de cupons e novos produtos por período."""
    
    # Limita entre 7 e 30 dias
    days = max(7, min(30, days))
    
    now = datetime.now(UTC)
    data = []
    
    for i in range(days - 1, -1, -1):
        dia = now - timedelta(days=i)
        dia_inicio = dia.replace(hour=0, minute=0, second=0, microsecond=0)
        dia_fim = dia_inicio + timedelta(days=1)
        
        # Conta cupons do dia
        cupons_count = db.query(Receipt).filter(
            Receipt.created_at >= dia_inicio,
            Receipt.created_at < dia_fim
        ).count()
        
        # Conta novos produtos canônicos criados no dia
        produtos_count = db.query(CanonicalProduct).filter(
            CanonicalProduct.created_at >= dia_inicio,
            CanonicalProduct.created_at < dia_fim
        ).count()
        
        data.append({
            "label": dia.strftime("%d/%m"),
            "date": dia.strftime("%Y-%m-%d"),
            "cupons": cupons_count,
            "produtos": produtos_count
        })
    
    # Calcula totais
    total_cupons = sum(d["cupons"] for d in data)
    total_produtos = sum(d["produtos"] for d in data)
    
    # Conta apenas dias com registros para calcular média real
    dias_com_cupons = sum(1 for d in data if d["cupons"] > 0)
    dias_com_produtos = sum(1 for d in data if d["produtos"] > 0)
    
    media_cupons = total_cupons / dias_com_cupons if dias_com_cupons > 0 else 0
    media_produtos = total_produtos / dias_com_produtos if dias_com_produtos > 0 else 0
    max_cupons = max(d["cupons"] for d in data) if data else 0
    max_produtos = max(d["produtos"] for d in data) if data else 0
    
    return {
        "data": data,
        "totals": {
            "cupons": total_cupons,
            "produtos": total_produtos
        },
        "medias": {
            "cupons": round(media_cupons, 1),
            "produtos": round(media_produtos, 1)
        },
        "max": {
            "cupons": max_cupons,
            "produtos": max_produtos
        },
        "days": days
    }


@router.get("/health")
def health_check(request: Request, db: DbSession):
    """Verifica saúde dos serviços."""
    from redis import Redis
    from ..config import settings
    
    status = {
        "database": "offline",
        "redis": "offline",
        "api": "online"
    }
    
    # Testa banco de dados
    try:
        db.execute("SELECT 1")
        status["database"] = "online"
    except Exception:
        pass
    
    # Testa Redis
    try:
        redis = Redis.from_url(settings.redis_url)
        redis.ping()
        status["redis"] = "online"
    except Exception:
        pass
    
    return status
