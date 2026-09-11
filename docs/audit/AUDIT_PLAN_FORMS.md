# AUDIT_PLAN_FORMS.md

> Plan de mejora de los formularios de análisis y la calidad de salida de IA.
> Anclado a código real leído el 2026-06-29 (módulo Mercado como referencia; el
> mismo patrón aplica a Marketing, Proveedores y Finanzas).
>
> Tres ejes por módulo: **Contexto (input) → Investigación (fuentes/IA) →
> Resultado → Validación (confirmar que sea correcto)**.

---

## 0. Diagnóstico actual (lo que confirmé leyendo el código)

### 0.1 Validación del output de IA — inconsistente
- **Solo DAFO** valida con Zod vía `parseLLMJson(text, DafoOutputSchema)`
  (`backend/src/middleware/validate.ts:61`).
- Los otros **6 puntos que llaman IA hacen `JSON.parse(jsonMatch[0]) as X` a ciegas**:
  - `backend/src/services/marketing/copywritingService.ts:229`
  - `backend/src/services/marketing/calendarioService.ts:460`
  - `backend/src/services/mercado/reporteBiService.ts:327`
  - `backend/src/services/proveedores/rfqService.ts:220`
  - `backend/src/services/proveedores/directorioService.ts:139`
  - `backend/src/services/brief/briefService.ts:186`
- Riesgo real: si el modelo devuelve un campo de menos, un número como string,
  un array vacío o un enum inválido, **pasa silencioso al frontend** y revienta en
  render o muestra datos incoherentes.

### 0.2 El schema de DAFO valida forma, NO valores
En `dafoService.ts:43-59` los enums están como `z.string().max(40)`:
ts
impacto:      z.string().max(40).optional(),   // acepta cualquier string
probabilidad: z.string().max(40).optional(),
potencial:    z.string().max(40).optional(),
El `<output_schema>` del prompt promete `"alto|medio|bajo"`, pero el schema Zod
no lo exige. Un `impacto: "catastrófico"` pasaría la validación.

### 0.3 Fallback sin reintento
`generarDafo` (`dafoService.ts:222-227`): ante cualquier fallo cae directo al
`dafoTemplate` (`es_mock: true`). No hay **1 reintento** inyectando el error al
prompt antes de degradar. Se pierde calidad sin necesidad.

### 0.4 Duplicación de preguntas vs. datos ya guardados en `Producto`
El modelo `Producto` (`backend/src/models/Producto.ts`) YA persiste:

| Campo en `Producto`        | ¿El form de Mercado lo re-pregunta?                       |
|----------------------------|-----------------------------------------------------------|
| `nse`                      | **Sí** → `nseTarget` (select duplicado, líneas 367-374)   |
| `modelo_cobro`             | **Sí** → `formaCobro` (toggle, líneas 262-271)            |
| `ltv_meses`                | **Sí** → `recurrenciaMeses` (líneas 275-283)              |
| `clientes_mes`             | No (pre-llena desde Producto — patrón correcto, línea 147)|
| `tasa_repeticion`          | No (pre-llena — línea 148)                                |
| `canal_adquisicion`        | No (pre-llena — línea 149)                                |
| `cobertura`, `radio_km`    | Parcial → `scope`/`estado`/`ciudad` no se mapean a esto   |

→ Hay que **unificar a un único origen (SSOT)**: pre-llenar desde `Producto` como
ya se hace con la tracción, en vez de re-preguntar.

### 0.5 Contexto valioso que NO llega al prompt
`ejecutarAnalisisMercado` (`mercadoOrchestrator.ts:116-130`) llama a `generarDafo`
con `{ nombre, categoria, descripcion }`. Pero `Producto` ya tiene:
- `puv` (Propuesta Única de Valor)
- `cliente_ideal`
- `canal_venta`
- `tamano_equipo`

Ninguno de esos cuatro llega al prompt del DAFO. **Es la mejora de mayor ROI:
más calidad de salida con CERO preguntas nuevas**, solo cableando datos que ya
existen en la base.

---

## 1. Eje transversal (los 4 módulos) — PRIORIDAD ALTA

### V. Validación de la respuesta ("confirmar que sea correcta")
1. **Extender el patrón DAFO a los 6 servicios sin schema**: definir un `z.object`
   por output y reemplazar `JSON.parse(...) as X` por
   `parseLLMJson(raw, Schema)` (la función ya existe y maneja JSON envuelto en prosa).
2. **Endurecer enums**: cambiar `z.string().max(40)` por `z.enum([...])` en
   `impacto` / `probabilidad` / `potencial` (DAFO) y replicar el criterio en los
   nuevos schemas.
3. **Validar rangos lógicos con `.refine()`**, no solo forma:
   - `precio_max >= precio_min`
   - `score`, `puntaje_fit` ∈ [0, 100]
   - `moq > 0`, `costo_pedido_inicial >= 0`
   - margen coherente con precio/costo
4. **Política de fallo unificada** (mejorar lo que hoy hace DAFO):
   `safeParse` falla → **1 reintento** con el error inyectado al prompt
   ("tu JSON anterior incumplió estas reglas: …") → si falla otra vez, recién
   ahí degradar al `*_mock`/template existente (`es_mock: true`).

### Honestidad de `es_mock` / `confianza`
- Verificar que `confianza: 'alta'|'media'|'baja'` se **derive** de cuántas fuentes
  fueron reales vs. mock, y no se hardcodee. Hoy `generarAlertas`
  (`mercadoOrchestrator.ts:49`) ya reacciona a `confianza === 'baja'`; el cálculo
  debe ser fiel.

---

## 2. Mercado

### Contexto (input)
- **Eliminar duplicación** (ver 0.4): `nseTarget`, `formaCobro`, `recurrenciaMeses`
  deben pre-llenarse desde `Producto.nse` / `modelo_cobro` / `ltv_meses` (patrón
  de líneas 147-149), no re-preguntarse. Si el usuario quiere overridear, que sea
  un campo editable pre-cargado, no vacío.
- **Cablear contexto existente al prompt** (ver 0.5): pasar `puv`, `cliente_ideal`,
  `canal_venta` y `tamano_equipo` a `generarDafo` y a `generarReporteBi`.
- **Nuevos parámetros con impacto real**:
  - `estacionalidad` (enum: `Todo el año` / `Temporada alta definida` /
    `Pico navideño` / `Pico verano`) — hoy no se captura y afecta TAM y proyección.
  - `objetivo_ventas_mes_1` (número) — para que el TAM realista tenga un ancla del
    propio emprendedor y `generarAlertas` compare contra una meta real.
  - `presupuesto_marketing_inicial` (número) — condiciona qué penetración de TAM es
    creíble; sin esto la IA asume penetración optimista.

### Investigación (fuentes / IA)
- Confirmar que `tendenciasService`, `googleLocalService` y `mercadolibreService`
  marquen correctamente `es_mock`.
- `confianza` en `viabilidadService` debe calcularse a partir de `tendencias.es_mock`
  + `competencia` real, no fijarse a un valor.

### Resultado
- `reporteBiService.ts:327` → añadir `ReporteBiSchema` + `parseLLMJson`.

### Validación
- DAFO: subir enums a `z.enum()` y añadir `.refine()` de coherencia
  (p. ej. exactamente 3 items por cuadrante, como ya promete el prompt en la
  regla 3 del system, pero el schema permite 1-6).

---

## 3. Marketing

### Contexto
- `presupuestoMensual` debe validarse contra `precio_esperado` / inversión del
  producto (coherencia: no generar pauta de 50k para un ticket de 80).
- `plataformas` + `capacidadContenido` deben **condicionar** el calendario:
  no pedir cadencia "diaria" si la capacidad declarada es "1-2/semana".

### Investigación
- `TendenciaSocial` (`score`, hashtags) probablemente sale del LLM sin fuente →
  marcar `es_mock` honestamente.

### Resultado
- Dos puntos sin schema: `copywritingService.ts:229`, `calendarioService.ts:460`.
- Schemas deben validar:
  - el calendario tiene exactamente las semanas esperadas y días del enum
    `DiaSemanaLabel`;
  - cada plataforma del copy ∈ las plataformas elegidas por el usuario.

### Validación
- `.refine()`: cadencia del calendario ≤ capacidad declarada.

---

## 4. Proveedores

### Contexto
- `requisitosCalidad` y `terminosPago` (texto libre) están bien para el prompt,
  pero falta un campo estructurado **`cantidad_estimada_mes`** para que `moq` y
  `costo_pedido_inicial` tengan sentido numérico.

### Investigación
- `directorioService` genera proveedores con IA **sin búsqueda real**. `busqueda_sugerida`
  es honesto, pero el resultado debe declarar explícitamente:
  *"proveedores sugeridos a verificar"*, no un directorio confirmado.

### Resultado
- `directorioService.ts:139` y `rfqService.ts:220` sin schema → añadir.

### Validación
- `.refine()`: `precio_unitario_max >= precio_unitario_min`, `moq > 0`.

---

## 5. Finanzas (caso especial — 100% determinista, sin IA)

> No aparece en la búsqueda de `JSON.parse` porque es cálculo puro. Aquí
> "correcto" = **matemáticamente correcto**, no validación de IA.

### Contexto
- Validar en el form (y en el input schema del backend) que
  `precio_venta > costo_variable_unitario`; si no, el margen de contribución es
  negativo y todo el breakeven queda inválido.

### Resultado / Validación
- Robustecer la suite Jest de `breakevenService` / `proyeccionService` con casos
  límite: margen negativo, crecimiento 0 %, costos fijos 0, MOQ 1.
  (Estos servicios SÍ están cubiertos por Jest según `CLAUDE.md`.)

---

## 6. Orden de ejecución propuesto

1. **Cablear contexto ya existente** (`puv`, `cliente_ideal`, `canal_venta`) al
   prompt de Mercado — máximo ROI, cero preguntas nuevas, bajo riesgo.
2. **Schemas Zod en los 6 servicios IA** (cierra el agujero de respuestas corruptas)
   reutilizando `parseLLMJson`.
3. **Endurecer enums + `.refine()` de coherencia** y añadir **política reintento→mock**.
4. **De-duplicar el form de Mercado** (pre-llenar `nse`/`modelo_cobro`/`ltv_meses`
   desde `Producto`) y agregar `estacionalidad` / `presupuesto_marketing_inicial`.
5. **Validación de inputs** en los 4 formularios (precio>costo, presupuesto coherente).
6. **Tests**: unit por cada schema (parsea bien / rechaza mal) + casos límite Finanzas.

---

## 7. Referencias de código (verificadas)

- `backend/src/middleware/validate.ts:61` — `parseLLMJson` (patrón a reutilizar)
- `backend/src/services/mercado/dafoService.ts:43-59` — único schema Zod actual
- `backend/src/services/mercado/dafoService.ts:222-227` — fallback sin reintento
- `backend/src/services/mercado/mercadoOrchestrator.ts:116-130` — contexto que se
  pasa hoy a `generarDafo` (falta `puv`/`cliente_ideal`/`canal_venta`)
- `backend/src/models/Producto.ts:65-93` — campos ya persistidos y desaprovechados
- `frontend/app/dashboard/mercado/[productoId]/page.tsx:147-149` — patrón correcto
  de pre-llenado (a replicar para de-duplicar NSE/cobro)
- `frontend/app/dashboard/mercado/[productoId]/page.tsx:262-374` — campos duplicados