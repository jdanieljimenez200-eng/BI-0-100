# Propuesta de planes y precios — septiembre 2026

> **Estado: aprobada el 2026-09-14 y aplicada; ajustada el mismo día con la estrategia 70/30 (sección 3b).** **Estimación, no medición.** Los costos de IA salen del tamaño real de los
> prompts del código y de las tarifas oficiales de Anthropic, con los modelos
> asignados en `backend/src/config/anthropic.ts`. En cuanto haya tráfico real, el
> panel **Admin → Costos de IA** da el número exacto; si difiere más de un 30 %,
> se ajustan los créditos (no los precios).

## 1. Costo de IA por análisis

Supuestos: español ≈ 2.8 caracteres por token con el tokenizador de Sonnet 5 y
Opus 5 (3.6 en Haiku); razonamiento adaptativo en `medium` añade ~40–60 % a la
salida; salida típica ≈ 70 % del máximo configurado.

| Análisis | Llamadas (modelo) | Costo estimado |
|---|---|---|
| Mercado | DAFO + reporte BI (Sonnet 5) | **$0.054** |
| Marketing | copies (Haiku 4.5) + calendario 2 semanas (Sonnet 5) | **$0.124** |
| Legal | dictamen (Opus 5) | **$0.218** |
| Finanzas | riesgos (Sonnet 5) | **$0.019** |
| Brief de marca | identidad (Sonnet 5) | **$0.023** |
| Ventas | tips + historia + perfil de cliente (Sonnet 5) | **$0.090** |
| **Suite completa (los 6)** | | **$0.53** |

Acciones bajo demanda:

| Acción | Modelo | Costo |
|---|---|---|
| Objeciones, guion en texto, análisis de competidor, comparativa | Sonnet 5 | $0.030 |
| Guion con video (frames + transcripción Whisper ~2 min) | Sonnet 5 + Whisper | $0.060 |
| Competidor con foto | Sonnet 5 | $0.034 |
| Follow-ups, palabras clave de ads | Haiku 4.5 | $0.008 |
| Diagnóstico de reporte de ads | Sonnet 5 | $0.042 |
| Análisis de logo | Sonnet 5 | $0.022 |
| Resumen de alertas | Haiku 4.5 | $0.005 |

Antes de este cambio (todo en Sonnet 4.6 y visión en Fable 5.1) la suite rondaba
$0.55 y un guion con video ~$0.19. Legal en Opus 5 es el 41 % del costo de la
suite: es el análisis que más cuesta y el que más valor percibido tiene.

**Cuenta gratuita** (análisis recortados, sin Legal, una sola vez): **~$0.17** por
cuenta nueva. Es el costo de adquisición en IA.

### 1b. Actualización 2026-10 · modelos 5.5

Sonnet 5 → **Sonnet 5.5** (mismo precio, $2 / $10) y Opus 5 → **Opus 5.5**
($4 / $20, antes $5 / $25; lectura de caché a 0.05×). Las tareas mecánicas dejan
Haiku 4.5 por Sonnet 5.5 con effort `low`, y los copies y los mensajes de Ventas
ahora llevan el modo de su módulo (~2 500 tokens, cacheados desde 512 tokens).
Re-estimación con los mismos supuestos:

| Concepto | Antes | Ahora |
|---|---|---|
| Legal (dictamen) | $0.218 | **~$0.174** (−20 %) |
| Marketing (copies de la estrategia recomendada + calendario) | $0.124 | **~$0.136** (copies ~$0.005 → ~$0.017) |
| Follow-ups, palabras clave de ads (0 créditos) | $0.008 | **~$0.015** |
| Resumen de alertas | $0.005 | **~$0.010** |
| **Suite completa** | $0.53 | **~$0.50** |

Marketing ya rozaba el tope de 2 créditos (≈ $0.12) y ahora lo pasa un ~13 %, por
debajo del umbral del 30 % para tocar créditos. Revisarlo con el panel de costos
en cuanto haya tráfico real.

## 2. Créditos de IA

"Ilimitado" deja la puerta abierta a que una sola cuenta (o una cuenta robada)
se coma el margen. Se propone **1 crédito ≈ $0.06 de costo máximo**:

| Acción | Créditos |
|---|---|
| Mercado, Finanzas, Brief | 1 |
| Marketing | 2 |
| Ventas (análisis) | 2 |
| Legal | 4 |
| Cada acción bajo demanda (objeciones, guion, competidor, logo, reporte de ads…) | 1 |
| Follow-ups, palabras clave, resúmenes de alertas | 0 (incluidos) |

Una suite completa = **11 créditos**. Un análisis que cae a plantilla
(`resultado_estimado`) **no consume créditos**.

## 3. Planes propuestos

Moneda: **MXN con IVA incluido** para México (tarjetas locales sin comisión de
cambio, y el cliente objetivo ya piensa en pesos; `/pricing` ya mostraba MXN).
Para otros países, el mismo plan en USD redondeado. Anual = 10 meses (2 gratis).

| | **Gratis** | **Emprendedor** | **Negocio** | **Empresa** | **Enterprise** |
|---|---|---|---|---|---|
| Clave interna | `freemium` | `pro` | `pro_plus` | `business` | `enterprise` |
| Precio mensual | $0 | **$299 MXN** · $17 USD | **$599 MXN** · $33 USD | **$1,199 MXN** · $65 USD | desde **$4,999 MXN** · $279 USD |
| Anual | — | $2,990 MXN | $5,990 MXN | $11,990 MXN | a medida |
| Créditos de IA / mes | 1 uso de cada análisis (sin Legal), una vez | **25** | **55** | **120** | **600** (ampliable) |
| Suites completas / mes | — | ~2 | ~5 | ~11 | ~55 |
| Productos | 1 | 5 | 10 | ilimitados | ilimitados |
| Herramientas (POS, inventario, reportes…) | todas, 2 movimientos c/u | 1 a elegir | 4 a elegir | todas | todas |
| Trabajadores | 0 | 2 | 5 | 10 | ilimitados |
| Análisis Legal | — | ✓ | ✓ | ✓ | ✓ |
| Alertas automáticas | — | — | ✓ | ✓ | ✓ |
| Marca propia (white label) | — | — | — | ✓ | ✓ |
| Comisión POS (Stripe Connect) | — | 1.5 % | 1.2 % | 0.9 % | 0.9 % |

Las funciones por plan son las que ya define `planService.ts`; lo que cambia es
precio, moneda y créditos en lugar de "ilimitado".

## 3b. Ajuste 70/30 (anclaje hacia el plan medio)

El plan de entrada se sube a **$449 MXN (75 % del Negocio)** y se recorta a
propósito: 1 herramienta, 3 productos, 1 trabajador, **20 créditos** y **sin Legal
ni evaluador de guiones/competidores**. El Negocio pasa a **60 créditos**. Por
$150 más el Negocio da 3× créditos, 4× herramientas, 3× productos, Legal y los
evaluadores: es la compra obvia. Empresa ($1,199) cuesta el doble del Negocio y
ancla por arriba.

| | Emprendedor | **Negocio** | Empresa |
|---|---|---|---|
| Precio | $449 | **$599** | $1,199 |
| Créditos | 20 | **60** | 120 |
| Créditos por cada $100 | 4.5 | **10** | 10 |
| Herramientas | 1 | **4** | 7 |
| Productos / trabajadores | 3 / 1 | **10 / 5** | ∞ / 10 |
| Legal, guiones y competidores | — | **✓** | ✓ |

Margen del Emprendedor a $449 con 20 créditos: ~91 % en uso máximo. El resto de
la sección 4 sigue vigente para Negocio (60 créditos → ~84 %), Empresa y Enterprise.

Se corrigió además lo que el código no cumplía: Legal no estaba bloqueado en el
plan gratuito, las herramientas elegidas no se recortaban al bajar de plan, los
movimientos contables manuales no tenían el tope gratuito, y las páginas
anunciaban alertas por WhatsApp/email y comisión del POS que no existen.

## 4. Margen

Supuestos: tipo de cambio 18 MXN/USD · IVA 16 % · Stripe México 3.6 % + $3 MXN
(+ IVA sobre la comisión) · infraestructura ~$60 USD/mes repartida entre 100
clientes de pago ($0.60 por cuenta) · uso típico = 35 % de los créditos.

| Plan | Ingreso neto (sin IVA ni Stripe) | IA al usar el 100 % de créditos | Margen en uso máximo | IA en uso típico | Margen típico |
|---|---|---|---|---|---|
| Emprendedor $299 | $13.43 | $1.56 | **84 %** | $0.55 | **92 %** |
| Negocio $599 | $27.10 | $3.44 | **85 %** | $1.20 | **93 %** |
| Empresa $1,199 | $54.45 | $7.50 | **85 %** | $2.63 | **94 %** |
| Enterprise $4,999 | $227.62 | $37.50 | **83 %** | $13.13 | **94 %** |

Sensibilidad: si los tokens reales salen un **50 % más altos**, el margen en uso
máximo baja a ~77–79 % y el típico se queda por encima del 88 %. En ese caso se
recortan créditos, no se suben precios.

## 5. Comparado con lo que había

| | Código actual (Stripe, USD) | Propuesta |
|---|---|---|
| Pro | $19 USD, análisis ilimitados | $299 MXN (~$17), 25 créditos |
| Pro Plus | $35 USD, ilimitados | $599 MXN (~$33), 55 créditos |
| Business | $49 USD, ilimitados | $1,199 MXN (~$65), 120 créditos |
| Enterprise | $149 USD, ilimitados | desde $4,999 MXN (~$279), 600 créditos |

Business sube porque hoy entrega todas las herramientas, 10 trabajadores, marca
propia e IA ilimitada por $49: con un uso intenso (4 suites diarias) el costo de
IA supera el precio.

## 6. Qué implica aplicarlo

1. Crear en Stripe los precios nuevos (MXN mensual y anual, y USD para otros
   países) y poner sus IDs en las variables `STRIPE_PRICE_*`.
2. `planService.ts`: precios, `creditos_ia_mes` y quitar `max_analisis_por_modulo: -1`.
3. Créditos: consumo desde `uso_ia` + tabla de costo por acción, respuesta 402
   con oferta de subir de plan, barra de créditos en el dashboard.
4. `/pricing` y `/dashboard/billing` leyendo de `GET /api/billing/planes` para
   que precio mostrado y precio cobrado no vuelvan a separarse.
5. Suscriptores actuales: mantener su precio viejo hasta la renovación
   (grandfathering) o migrarlos con aviso de 30 días.
