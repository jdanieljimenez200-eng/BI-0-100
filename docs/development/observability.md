# Observability — Logs, Métricas, Debugging

Guía de monitoreo, logging y debugging en BI 0 A 100.

## Logging

### Backend

Usa `console` directamente (capturado por Docker/Railway):

typescript
import { logger } from '../utils/logger';