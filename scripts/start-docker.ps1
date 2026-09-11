$ErrorActionPreference = 'SilentlyContinue'

$paths = @(
    "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
)

$exe = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $exe) {
    Write-Output "NOT_FOUND: no encontre Docker Desktop.exe en las rutas conocidas"
    exit 2
}

Write-Output "Lanzando: $exe"
Start-Process $exe

$ok = $false
for ($i = 0; $i -lt 36; $i++) {
    Start-Sleep -Seconds 5
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    Write-Output "esperando daemon... intento $($i + 1)"
}

if ($ok) {
    docker version --format 'Server: {{.Server.Version}}'
    exit 0
} else {
    Write-Output "TIMEOUT: el daemon no respondio en ~180s"
    exit 1
}