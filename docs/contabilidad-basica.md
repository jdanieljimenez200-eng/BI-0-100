# Contabilidad Básica — Centro de Mando Financiero

Módulo de registro contable integrado en la pestaña **Centro de Mando** del análisis financiero.  
Permite registrar ingresos y egresos reales del negocio con cálculo automático de impuestos.

---

## ¿Dónde está?

`Dashboard → Finanzas → [Producto] → Resultado → pestaña "⚡ Centro de Mando" → sección inferior`

---

## Resumen de métricas (4 tarjetas)

| Tarjeta | Qué muestra |
|---|---|
| **Ingresos** | Suma de todos los movimientos tipo `ingreso` |
| **Egresos** | Suma de todos los movimientos tipo `egreso` |
| **Impuestos** | Solo egresos con categoría de impuesto (IVA, ISR, IMSS, etc.) |
| **Saldo neto** | `Ingresos − Egresos totales` (verde si positivo, rojo si negativo) |

---

## Modelo visual (gráfica)

Aparece automáticamente cuando hay al menos 1 movimiento registrado.  
Muestra 4 barras de colores:

- **Verde** → Ingresos totales  
- **Rojo** → Egresos (sin impuestos)  
- **Ámbar** → Impuestos registrados  
- **Azul / Rojo** → Saldo neto (color según signo)

Incluye leyenda con el monto exacto de cada barra.

---

## Registrar un movimiento

### Campos del formulario

| Campo | Descripción |
|---|---|
| **Tipo** | `Ingreso` (↑) o `Egreso` (↓) |
| **Fecha** | Fecha específica del movimiento (YYYY-MM-DD) |
| **Monto** | Cantidad en MXN |
| **Categoría** | Texto libre con sugerencias según el tipo |
| **Descripción** | Detalle del concepto |

### Categorías sugeridas

**Egresos:** Gasolina, Electricidad, Transporte, Renta, Sueldos, Publicidad, Internet, Materiales, IVA por pagar, ISR provisional, IMSS, INFONAVIT, Retención IVA, Retención ISR, Otros

**Ingresos:** Venta directa, Pago de tercero, Anticipo, Comisión, Reembolso, Otros

---

## Impuestos automáticos sobre ventas

Cuando el tipo es **Ingreso** y se escribe un monto, aparece el panel **"Impuestos sobre esta venta"**.

El usuario activa solo los impuestos que apliquen a esa venta:

| Impuesto | Tasa | Cálculo | Ejemplo sobre $1,000 |
|---|---|---|---|
| **IVA por pagar** | 16% | `monto × 0.16` | $160.00 |
| **Retención ISR** | 10% | `monto × 0.10` | $100.00 |
| **Retención IVA** | ~10.67% | `monto × 0.16 × 2/3` | $106.67 |

Al guardar, el sistema crea **automáticamente** un egreso por cada impuesto activado.  
La descripción del egreso queda vinculada al ingreso original:  
`"IVA por pagar — [descripción del ingreso]"`

### ¿Cuándo usar cada uno?

- **IVA por pagar** → En cualquier venta de producto o servicio con IVA (régimen general)
- **Retención ISR** → Cuando el cliente es persona moral y retiene el 10% de tus honorarios
- **Retención IVA** → Cuando el cliente retiene 2/3 del IVA (aplica en ciertos sectores)

---

## Registro rápido de impuestos

Chips de acceso rápido para registrar impuestos de forma independiente a una venta.  
Útil para: pagos provisionales mensuales, cuotas IMSS/INFONAVIT, declaraciones bimestrales.

| Chip | Impuesto | Cuándo usarlo |
|---|---|---|
| IVA por pagar | IVA trasladado acumulado | Declaración mensual al SAT |
| ISR provisional | Pago mensual estimado | Declaración mensual al SAT |
| IMSS | Cuotas patronales | Pago mensual si hay empleados |
| INFONAVIT | 5% sobre salario | Pago bimestral si hay empleados |
| Retención IVA | 2/3 del IVA retenido | Si ya fue retenida en cobro |
| Retención ISR | 10% retenido en honorarios | Si ya fue retenido en cobro |

Al tocar un chip: el formulario se pre-llena con `tipo = egreso`, categoría y descripción.  
Solo es necesario ingresar el **monto** y la **fecha**.

---

## Lista de movimientos

- Ordenada por fecha descendente (más reciente primero)
- Scroll interno (máx. 288px visible)
- Cada entrada muestra: tipo (↑/↓), descripción, fecha, categoría, monto
- Botón **✕** para eliminar un movimiento (acción inmediata en BD)

---

## Persistencia

Todos los movimientos se guardan en la base de datos en la tabla `movimientos_contables`.  
Se asocian al **usuario** y al **producto** — al recargar la página se restauran automáticamente.

### Endpoints API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/contabilidad/:productoId` | Lista movimientos del producto |
| `POST` | `/api/contabilidad/:productoId` | Crea un movimiento |
| `DELETE` | `/api/contabilidad/movimiento/:id` | Elimina un movimiento |

---

## Modelo de datos (`movimientos_contables`)

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `usuario_id` | UUID | Propietario del movimiento |
| `producto_id` | UUID | Producto al que pertenece |
| `tipo` | string | `'ingreso'` o `'egreso'` |
| `descripcion` | string | Concepto del movimiento |
| `categoria` | string | Categoría libre (IVA, Gasolina, etc.) |
| `monto` | decimal(12,2) | Importe en MXN |
| `fecha` | date | Fecha del movimiento (YYYY-MM-DD) |
| `fecha_creacion` | timestamp | Fecha de registro en sistema |
