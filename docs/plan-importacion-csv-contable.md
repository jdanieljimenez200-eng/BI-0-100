# Plan: Importación de Libro Contable (CSV) al Sistema de Finanzas

**Versión:** 1.0 — Borrador para revisión  
**Estado:** Pendiente de aprobación  
**Autor:** Claude Code  

---

## 1. Objetivo

Permitir que el usuario suba su libro contable en formato CSV (o Excel exportado como CSV) para que sus registros reales de ingresos y egresos:

1. Se importen automáticamente al historial vivo del tab **Mando**
2. Alimenten la calculadora de impuestos con datos reales (no estimados)
3. **Recalibre** el análisis financiero proyectado usando los promedios históricos reales del negocio

---

## 2. Estado actual del sistema

| Pieza | Estado actual |
|-------|--------------|
| `MovimientoContable` (DB) | ✅ Existe — campos: tipo, descripcion, categoria, monto, fecha, tiene_cfdi, es_auto_generado |
| `GET/POST /api/contabilidad/:productoId` | ✅ Endpoints funcionales |
| Mando tab — historial vivo | ✅ Lee y muestra movimientos |
| Mando tab — calculadora de impuestos | ✅ Calcula IVA/ISR/IMSS desde movimientos |
| Proyección / Breakeven / Resumen | ⚠️ Usa SÓLO parámetros de input (precio, costos, unidades) — NO lee movimientos |
| Importación CSV | ❌ No existe |

---

## 3. Alcance de la solución

### Qué SÍ cambia
- Nueva API para recibir y procesar el CSV
- Frontend: botón de importar + modal de previsualización + confirmación
- Columna nueva en `MovimientoContable`: `fuente` (`'manual'` | `'csv_import'`) para distinguir registros importados
- Lógica de **calibración**: los datos reales del CSV sugieren nuevos valores de input para el análisis (precio promedio real, costos reales, unidades reales/mes)
- El análisis financiero puede re-correrse con los inputs calibrados

### Qué NO cambia
- La arquitectura de `AnalisisFinanzas` (proyeccion_data, breakeven_data, resumen_data siguen siendo calculados determinísticamente)
- La separación entre `MovimientoContable` y `AnalisisFinanzas` (siguen siendo entidades independientes)
- El flujo de análisis existente (los usuarios que no suban CSV no ven ningún cambio)

---

## 4. Formato CSV esperado

### Formato estándar (el sistema lo documenta en la UI)

```
fecha,descripcion,tipo,monto,categoria,tiene_cfdi
2025-01-05,Venta producto enero,ingreso,15000.00,Ventas,false
2025-01-10,Renta del local,egreso,8000.00,Renta,false
2025-01-15,Compra insumos,egreso,3500.50,Insumos,true
2025-01-20,Factura cliente B,ingreso,22000.00,Ventas,true
```

**Reglas:**
- `fecha`: formato `YYYY-MM-DD` o `DD/MM/YYYY` (auto-detectado)
- `tipo`: `ingreso` / `egreso` (también acepta `entrada`/`salida`, `crédito`/`débito`, `credit`/`debit`)
- `monto`: número positivo (el tipo determina si suma o resta)
- `categoria`: opcional — si no está, se deja vacío
- `tiene_cfdi`: opcional — default `false`
- Encabezado flexible: el parser intenta mapear nombres de columna comunes automáticamente

### Formato alternativo (extracto bancario)

```
Fecha,Concepto,Cargo,Abono,Saldo
05/01/2025,TRANSFERENCIA RECIBIDA,,15000.00,15000.00
10/01/2025,RENTA LOCAL,8000.00,,7000.00
```

- Si hay columnas `Cargo` / `Abono` (o `Débito` / `Crédito`): se mapean a `egreso` / `ingreso`
- La columna `Saldo` se ignora

---

## 5. Cambios en el Backend

### 5.1 Archivos nuevos

| Archivo | Descripción |
|---------|-------------|
| `backend/src/services/contabilidad/csvImportService.ts` | Parser de CSV + validación + normalización de filas |
| `backend/src/services/contabilidad/calibracionService.ts` | Calcula inputs calibrados a partir de movimientos históricos |

**`csvImportService.ts`** exporta:
```typescript
parseCsvBuffer(buffer: Buffer, pais: string): ParsedRow[]
// → detecta separador (coma/punto y coma/tab)
// → mapea nombres de columna flexibles
// → valida cada fila (fecha válida, monto > 0, tipo reconocible)
// → retorna filas válidas + array de errores por fila

interface ParsedRow {
  fecha: string;           // YYYY-MM-DD normalizado
  descripcion: string;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  categoria: string;
  tiene_cfdi: boolean;
  fila_original: number;   // para reportar errores
}
```

**`calibracionService.ts`** exporta:
```typescript
calcularInputsCalibrados(movimientos: MovimientoContable[]): InputsCalibrados
// Analiza los últimos 3-12 meses de movimientos reales y sugiere:
interface InputsCalibrados {
  ingreso_promedio_mensual: number;
  egreso_promedio_mensual: number;
  meses_analizados: number;
  sugerencias: {
    precio_venta?: number;           // si puede inferirse
    costos_fijos_mensuales: number;  // promedio real de egresos fijos
    unidades_mes_inicial?: number;   // si hay datos de unidades
  };
  confianza: 'alta' | 'media' | 'baja'; // alta si ≥6 meses de datos
}
```

### 5.2 Archivos modificados

#### `backend/src/models/MovimientoContable.ts`
```typescript
// Agregar columna:
@Column({ default: 'manual' })
fuente!: 'manual' | 'csv_import';
```
TypeORM auto-sync en dev (sin migración manual).

#### `backend/src/routes/contabilidad.ts`
Agregar 2 nuevos endpoints:

**`POST /api/contabilidad/:productoId/preview-csv`**
- Acepta archivo CSV (multipart/form-data, max 5 MB)
- NO guarda nada en DB
- Retorna previsualización:
```json
{
  "total_filas": 45,
  "filas_validas": 43,
  "filas_con_error": 2,
  "errores": [{ "fila": 12, "mensaje": "Monto inválido: 'abc'" }],
  "preview": [ ...primeras 10 filas parseadas... ],
  "resumen": {
    "total_ingresos": 125000,
    "total_egresos": 78000,
    "rango_fechas": { "desde": "2025-01-01", "hasta": "2025-06-30" }
  }
}
```

**`POST /api/contabilidad/:productoId/import-csv`**
- Acepta el mismo CSV + `{ omitir_duplicados: boolean }` en body
- Parsea, valida, hace bulk insert de filas válidas con `fuente: 'csv_import'`
- Detecta duplicados: compara (fecha + monto + tipo + descripcion) — si ya existe, lo salta
- Retorna:
```json
{
  "importados": 43,
  "saltados_duplicados": 2,
  "errores": 2,
  "calibracion": { ...InputsCalibrados... }
}
```

**`DELETE /api/contabilidad/:productoId/importacion/:fecha_importacion`**
- Permite deshacer una importación completa (borra todos los registros de esa sesión)
- Necesita agregar `fecha_importacion` (timestamp) a `MovimientoContable` al importar

---

## 6. Cambios en el Frontend

### 6.1 Componente nuevo: `CsvImportModal.tsx`

Ubicación: `frontend/app/dashboard/finanzas/[productoId]/resultado/[analisisId]/CsvImportModal.tsx`

**Flujo de 3 pasos dentro del modal:**

**Paso 1 — Subir archivo**
- Área de drag & drop + botón de selección
- Acepta `.csv`, `.txt`, `.xlsx` (Excel exportado)
- Muestra instrucciones del formato con descarga de plantilla de ejemplo

**Paso 2 — Previsualización**
- Llama a `POST /api/contabilidad/:productoId/preview-csv`
- Muestra tabla con las primeras 10 filas parseadas
- Muestra resumen: X ingresos / Y egresos / total importado / rango de fechas
- Lista de errores por fila (si los hay)
- Toggle: "Omitir filas con error e importar el resto"
- Toggle: "Omitir duplicados automáticamente"

**Paso 3 — Confirmación y resultado**
- Llama a `POST /api/contabilidad/:productoId/import-csv`
- Muestra resultado: "43 movimientos importados, 2 saltados"
- Muestra el objeto `calibracion` con sugerencias
- Botón: **"Usar datos reales para recalibrar mi análisis"** → ver sección 7

### 6.2 Modificación: mando tab en `page.tsx`

Agregar en la cabecera del tab Mando, junto a los botones existentes:

```tsx
<button onClick={() => setShowCsvModal(true)}
  className="text-xs border border-finanzas/30 text-finanzas px-3 py-1.5 rounded-lg hover:bg-finanzas/10 transition flex items-center gap-1.5">
  📥 Importar CSV
</button>
```

Después de una importación exitosa: recargar `movimientos` desde la API automáticamente.

---

## 7. Impacto en el Análisis Financiero

### El problema
El análisis (proyección, breakeven) usa parámetros de INPUT (precio, costos, unidades). Los movimientos reales del CSV no re-calculan el análisis automáticamente porque son entidades separadas.

### La solución: "Calibración con datos reales"

Después de importar el CSV, el sistema calcula `InputsCalibrados` y muestra al usuario:

> **"Tus datos reales sugieren estos parámetros:"**
> - Costos fijos mensuales reales: $8,500 (vs $6,000 en tu análisis actual)
> - Ingresos promedio mensuales reales: $22,000
> - **¿Quieres correr un nuevo análisis con estos datos reales?**

Si el usuario acepta → **se crea un nuevo `AnalisisFinanzas`** usando los inputs calibrados (no se sobreescribe el anterior). El usuario puede comparar ambos análisis en el historial de la página de producto.

**Esto NO modifica el análisis existente** — crea uno nuevo que el usuario puede ver como "Análisis con datos reales".

### Cálculo de calibración

A partir de los movimientos históricos (últimos N meses completos con data):

```
costos_fijos_mensuales = promedio(suma_egresos_por_mes, excl. meses sin datos)
ingreso_promedio_mensual = promedio(suma_ingresos_por_mes)
precio_venta = No calculable sin datos de unidades vendidas → se deja el existente
unidades_mes_inicial = No calculable sin datos de unidades → se deja el existente
tasa_crecimiento_mensual = (ultimo_mes_ingresos / primer_mes_ingresos)^(1/n) - 1
```

---

## 8. Validaciones y casos límite

| Caso | Manejo |
|------|--------|
| CSV vacío | Error claro: "El archivo no contiene filas de datos" |
| Columnas no reconocidas | Intenta mapeo flexible; si falla, muestra columnas detectadas y pide al usuario que indique cuál es cuál |
| Fechas futuras (>30 días) | Advertencia en previsualización, no bloquea |
| Montos negativos | Se usa el valor absoluto; el tipo (ingreso/egreso) determina el signo |
| Archivo muy grande (>5MB / >5000 filas) | Error: "Divide el archivo en partes de máx. 5,000 filas" |
| CSV con caracteres especiales (encoding) | Auto-detectar UTF-8 / Latin-1 / UTF-16 |
| Duplicados exactos | Detectados por hash(fecha+monto+tipo+descripcion); opción de saltar o importar igual |
| Sin datos suficientes para calibrar | Si hay <2 meses de data → calibración con `confianza: 'baja'`, mensaje explicativo |

---

## 9. Fases de implementación

### Fase 1 — CSV Import básico (Mando tab) ✦ Recomendado como MVP
**Esfuerzo estimado: 2–3 días**

- [ ] Columna `fuente` en `MovimientoContable`
- [ ] `csvImportService.ts` con parser flexible
- [ ] Endpoints `preview-csv` e `import-csv`
- [ ] `CsvImportModal.tsx` (3 pasos)
- [ ] Botón en mando tab + recarga automática de movimientos

**Resultado:** Los usuarios suben su CSV y ven sus movimientos reales en el historial vivo + calculadora de impuestos.

---

### Fase 2 — Calibración del análisis
**Esfuerzo estimado: 1–2 días adicionales**

- [ ] `calibracionService.ts`
- [ ] UI en paso 3 del modal con sugerencias de inputs
- [ ] Botón "Crear nuevo análisis con datos reales" que llama al flow existente de análisis

**Resultado:** El análisis financiero proyectado puede calibrarse con datos históricos reales.

---

### Fase 3 — Historial de importaciones (opcional, futuro)
**Esfuerzo estimado: 1 día**

- [ ] Columna `fecha_importacion` (batch_id) en `MovimientoContable`
- [ ] Endpoint DELETE para deshacer importación completa
- [ ] UI de historial de importaciones con opción de revertir

---

## 10. Archivos afectados (resumen)

| Archivo | Acción |
|---------|--------|
| `backend/src/models/MovimientoContable.ts` | Modificar — agregar columna `fuente` |
| `backend/src/services/contabilidad/csvImportService.ts` | Crear nuevo |
| `backend/src/services/contabilidad/calibracionService.ts` | Crear nuevo |
| `backend/src/routes/contabilidad.ts` | Modificar — agregar 2 endpoints |
| `frontend/app/dashboard/finanzas/.../CsvImportModal.tsx` | Crear nuevo |
| `frontend/app/dashboard/finanzas/.../page.tsx` | Modificar — botón + estado del modal |

**Archivos que NO se tocan:**
- `AnalisisFinanzas` model (sin cambios)
- Los 4 orquestadores de análisis (sin cambios)
- Páginas de mercado, marketing, proveedores (sin cambios)
- `taxConfig.ts` (sin cambios)

---

## 11. Preguntas para el usuario antes de implementar

1. ¿Quieres soportar también archivos `.xlsx` (Excel directo), o sólo CSV?
2. ¿La plantilla de descarga debe ser en español sólo, o también en inglés/portugués para Brasil?
3. ¿El botón de importar CSV debe estar disponible también en el plan Freemium, o sólo Pro/Business?
4. ¿Quieres la Fase 2 (calibración) desde el inicio, o empezamos sólo con Fase 1?

---

*Documento generado para revisión. Una vez aprobado, la implementación puede comenzar por la Fase 1.*
