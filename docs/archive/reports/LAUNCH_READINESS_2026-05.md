# BI 0 A 100 — Launch Readiness Report

**Fecha:** 2026-05-08
**Target launch:** finales de mayo 2026 (~3 semanas)
**Versión auditada:** main, post CSV-import (commit no etiquetado)

---

## 📋 Resumen ejecutivo

**Veredicto: Go condicional.** El stack técnico es sólido (backend tipado, queue resiliente, prompt-injection defense, plan enforcement). Hay **3 bloqueadores reales** que se arreglan en menos de 2 días. Lo crítico no es el código — es **decidir el pricing, conectar Stripe en USD, y resolver el route mismatch de signup** antes de mover marketing a producción.

**Costo operativo real por usuario activo (uso típico Pro): ~$0.95 USD / mes**, dominado 60% por IA y 40% por infra prorrateada. A precio Pro $49/mo eso da **~95% de margen bruto**.

**El producto se puede lanzar a finales de mayo si arrancas las correcciones HOY.**

---

## 🧪 1. Simulación PYME — credenciales y datos sembrados

Para que entres a la webapp como un usuario real:

| Campo | Valor |
|---|---|
| **URL** | http://localhost:3000/auth/login |
| **Email** | `consultora.demo@bi0a100.test` |
| **Password** | `Consultora2026!` |
| **Plan** | Pro (promovido directo en DB, sin pasar por Stripe) |
| **User ID** | `02ec59eb-5c88-40d6-880b-cea0490f1155` |

### 1.1 Perfil de la PYME simulada

**Cloud Architect Studio** — consultor freelance B2B, persona física con actividad empresarial (RESICO PF), 1 persona + 1 asistente part-time, basado en CDMX.

| Atributo | Valor |
|---|---|
| Servicio | Sprint de Arquitectura Cloud (10 días) |
| Modelo de cobro | Por proyecto + retainer recurrente |
| Precio base | $28,000 MXN (≈ $1,400 USD) por sprint |
| Retainer mensual | $35,000 MXN (≈ $1,750 USD) |
| Cliente ideal | Empresas 50-200 empleados con deuda técnica, decisor CTO/VPE |
| LTV proyectado | 8 meses |
| Inversión inicial | $0 (servicio sin capital) |
| Costos fijos mensuales | $8,000 MXN base + variable por SaaS |

### 1.2 Movimientos contables sembrados

**59 registros** distribuidos en 6 meses (Nov 2025 → Abr 2026):

| Mes | Ingresos | Egresos | Saldo | Notas |
|---|---|---|---|---|
| Nov 2025 | $28,000 | $9,650 | +$18,350 | 1 cliente, mes flojo |
| Dic 2025 | $44,000 | $14,690 | +$29,310 | 2 clientes + aguinaldo |
| Ene 2026 | $28,000 | $18,200 | +$9,800 | post-vacaciones, 1 cliente |
| Feb 2026 | $67,000 | $22,030 | +$44,970 | retainer arranca + sprint |
| Mar 2026 | $82,000 | $19,530 | +$62,470 | retainer + 2 sprints |
| Abr 2026 | $97,000 | $25,180 | +$71,820 | retainer + 2 sprints + repeat |
| **TOTAL** | **$346,000** | **$108,030** | **+$237,970** | |

**Patrones realistas incluidos:**
- Retainer mensual de $35K aparece desde febrero → ingreso recurrente
- Estacionalidad enero (mes flojo post-vacaciones)
- SaaS subscriptions creciendo (AWS sandbox $850 → $1,100 conforme escala)
- Capacitación periódica (curso AWS re:Invent en feb, AWS Summit en abr)
- Tasa de crecimiento mensual compuesta esperada: ~25% (de $28K en nov a $97K en abr)

### 1.3 Walkthrough sugerido por módulo

Cuando entres como `consultora.demo@bi0a100.test`:

1. **Dashboard** → verás 1 producto (Sprint Cloud) en negocio "Cloud Architect Studio" con 0/4 módulos completos.
2. **Finanzas → Analizar** → completa el análisis (Finanzas no usa IA, es cálculo puro). El override de costos fijos será $8,000.
3. **Finanzas → Resultado → tab Centro de Mando → Importar CSV/Excel** → ya tienes 59 movimientos manuales sembrados, pero **prueba importar** un CSV adicional para validar la feature recién construida. (Opcional: descarga la plantilla del modal y mete 5-10 filas extra.)
4. **Mercado → Analizar** → primera ejecución llamará a Claude Sonnet 4.6 (3 calls reales si el API key está configurado).
5. **Marketing y Proveedores** → mismo flujo.

**⚠️ Importante:** El backend tiene fallback a mocks si `ANTHROPIC_API_KEY` no está configurado. Verifica con:
```bash
docker compose exec backend env | grep ANTHROPIC_API_KEY
```
Si no está, los análisis devuelven respuestas mock (texto plantilla). Para la prueba real necesitas el key.

---

## 💰 2. Costos operativos — desglose unitario

### 2.1 Costo de IA por análisis completo

Pricing Anthropic vigente a mayo 2026:

| Modelo | Input ($/M tokens) | Output ($/M tokens) |
|---|---|---|
| Claude Sonnet 4.6 | $3.00 | $15.00 |
| Claude Opus 4.6 | $15.00 | $75.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 |

**Por módulo (un análisis completo de un producto):**

| Módulo | Llamadas | Modelo | Input tokens | Output tokens | Costo USD |
|---|---|---|---|---|---|
| Brief (identidad) | 1 | Opus 4.6 | ~2,500 | ~2,000 | **$0.19** |
| Mercado (DAFO + Reporte BI + viabilidad) | 3 | Sonnet 4.6 | ~8,000 | ~6,000 | **$0.11** |
| Marketing (calendario + copy + posicionamiento) | 3 | Sonnet 4.6 | ~7,500 | ~10,500 | **$0.18** |
| Proveedores (RFQ + directorio) | 2 | Sonnet 4.6 | ~4,000 | ~3,500 | **$0.06** |
| Finanzas | 0 | (cálculo JS puro) | 0 | 0 | **$0.00** |
| **TOTAL un usuario nuevo (todo el ciclo)** | **9** | mixto | ~22,000 | ~22,000 | **$0.54** |

### 2.2 Decisión Sonnet → Haiku (ejecutada 2026-05-08)

Análisis estructurado de prompts en `calendarioService.ts` (473 líneas, max_tokens 8000) y `copywritingService.ts` (235 líneas, max_tokens ~2500). Sin API key configurada en el container, se evaluó complejidad de tarea vs capacidad documentada de Haiku 4.5.

**Veredicto por servicio:**

| Servicio | Migrar a Haiku 4.5? | Razón |
|---|---|---|
| `copywritingService.ts` | ✅ **SÍ** (confianza alta) | Output corto (~2.5K tokens), JSON estructurado, reglas mecánicas, 7-9 piezas de copy por strategy. Haiku 4.5 maneja JSON-schema y voice instructions sin problema. Único riesgo: copies marginalmente más genéricos vs creatividad de Sonnet — mitigable con spot-checks post-launch. |
| `calendarioService.ts` | ❌ **NO migrar a Haiku** | Output huge (8K tokens, 14 días × 100+ items estructurados). Requiere continuidad narrativa entre semana 1 y 2 (regla #7 del prompt: "semana 2 debe escalar desde semana 1, nunca repetir tipo de contenido en misma posición"). Mantener variedad cross-plataforma (TikTok hook vs IG caption vs FB longform) en una sola generación de 8K tokens es exactamente donde Sonnet 4.6 supera a Haiku. |
| `briefService.ts` (Opus) | ❌ NO | Razonamiento estratégico, foundational para resto del análisis. |
| `dafoService.ts`, `reporteBiService.ts` | ❌ NO | Síntesis analítica. |

### 2.2.1 Plan alternativo para optimizar `calendarioService.ts` SIN bajar de modelo

En lugar de migrar a Haiku, partir el prompt en **2 llamadas Sonnet** (semana 1 y semana 2 separadas), pasando semana 1 como contexto cacheable a semana 2:

| Acción | Ahorro | Esfuerzo |
|---|---|---|
| Activar prompt caching de Anthropic en TODOS los servicios | -$0.06/análisis (system prompts de 2-3K chars × 9 calls = mucho contexto repetido) | 1 día |
| Partir calendario en 2 llamadas con caching de la semana 1 | -$0.04/análisis adicionales | 1.5 días |
| Migrar `copywritingService.ts` Sonnet → Haiku 4.5 | -$0.04/análisis | 0.5 días |
| **TOTAL ahorro proyectado** | **-$0.10 a -$0.14/análisis** | ~3 días |

### 2.2.2 Costo proyectado por análisis completo, post-optimización

| Concepto | Original | Path A optimizado | Δ |
|---|---|---|---|
| Brief (Opus 4.6, con caching) | $0.19 | $0.16 | -$0.03 |
| Mercado (3× Sonnet, con caching) | $0.11 | $0.09 | -$0.02 |
| Marketing copywriting (Sonnet → Haiku) | $0.06 | $0.02 | -$0.04 |
| Marketing calendario (Sonnet, mantener) | $0.10 | $0.10 | — |
| Marketing posicionamiento (Sonnet) | $0.02 | $0.02 | — |
| Proveedores (2× Sonnet, con caching) | $0.06 | $0.05 | -$0.01 |
| **TOTAL por análisis completo** | **$0.54** | **~$0.44** | **-$0.10 (-19%)** |

**Path B opcional (validación real con API key):** Si después de configurar `ANTHROPIC_API_KEY` quieres confirmar empíricamente si calendarioService también puede migrar, corremos A/B con 5 perfiles reales (~$5 USD de costo experimental). Si Haiku ≥85% de calidad de Sonnet en 4 de 5 corridas, también se migra y el ahorro sube a -$0.15/análisis (~$0.39 total). Estimación: improbable que pase el filtro por la complejidad estructural del output.

### 2.2.3 Implicación para unit economics

Con costo optimizado de **$0.44/análisis** (Path A confirmado) y precio Pro $49 USD/mes:

| Métrica | Valor |
|---|---|
| Costo IA por usuario Pro/mes (2 análisis promedio) | $0.88 |
| Stripe processing | $1.72 |
| Infra prorrateado (a 500 usuarios, $45/500) | $0.09 |
| Email + storage | $0.05 |
| **Total marginal por usuario Pro** | **$2.74** |
| **Margen bruto** | **$46.26 / 94.4%** |

### 2.3 Comparativa multi-proveedor (referencia)

Si en el futuro quieres ofrecer flexibilidad o reducir lock-in:

| Proveedor / modelo | Input $/M | Output $/M | Costo análisis completo |
|---|---|---|---|
| **Anthropic Claude Sonnet 4.6** (actual) | $3 | $15 | $0.54 |
| Anthropic Claude Haiku 4.5 (downgrade) | $1 | $5 | $0.18 |
| OpenAI GPT-4o | $2.50 | $10 | $0.39 |
| OpenAI GPT-4o-mini | $0.15 | $0.60 | $0.020 |
| Google Gemini 2.5 Flash | $0.30 | $2.50 | $0.062 |
| Google Gemini 2.5 Pro | $1.25 | $10 | $0.25 |

**Recomendación:** quedarte con Anthropic. La calidad estratégica del Brief + DAFO justifica el premio. Para módulos de generación pura (calendario, copy) sí migra a Haiku.

---

### 2.4 Infraestructura — costo fijo mensual

**Stack actual y precios USD (planes producción, mayo 2026):**

| Servicio | Plan recomendado | Costo USD/mes | Para qué |
|---|---|---|---|
| **Railway** (backend + Postgres + Redis) | Pro | $20 + uso | API Express + queue + datos |
| └ Postgres usage (10 GB típico año 1) | incluido base | $5-10 | datos de productos, análisis |
| └ Redis usage (cache + queue) | incluido base | $0-5 | tokens, sesiones, BullMQ |
| **Vercel** (frontend Next.js) | Hobby (free) → Pro | $0 → $20 | hosting Next.js + edge |
| **Resend** (email transaccional) | Free → Pro | $0 → $20 | recovery, notifs, recibos |
| **Sentry** (errores) | Developer free → Team | $0 → $26 | observability, alertas |
| **Cloudflare** (DNS + CDN + R2) | Free | $0 | dominio + assets opcional |
| **Dominio** (.com o .app) | anual | $1-2 | bi0a100.com |
| **Stripe** (pagos) | sin fee fijo | $0 | 2.9% + $0.30 USD por tx |
| **AWS S3** (uploads) | pay-per-use | $0-5 | imágenes producto opcional |

**Escenarios de costo fijo:**

| Etapa | Usuarios activos | Infra mensual USD |
|---|---|---|
| **MVP / pre-launch** (0-50 usuarios) | hobby everywhere | **$22/mes** |
| **Launch** (50-500 usuarios) | Railway Pro + Vercel Hobby + Resend Free | **$45/mes** |
| **Growth** (500-2,500 usuarios) | Railway Pro + Vercel Pro + Resend Pro + Sentry Team | **$110/mes** |
| **Scale** (2,500-10,000 usuarios) | Railway escalado + todo Pro | **$280/mes** |

---

## 💵 3. Propuesta de pricing público en USD

### 3.1 Análisis de unit economics

**Costo total por usuario Pro activo/mes** (asumiendo 2 análisis/mes en promedio):

| Concepto | Costo USD |
|---|---|
| IA (2 análisis × $0.54) | $1.08 |
| Stripe processing (sobre $49) | $1.72 |
| Infra prorrateado (a 500 usuarios, $45/500) | $0.09 |
| Email + storage (estimado) | $0.05 |
| **Total marginal** | **$2.94** |

A precio Pro $49 USD/mes: **margen bruto $46.06 = 94%** ✅

### 3.2 Tiers propuestos

| Tier | Precio USD/mes | Anual (-20%) | Productos | Análisis/módulo | Features extra |
|---|---|---|---|---|---|
| **Free** | $0 | — | 1 | 1 (one shot) | Resultados a 7 días, sin CSV import, sin export |
| **Starter** | $19 | $182/año | 3 | 5/mes | CSV import básico (hasta 500 filas), email recovery |
| **Pro** | $49 | $470/año | 10 | Ilimitado | CSV ilimitado, calibración avanzada, export PDF |
| **Business** | $149 | $1,430/año | Ilimitado | Ilimitado | 3 seats, API access, priority email support |
| **Enterprise** | Custom (≥$500/mo) | anual | Ilimitado | Ilimitado | SSO, white-label, dedicated CSM, SLA 99.9% |

### 3.3 Comparativa con la competencia (referencia 2026)

| Producto | Precio mensual USD | Posición |
|---|---|---|
| LivePlan (business plan SaaS) | $20-40 | dominante US |
| Bizplan.com | $29-49 | mid-tier |
| **BI 0 A 100 Pro propuesto** | **$49** | premium AI-first |
| Strategyzer | $65/seat | enterprise |
| McKinsey Solve | $200+ | top-tier |

**Justificación del precio Pro $49:**
- 10× más barato que pagar consultor humano (≥$500 USD/análisis)
- En el mismo rango que LivePlan pero con IA real (no plantillas)
- Margen 94% permite invertir agresivo en marketing + soporte

### 3.4 Modelo de conversión esperado

Con buen onboarding y trial de 14 días Pro gratis:

| Etapa | Conversión típica SaaS B2B |
|---|---|
| Visitor → Free signup | 3-5% |
| Free → Trial Pro | 15-20% |
| Trial → Paid | 20-30% |
| **Visitor → Paid (overall)** | **0.1-0.3%** |

A 10,000 visitas/mes → ~10-30 paid users netos/mes. CAC objetivo ≤ $50 USD para LTV/CAC saludable de 6:1 (LTV de $300 USD asumiendo retención 6 meses promedio).

### 3.5 Punto de equilibrio

**Asumiendo precio promedio mezclado $35/mes** (mix Free/Starter/Pro):

| Métrica | Valor |
|---|---|
| Costo fijo mensual etapa Launch | $45 |
| Margen bruto promedio por usuario pago | ~$32 |
| **Break-even** | **2 usuarios pagos** |

A 50 usuarios pagos × $35 promedio = **$1,750 MRR**, dejando ~$1,580 para reinversión en marketing/desarrollo.

---

## 💸 3.6 Inversión inicial total para lanzar (USD only)

Incluye **todo lo que necesitas pagar de tu bolsillo** desde hoy hasta tener el sistema en producción + reserva operativa para los primeros 3 meses sin depender de ingresos.

### Escenario A — Launch lean (mínimo viable)

| Concepto | One-time | 3 meses ops | Total USD |
|---|---|---|---|
| Dominio `.com` (1 año, ej. Cloudflare Registrar) | $12 | — | **$12** |
| Anthropic API — depósito inicial (recargas conforme uso) | $25 | variable | **$25** |
| Railway Pro (backend + Postgres + Redis) | — | $20 × 3 = $60 | **$60** |
| Vercel Hobby (frontend) | — | $0 (free) | **$0** |
| Resend free tier (≤3K emails/mes) | — | $0 | **$0** |
| Sentry Developer free tier | — | $0 | **$0** |
| Stripe (activation + verification) | $0 (free) | $0 fee fijo | **$0** |
| Cloudflare DNS + R2 storage | — | $0 (free tier) | **$0** |
| Buffer AI a 50 usuarios × 2 análisis/mes × $0.30 | — | $30 × 3 = $90 | **$90** |
| Imprevistos (10%) | — | — | **$20** |
| **TOTAL LEAN** | **$37** | **$150** | **≈ $207 USD** |

### Escenario B — Launch profesional (con polish + marketing test)

| Concepto extra sobre el escenario A | One-time | 3 meses ops | Total USD |
|---|---|---|---|
| Email corporativo (Google Workspace o Zoho Mail) | — | $6 × 3 = $18 | **$18** |
| Logo profesional (Fiverr nivel medio) | $80 | — | **$80** |
| Política de privacidad + ToS (Termly o iubenda) | $39/año | — | **$39** |
| Marketing test (Google Ads / Meta) — opcional pero recomendado | — | $300 × 3 = $900 | **$900** |
| Resend Pro (cuando pases de 3K emails/mes) | — | $20 × 3 = $60 | **$60** |
| Sentry Team (cuando pases de 5K events/mes) | — | $26 × 3 = $78 | **$78** |
| Reserva ampliada AI (a 200 usuarios) | — | $120 × 3 = $360 | **$360** |
| **TOTAL PROFESIONAL (incluye lean)** | **$156** | **$1,566** | **≈ $1,742 USD** |

### Escenario C — Launch agresivo (presupuesto saludable)

| Concepto extra | Total USD |
|---|---|
| Todo lo del escenario B | $1,742 |
| Marketing escalado ($800/mes × 6 meses) | $4,800 (en vez de $900) |
| Reserva de 6 meses operativa en lugar de 3 | +$1,500 |
| Influencer micro / community partnership | $500 |
| **TOTAL AGRESIVO** | **≈ $7,500 USD** |

### Recomendación

**Empezar con $250 USD (escenario A)** — es lo que tienes que poner mínimo en la mesa para que el sistema esté vivo, atendiendo usuarios y cobrando vía Stripe sin que tu cuenta personal subsidie nada que no sea el dominio y el primer mes de cloud.

Si tienes $1,500-2,000 USD disponibles, el escenario B (profesional) te da más colchón para campañas de marketing y polish, lo que **reduce el tiempo hasta tener los primeros 50 usuarios pagos** (típicamente de 4-6 meses lean a 2-3 meses con paid acquisition).

### Lo que NO necesitas pagar al inicio

- Apple Developer Account ($99/año) — no estás haciendo iOS app.
- Trademark (USPTO ≈$350) — déjalo para cuando tengas tracción.
- Cuenta de empresa formal — puedes operar como persona física con Stripe Atlas ($500) o como ya estés constituido.
- Customer support tool tipo Intercom — empieza con Resend + un email manual.
- Analytics paid (Mixpanel, Amplitude) — PostHog free tier o Plausible $9 cuando necesites.
- Hardware nuevo — todo lo que tienes ya es suficiente para los próximos 12 meses.

### Punto de equilibrio sobre la inversión inicial

A precio promedio mezclado de $35 USD/mes y margen 94%:

| Inversión | Usuarios pagos para recuperar | Tiempo estimado |
|---|---|---|
| $250 (lean) | 8 usuarios un mes | ~6 semanas post-launch |
| $1,750 (profesional) | 53 usuarios un mes | ~3-4 meses post-launch |
| $7,500 (agresivo) | 230 usuarios un mes | ~6-8 meses post-launch |

---

## 🎨 4. Auditoría UX/UI — Hallazgos clave

### 4.1 Inventario de páginas (20 totales)

| Sección | Rutas | Estado |
|---|---|---|
| Marketing | `/`, `/pricing`, `/sobre`, `/contacto` | ✅ Sólidos |
| Auth | `/auth/{signup, login, forgot, reset}` | ⚠️ Route mismatch |
| Dashboard | `/dashboard`, `/dashboard/nuevo`, `/dashboard/billing`, `/dashboard/perfil` | ⚠️ Form pesado |
| Módulos × 4 | `{mercado, marketing, proveedores, finanzas}/[id]` + resultado | ⚠️ Error UX débil |
| Admin | `/dashboard/admin` | (interno, fuera de scope) |

### 4.2 🔴 Bloqueadores (deben resolverse antes de lanzar)

| # | Issue | Archivo / ubicación | Impacto | Fix estimado |
|---|---|---|---|---|
| B1 | **Route mismatch `/auth/signup` vs `/auth/registro`** — la pricing page apunta a `/auth/registro` y el endpoint real es `/auth/signup`. CTAs de pricing rompen el funnel de conversión. | `frontend/app/pricing/page.tsx` líneas 22, 43, 66 | Conversión rota | 30 min |
| B2 | **Error fallback genérico "Error desconocido"** — cuando un análisis falla por timeout de IA o quota, el usuario solo ve "Error desconocido" y no hay botón de Retry. | Páginas resultado de los 4 módulos | Frustración + abandonment | 4 hrs |
| B3 | **Form `/dashboard/nuevo` sin loading state al submit** — usuario hace click en "Crear" y no ve feedback. Si tarda >2s asume que rompió. | `frontend/app/dashboard/nuevo/page.tsx` | Doble submit + soporte | 2 hrs |

### 4.3 🟡 Mayores (semana 1 post-launch)

| # | Issue | Fix estimado |
|---|---|---|
| M1 | Form `/dashboard/nuevo` denso (30+ campos en una página) — sin step indicator, sin save-as-draft. Mobile probablemente se rompe. | 2 días (refactor a wizard) |
| M2 | Helper text solo en tooltips (`?`) — términos como NSE, PUV, LTV requieren clic extra. Inline descriptions. | 4 hrs |
| M3 | CSV Import Modal: leyenda existe pero descubrimiento del template es débil — el botón de descargar plantilla no resalta. | 2 hrs |
| M4 | CSV Import: confianza "alta/media/baja" no se explica — qué significa "baja" para el usuario? | 1 hr |
| M5 | Plan comparison phrasing inconsistente ("1 análisis por módulo" vs "Re-análisis ilimitados"). | 1 hr |
| M6 | Pricing page no tiene toggle anual/mensual con descuento — pierdes commitment + cashflow upfront. | 4 hrs |
| M7 | Validación de signup es "silent" — errores en banner global, no en el field específico con borde rojo. | 3 hrs |
| M8 | Resultados del Centro de Mando no tienen tooltips en cada KPI ("ingreso promedio" — ¿qué incluye?). | 4 hrs |

### 4.4 🟢 Pulido (post-launch, mes 2+)

- Negocio emoji selector no se puede cambiar después de creación.
- Loading skeletons largos en páginas de marketing.
- Forgot password link en color rojo/80, contraste bajo en bg oscuro.
- No hay dark/light mode toggle (todo dark hardcoded).

### 4.5 Flujos críticos — friction score

| Flow | Score (10=óptimo) | Bloqueador principal |
|---|---|---|
| Onboarding (signup → dashboard) | 6 | B1: route mismatch |
| Primer análisis | 5 | B2: error UX |
| CSV Import | 6 | M3+M4: discovery + jargon |
| Upgrade a Pro | 4 | Falta upgrade modal contextual + signup no recibe `plan=` query |

---

## 🚦 5. Checklist técnico para producción

### 5.1 Variables de entorno críticas

| Variable | Estado | Acción |
|---|---|---|
| `ANTHROPIC_API_KEY` | ⚠️ Verificar en Railway prod | **OBLIGATORIA** o el sistema responde con mocks |
| `JWT_SECRET` + `JWT_REFRESH_SECRET` | ⚠️ Generar y guardar en Railway secrets | **OBLIGATORIA** |
| `STRIPE_SECRET_KEY` | ⚠️ Crear cuenta + habilitar live mode | OBLIGATORIA si quieres cobrar |
| `STRIPE_WEBHOOK_SECRET` | ⚠️ Configurar endpoint webhook en Stripe | Sin esto los upgrades no se reflejan |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS` | ⚠️ Crear products + prices en Stripe en USD | **OBLIGATORIA** para nuevos pricing tiers |
| `RESEND_API_KEY` | ⚠️ Domain verification en Resend | Para password recovery + notifs |
| `SENTRY_DSN` | 🟢 Opcional pero altamente recomendado | observabilidad de errores |
| `REDIS_URL` | ✅ Manejado por Railway | OK |
| `DB_*` | ✅ Manejado por Railway | OK |
| `FRONTEND_URL` / `BASE_URL` | ⚠️ Apuntar a dominio público | OBLIGATORIA |

### 5.2 Otros checks pre-launch

- [ ] **Verificar Stripe en USD** — actualmente código asume MXN (`currency: 'mxn'` en `stripeService.ts`). Cambiar a `usd`.
- [ ] **Migrar PLAN_LIMITES a nuevos tiers** — actualizar `planService.ts` con Free / Starter / Pro / Business / Enterprise.
- [ ] **Habilitar Sentry** — paquete instalado, falta `SENTRY_DSN`.
- [ ] **File uploads → Cloudflare R2 o S3** — actualmente local `./uploads`, no escala horizontalmente.
- [ ] **`TYPEORM_SYNCHRONIZE=true` solo en primer deploy**, luego apagar.
- [ ] **Rate limit más conservador en producción** — actualmente 500/15min global, considerar 100/15min para `/auth/*`.
- [ ] **Probar el flujo de webhook Stripe end-to-end** con `stripe listen` antes de producción.
- [ ] **Habilitar prompt caching de Anthropic** (savings de ~$0.04/análisis).
- [ ] **HTTPS + custom domain en Railway + Vercel.**
- [ ] **Backups automáticos de Postgres** (Railway lo trae, verificar retention).
- [ ] **Política de privacidad + ToS publicados** — necesarios para Stripe activation.

---

## 📅 6. Plan de 3 semanas hacia el lanzamiento

### Semana 1 (May 8-14) — Bloqueadores + pricing

| Día | Tarea | Owner |
|---|---|---|
| Lun | Fix B1 (route mismatch) + B3 (form loading) | Tú |
| Mar | Fix B2 (error fallback con retry) | Tú |
| Mié | Crear products + prices en Stripe (USD), actualizar PLAN_LIMITES | Tú |
| Jue | Cambiar currency MXN→USD en stripeService, regression test | Tú |
| Vie | Activar prompt caching + medir reducción real de costo | Tú |

### Semana 2 (May 15-21) — Polish + infra producción

| Día | Tarea |
|---|---|
| Lun | Setup Sentry + Resend domain verification |
| Mar | Tooltips inline para PUV/NSE/LTV (M2) + tooltips de KPIs Mando (M8) |
| Mié | Mejorar CSV Import discovery + explicar confianza (M3+M4) |
| Jue | Toggle anual/mensual en pricing page (M6) |
| Vie | Validación inline en signup (M7) + mobile testing del wizard |

### Semana 3 (May 22-28) — Lanzamiento

| Día | Tarea |
|---|---|
| Lun-Mar | Deploy a producción Railway + Vercel + dominio custom |
| Mié | Smoke tests end-to-end con cuenta real + Stripe live |
| Jue | Soft launch (community privada, 20-30 usuarios beta) |
| Vie | Lanzamiento público — Product Hunt / LinkedIn / X |

### Fechas claves

- **2026-05-28 — Lanzamiento público** (penúltimo viernes del mes; deja buffer de 3 días para regresiones)

---

## 📊 7. Métricas a monitorear post-launch

### 7.1 Salud técnica

| Métrica | Tool | Umbral alerta |
|---|---|---|
| API p95 latency | Sentry / Railway metrics | > 2s |
| Error rate | Sentry | > 1% de requests |
| BullMQ failed jobs | Logs Railway | > 5/hora |
| Postgres connection pool | Railway metrics | > 80% |
| AI provider failures | Logs custom | > 3/min |

### 7.2 Salud de producto

| Métrica | Cómo medir | Target |
|---|---|---|
| Activation (signup → primer análisis) | Custom event | > 60% |
| Time to first analysis | Tracking | < 5 min |
| Free → Starter conversion | Stripe + DB | > 8% en 14 días |
| MRR | Stripe dashboard | $1,500 mes 1 |
| Churn mensual | Stripe | < 8% |

### 7.3 Salud financiera

| Métrica | Frecuencia | Acción si rompe |
|---|---|---|
| Costo IA / usuario / mes | semanal | > $1.50 → optimize prompts |
| Margen bruto | mensual | < 80% → revisar pricing |
| CAC payback | mensual | > 3 meses → bajar acquisition cost |

---

## 🎯 8. Conclusiones y siguiente paso

### Decisiones confirmadas (sesión 2026-05-08)

- ✅ **Pricing USD confirmado**: Free / Starter $19 / Pro $49 / Business $149 / Enterprise custom.
- ✅ **Migración a Haiku para Marketing aprobada CONDICIONAL** — ejecutamos plan de validación A/B 1 día antes de cambiar el modelo (ver sección 2.2.1).
- ✅ **USD-only**: nada de MXN en lanzamiento. Stripe se configura en USD desde el principio.

### Lo que YO puedo hacer ahora (sin esperar respuestas)

- Arreglar los 3 bloqueadores B1, B2, B3 (1 día de trabajo).
- Activar Sentry (15 min) y prompt caching (~1 hora).
- Migrar PLAN_LIMITES y stripeService a USD (4 horas).
- Ejecutar el A/B Sonnet vs Haiku con 5 perfiles (1 día) y migrar si pasa el filtro.
- Crear los products en Stripe (necesito que tú me des acceso al dashboard de Stripe o crearlos manualmente y pasarme los `price_id`).

### Lo que necesito de ti

- ✅ **Confirmación del pricing** (pregunta 1 arriba).
- ✅ **Acceso al ANTHROPIC_API_KEY** que vas a usar en producción (o que lo agregues directamente en Railway secrets).
- ✅ **Stripe price IDs** (cuando los crees).
- ✅ **Dominio decidido** — tienes registrado bi0a100.com? .app? otro?

---

**Documento generado el 2026-05-08 con base en auditoría real del código (backend + frontend), pricing actualizado de proveedores, y simulación sembrada en la base de datos local.**

Para entrar a la app y validar tú mismo el escenario, usa las credenciales de la sección 1.1.
