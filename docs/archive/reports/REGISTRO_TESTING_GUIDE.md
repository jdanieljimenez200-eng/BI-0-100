# 🧪 Guía de Testing - POST /auth/register

**BI 0 A 100** - Pruebas de Seguridad  
**Fecha**: 2026-08-20

---

## 🧪 Test 1: Rate Limiting (3 intentos/hora)

**Objetivo**: Verificar que POST /register limita a 3 intentos por hora

### Ejecutar:
bash
# Intenta 4 registros rápidamente (misma IP)
for i in {1..4}; do
  echo "Intento $i:"
  curl -X POST http://localhost:4000/api/auth/register \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test$i@example.com\",\"password\":\"TestPass123\"}" \
    -w "\nStatus: %{http_code}\n"
  sleep 1
done

### Resultado esperado:
- Intentos 1-3: HTTP 201 (registro exitoso) o 400 (validación)
- Intento 4: HTTP 429 (Too Many Requests)

✅ **Status**: Si intento 4 retorna 429, rate limiting funciona

---

## 🧪 Test 2: Password Débiles Se Rechazan

**Objetivo**: Verificar que passwords débiles se rechazan

### Test 2a: Password muy corto (< 8 caracteres)
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"Short1"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado:
# {"error":"Password must be at least 8 characters"}
# Status: 400

### Test 2b: Sin mayúscula
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"lowercase123"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado:
# {"error":"Password must contain at least one uppercase letter"}
# Status: 400

### Test 2c: Sin minúscula
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"UPPERCASE123"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado:
# {"error":"Password must contain at least one lowercase letter"}
# Status: 400

### Test 2d: Sin número
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"OnlyLetters"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado:
# {"error":"Password must contain at least one number"}
# Status: 400

✅ **Status**: Si todos se rechazan, validación de password funciona

---

## 🧪 Test 3: Email Inválidos Se Rechazan

### Test 3a: Email sin @
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"notanemail","password":"ValidPass123"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado:
# {"error":"Invalid email format or too long"}
# Status: 400

### Test 3b: Email sin dominio
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@","password":"ValidPass123"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado: 400

### Test 3c: Email muy largo
bash
LONG_EMAIL=$(python3 -c "print('a'*300 + '@example.com')")
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$LONG_EMAIL\",\"password\":\"ValidPass123\"}" \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado: 400 (email > 254 caracteres)

✅ **Status**: Si todos se rechazan, validación de email funciona

---

## 🧪 Test 4: Registro Exitoso

**Objetivo**: Verificar que email y password válidos funcionan

### Ejecutar:
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@example.com","password":"ValidPass123"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado:
# {
#   "id": "uuid-123...",
#   "email": "newuser@example.com",
#   "plan": "free"
# }
# Status: 201

✅ **Status**: Si retorna 201 con id, registro funciona

---

## 🧪 Test 5: No Enumeration de Usuarios

**Objetivo**: Verificar que el mismo error se retorna para email existente o password débil

### Test 5a: Email existente
bash
# Primero registra un usuario
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"duplicate@example.com","password":"ValidPass123"}' \
  -s | jq '.id'

# Ahora intenta registrar el mismo email
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"duplicate@example.com","password":"ValidPass123"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado:
# {"error":"Email or password invalid. Please check and try again."}
# Status: 400

### Test 5b: Email existente + password débil
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"duplicate@example.com","password":"weak"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado: MISMO ERROR que 5a
# {"error":"Email or password invalid. Please check and try again."}
# Status: 400

✅ **Status**: Si retorna el MISMO error, enumeration está prevenido

---

## 🧪 Test 6: Normalización de Email

**Objetivo**: Verificar que emails con diferente case se tratan igual

### Ejecutar:
bash
# Registra con email UPPERCASE
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"TestUser@Example.COM","password":"ValidPass123"}' \
  -s | jq '.email'

# Resultado esperado:
# "testuser@example.com" (normalizado a lowercase)

# Intenta registrar con lowercase
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"ValidPass456"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado: 400 (ya existe, aunque el usuario envió lowercase)
# {"error":"Email or password invalid. Please check and try again."}
# Status: 400

✅ **Status**: Si reconoce el duplicado, normalización funciona

---

## 🧪 Test 7: Validación de Tipos

**Objetivo**: Verificar que valores no-string se rechazan

### Test 7a: Email como objeto
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":{"value":"test@example.com"},"password":"ValidPass123"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado: 400

### Test 7b: Password como array
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":["pass","word"]}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado: 400

### Test 7c: Email null
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":null,"password":"ValidPass123"}' \
  -w "\nStatus: %{http_code}\n" | jq

# Resultado esperado: 400 with "Email is required"

✅ **Status**: Si todos se rechazan, validación de tipos funciona

---

## 🧪 Test 8: Email Spaces

**Objetivo**: Verificar que espacios se trimean

### Test 8a: Email con espacios
bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":" newuser@example.com ","password":"ValidPass123"}' \
  -w "\nStatus: %{http_code}\n" | jq '.email'

# Resultado esperado:
# "newuser@example.com" (espacios removidos)
# Status: 201

✅ **Status**: Si retorna sin espacios, trim funciona

---

## 📊 Resumen de Pruebas

| Test | Descripción | Esperado | Status |
|------|-------------|----------|--------|
| 1 | Rate limiting (3/hora) | 429 en intento 4 | ⬜ |
| 2a | Password < 8 chars | 400 "at least 8" | ⬜ |
| 2b | Sin mayúscula | 400 "uppercase" | ⬜ |
| 2c | Sin minúscula | 400 "lowercase" | ⬜ |
| 2d | Sin número | 400 "number" | ⬜ |
| 3a | Email sin @ | 400 "Invalid format" | ⬜ |
| 3b | Email sin dominio | 400 | ⬜ |
| 3c | Email muy largo | 400 | ⬜ |
| 4 | Registro exitoso | 201 | ⬜ |
| 5a | Email duplicado | 400 mensaje genérico | ⬜ |
| 5b | Email dup + weak pass | Mismo error que 5a | ⬜ |
| 6 | Case-insensitive | Detecta duplicado | ⬜ |
| 7a | Email como objeto | 400 | ⬜ |
| 7b | Password como array | 400 | ⬜ |
| 7c | Email null | 400 "Email required" | ⬜ |
| 8 | Email spaces | Trimmed | ⬜ |

---

**Todos los tests deberían pasar**: ✅ 16/16

---

**Generado**: 2026-08-20  
**Version**: 1.0