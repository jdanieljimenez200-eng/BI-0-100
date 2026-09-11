# Observabilidad: Rendimiento y Monitoring

## 1. Logging Estructurado (Winston + AsyncLocalStorage)

### Antes (Problema)
javascript
logger.info("User logged in");  // ¿Quién? ¿Cuándo? ¿Qué request?

### Ahora (Solución)
javascript
// Todos los logs incluyen automáticamente: timestamp, requestId, userId, nivel
{
 "timestamp": "2024-08-17 14:23:45.123",
 "level": "INFO",
 "message": "User logged in",
 "requestId": "a7c3-4d92-b1e8",
 "userId": "usr_123",
 "duration": 245
}

Ubicación: `src/utils/structuredLogger.ts`

**Uso:**
typescript
import { structuredLogger } from '../utils/structuredLogger';