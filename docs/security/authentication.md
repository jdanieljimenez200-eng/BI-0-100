# Authentication — JWT Implementation

Detalles de autenticación y manejo de tokens.

## Tokens

### Access Token

- **Duración**: 15 minutos
- **Algoritmo**: HS256
- **Almacenamiento**: localStorage (cliente)
- **Uso**: Cada request protegido

Payload:
json
{
 "userId": "uuid",
 "iat": 1692345600,
 "exp": 1692346500,
 "jti": "unique-id"
}

### Refresh Token

- **Duración**: 7 días
- **Algoritmo**: HS256
- **Almacenamiento**: localStorage (cliente)
- **Uso**: Obtener nuevo access token

Payload:
json
{
 "userId": "uuid",
 "iat": 1692345600,
 "exp": 1692950400
}

## Flujo de Login y Revocación

### Revocación de Tokens (Denylist en Redis)
- Cada `access_token` emitido contiene un identificador único `jti`.
- En caso de logout voluntario o revocación forzada de sesión, la clave `deny:<jti>` se guarda en Redis con un TTL igual a la vida restante del token.
- En cada request autenticada, el middleware `authenticate` verifica si `deny:<jti>` existe en Redis.

### Política de Disponibilidad vs Seguridad: Fail-Open
- **Decisión de diseño**: Para evitar que una caída de Redis provoque una indisponibilidad generalizada de la plataforma (errores 500 o rechazos 401 a todos los usuarios activos), el chequeo de la denylist opera en modo **fail-open** si Redis no está disponible o la conexión falla transitoriamente.
- **Ventana de exposición**: En caso de incidente de Redis, un token recientemente revocado podría ser aceptado hasta que expire su TTL natural (máximo 15 minutos).
- **Observabilidad y Mitigación**:
  - Se instrumenta el contador Prometheus `auth_denylist_check_failed_total` en `src/utils/metrics.ts`.
  - Se dispara automáticamente la alerta Prometheus `AuthDenylistCheckFailing` configurada en `alert_rules.yml`.
  - Todo fallo o ausencia de Redis se registra en los logs de seguridad como advertencia explícita: `[auth] Redis no disponible para consultar denylist JWT (fail-open activo)`.
