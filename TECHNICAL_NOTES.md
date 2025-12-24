# SmartListas – Notas Técnicas (Arquitetura, Deploy, Variáveis, Troubleshooting)

## Visão geral
- **Repo:** `jardelfermoraes/smartlistas`
- **Componentes:**
  - **Backend:** FastAPI (Python) em `backend/`
  - **Frontend (Painel + Cadastro):** Vite + React em `frontend/`
  - **Mobile:** Expo/React Native em `mobile/`

## Domínios (atual)
- **Landing institucional (Hostinger / placeholder):** `https://smartlistas.com.br`
- **Painel admin (Vercel):** `https://admin.smartlistas.com.br`
- **Cadastro/Indicação (Vercel):** `https://cadastro.smartlistas.com.br`
- **API (Backend):** `https://api.smartlistas.com.br`

## Frontend (Vercel)
### Projeto
- **Root Directory:** `frontend`
- **Rotas especiais por hostname**
  - Quando `window.location.hostname` começa com `cadastro.`:
    - `/r/:code` (captura referral e redireciona)
    - `/cadastro` (form cadastro)
  - Caso contrário: painel admin (rotas protegidas)

### Arquivos relevantes
- `frontend/src/App.tsx` – switch por hostname (`cadastro.`)
- `frontend/src/pages/ReferralRedirect.tsx` – salva `referral_code` no localStorage, chama `/app/referrals/open`, vai para `/cadastro`
- `frontend/src/pages/AppSignup.tsx` – cadastro completo + máscaras + UF/cidade via API
- `frontend/vercel.json` – rewrite SPA para `/index.html`

### Variáveis de ambiente
- `VITE_API_URL` (recomendado setar na Vercel): `https://api.smartlistas.com.br`
- Fallback do código: em `*.smartlistas.com.br`, o frontend usa automaticamente `https://api.smartlistas.com.br`.

## Mobile (Expo)
### EAS
- `mobile/eas.json`:
  - `preview`: APK (distribution internal)
  - `production`: AAB

### Convite
- `mobile/app/(tabs)/profile.tsx`:
  - Compartilha `https://cadastro.smartlistas.com.br/r/<referral_code>`
  - Fallback: `https://cadastro.smartlistas.com.br/cadastro`

## Publicação automática do APK (GitHub Releases)
- Workflow: `.github/workflows/publish-apk.yml`
- Gera APK via EAS (`preview`) e publica no GitHub Release com asset fixo:
  - **Download fixo:** `https://github.com/jardelfermoraes/smartlistas/releases/latest/download/smartlistas-latest.apk`

### Requisito
- Criar secret no GitHub Actions:
  - `EXPO_TOKEN` (token do expo.dev)

## Backend (FastAPI)
### CORS
- Config em `backend/app/config.py` (`settings.cors_origins`)
- Inclui (no código):
  - `https://smartlistas.com.br`
  - `https://admin.smartlistas.com.br` (recomendado incluir se ainda não estiver via env)
  - `https://cadastro.smartlistas.com.br`

### Endpoints relevantes para cadastro/referral
- `POST /app/register` – cria usuário, aceita:
  - `name`, `email`, `password`
  - `phone`, `birth_date`, `gender`, `state`, `city`, `shopping_radius_km`
  - `referral_code` (opcional)
- `GET /app/locations/ufs`
- `GET /app/locations/cities?uf=XX&search=...&limit=...`
- `POST /app/referrals/open` – evento de funil (atualmente loga; sem persistência)

### Modelos
- `AppUser` (`backend/app/models.py`) já contém:
  - `referral_code`
  - `referred_by_user_id`

## Troubleshooting

### UF/Cidade não carrega no `cadastro.smartlistas.com.br`
**Sintoma:** DevTools mostra erro: `blocked by CORS policy` ao chamar `https://api.smartlistas.com.br/app/locations/ufs`.

**Causa:** Backend em produção não está retornando `Access-Control-Allow-Origin: https://cadastro.smartlistas.com.br`.

**Ação:**
1) Confirmar que o backend em produção foi redeployado com a config de CORS atual.
2) Verificar se existe env no provedor sobrescrevendo CORS (ex.: `CORS_ORIGINS`).
   - Se existir, garantir que inclua:
     - `https://cadastro.smartlistas.com.br`
     - `https://admin.smartlistas.com.br`
     - `https://smartlistas.com.br`
3) Reiniciar/redeploy do backend.

**Validação:** a resposta do endpoint deve conter o header:
- `access-control-allow-origin: https://cadastro.smartlistas.com.br`

### Cadastro dá erro genérico
- Verificar o erro exibido (o frontend mostra `HTTP XXX`).
- Erros comuns:
  - `HTTP 400` email/telefone já cadastrado
  - `CORS` (bloqueio no browser)
  - `VITE_API_URL` incorreta no deploy

## Info que NÃO está no repositório (precisa confirmar manualmente)
- **Onde o backend (`api.smartlistas.com.br`) está hospedado** (Railway/Render/Fly/VPS/etc.)
- Quais variáveis de ambiente estão configuradas no provedor do backend (principalmente CORS)
