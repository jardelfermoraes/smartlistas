# MelhorCompra

Sistema para importação, processamento e consulta de cupons fiscais (NFC-e) com comparação de preços.

## Stack

- **API**: FastAPI + Pydantic
- **Queue**: RQ + Redis
- **Database**: PostgreSQL (compatível com Supabase)
- **ORM**: SQLAlchemy + Alembic (migrations)

## Funcionalidades

- ✅ Importação de cupons via chave de acesso ou QR code
- ✅ Processamento assíncrono com filas
- ✅ Parser de HTML de NFC-e (PA e SVRS)
- ✅ Extração automática de itens, lojas e preços
- ✅ Rate limiting por IP
- ✅ Validação robusta de entrada
- ✅ Paginação de resultados
- ✅ Health check de dependências

## Estrutura do Projeto

```
backend/
├── app/
│   ├── config.py       # Configurações centralizadas
│   ├── database.py     # Conexão e sessões DB
│   ├── main.py         # Aplicação FastAPI
│   ├── models.py       # Models SQLAlchemy
│   ├── schemas.py      # Schemas Pydantic
│   └── routers/        # Endpoints da API
├── worker/
│   ├── worker.py       # Worker RQ
│   ├── adapters/       # Adapters para consulta SEFAZ
│   └── parsers/        # Parsers de HTML
├── alembic/            # Migrations
└── tests/              # Testes
```

## Setup

### 1. Configurar ambiente

```bash
cp .env.example .env
# Edite .env com suas configurações
```

### 2. Desenvolvimento local (Docker)

```bash
docker compose up --build
```

A API estará disponível em http://localhost:8000

- **Swagger UI**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

### 3. Usando Supabase

Edite o `.env` com a URL do seu banco Supabase:

```env
DATABASE_URL=postgresql+psycopg2://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
```

## Variáveis de Ambiente

| Variável | Descrição | Default |
|----------|-----------|---------|
| `DATABASE_URL` | URL de conexão PostgreSQL | `postgresql+psycopg2://melhor:compra@db:5432/melhorcompra` |
| `REDIS_URL` | URL de conexão Redis | `redis://redis:6379/0` |
| `QUEUE_NAME` | Nome da fila RQ | `receipts` |
| `ENV` | Ambiente (development/production) | `development` |
| `LOG_LEVEL` | Nível de log | `INFO` |
| `SECRET_KEY` | Chave secreta para segurança | `change-me-in-production` |
| `CORS_ORIGINS` | Origens permitidas (JSON array) | `["http://localhost:3000"]` |

## API Endpoints

### Cupons

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/receipts/import` | Enfileira cupom para importação |
| `GET` | `/receipts/` | Lista cupons com paginação |
| `GET` | `/receipts/{chave}` | Busca cupom por chave |
| `GET` | `/receipts/job/{job_id}` | Status do job de importação |
| `DELETE` | `/receipts/{chave}` | Remove cupom |

### Exemplos

```bash
# Importar cupom
curl -X POST http://localhost:8000/receipts/import \
  -H 'Content-Type: application/json' \
  -d '{"chave_acesso": "15241200000100000100650010000000011000000019"}'

# Listar cupons
curl "http://localhost:8000/receipts/?page=1&page_size=10&status=processado"

# Buscar cupom
curl http://localhost:8000/receipts/15241200000100000100650010000000011000000019

# Status do job
curl http://localhost:8000/receipts/job/{job_id}

# Health check
curl http://localhost:8000/health
```

## Migrations

```bash
# Criar nova migration
cd backend
alembic revision --autogenerate -m "descrição"

# Aplicar migrations
alembic upgrade head

# Reverter última migration
alembic downgrade -1
```

## Testes

```bash
cd backend
pytest -v

# Com cobertura
pytest --cov=app --cov=worker
```

## Arquitetura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   FastAPI   │────▶│   Redis     │
└─────────────┘     └─────────────┘     └──────┬──────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  PostgreSQL │◀────│   Worker    │
                    └─────────────┘     └─────────────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   SEFAZ     │
                                        └─────────────┘
```

## Roadmap

- [ ] Autenticação JWT
- [ ] Frontend React
- [ ] Suporte a mais estados
- [ ] Normalização de produtos com ML
- [ ] Dashboard de preços
- [ ] Alertas de variação de preço
