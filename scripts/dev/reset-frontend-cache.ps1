# Limpia la cache de desarrollo de Next dentro del contenedor frontend y lo reinicia.
# Uso: .\reset-frontend-cache.ps1
# Necesario en Windows porque los eventos de inotify no cruzan el bind mount:
# las rutas anadidas despues de arrancar el dev server pueden quedar invisibles.

$ErrorActionPreference = 'Stop'

Write-Host 'Limpiando .next dentro del contenedor...' -ForegroundColor Cyan
docker compose exec -T frontend sh -c 'rm -rf /app/.next/dev /app/.next/cache /app/.next/server /app/.next/static'
if ($LASTEXITCODE -ne 0) { throw "Fallo al limpiar la cache (exit $LASTEXITCODE)" }

Write-Host 'Reiniciando el servicio frontend...' -ForegroundColor Cyan
docker compose restart frontend
if ($LASTEXITCODE -ne 0) { throw "Fallo al reiniciar el frontend (exit $LASTEXITCODE)" }

Write-Host 'Esperando a que el dev server responda...' -ForegroundColor Cyan
$ready = $false
foreach ($i in 1..30) {
    Start-Sleep -Seconds 2
    docker compose exec -T frontend sh -c 'wget -q -O /dev/null http://localhost:3000/dashboard' 2>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
}

if ($ready) {
    Write-Host 'Listo. Haz un refresco forzado en el navegador (Ctrl+Shift+R).' -ForegroundColor Green
} else {
    Write-Warning 'El dev server no respondio en 60s. Revisa: docker compose logs frontend -f'
    exit 1
}