$users = @(
    @{email="usuario1@test.com"; password="Password123!"; nombre="Usuario Uno"},
    @{email="usuario2@test.com"; password="Secure456@"; nombre="Usuario Dos"},
    @{email="usuario3@test.com"; password="TestPass789#"; nombre="Usuario Tres"},
    @{email="admin@test.com"; password="AdminPass@123"; nombre="Admin User"}
)

foreach ($user in $users) {
    $body = @{
        email = $user.email
        password = $user.password
        nombre = $user.nombre
        acepta_terminos = $true
    } | ConvertTo-Json
    
    Write-Host "Creating $($user.email)..."
    Invoke-WebRequest -Uri "http://localhost:5001/api/auth/signup" `
        -Method POST `
        -Headers @{"Content-Type"="application/json"} `
        -Body $body | Select-Object -ExpandProperty Content
    
    Start-Sleep -Milliseconds 500
}

Write-Host "Promoting admin user..."
docker compose exec postgres psql -U postgres -d bi0a100 -c "UPDATE usuarios SET role = 'admin' WHERE email = 'admin@test.com';"