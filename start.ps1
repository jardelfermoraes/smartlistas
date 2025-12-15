# Script para iniciar Backend + Frontend do MelhorCompra

Write-Host 'Iniciando MelhorCompra...' -ForegroundColor Green

# Inicia o backend em uma nova janela
Write-Host 'Iniciando Backend (FastAPI)...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

# Aguarda o backend iniciar
Start-Sleep -Seconds 3

# Inicia o frontend em uma nova janela
Write-Host 'Iniciando Frontend (Vite)...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host ''
Write-Host 'Servidores iniciados!' -ForegroundColor Green
Write-Host '   Backend:  http://localhost:8000' -ForegroundColor Yellow
Write-Host '   Frontend: http://localhost:5173' -ForegroundColor Yellow
