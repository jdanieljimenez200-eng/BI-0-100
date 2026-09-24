# DESIGN SYSTEM & INSPECTOR PROTOCOL (BI0A100)
**Standard: Apple + Tesla + SpaceX + Linear + Animate UI**
**Version**: 1.0.0 · Unified Executive Design System
**Regla de Oro**: *Ningún componente o pantalla puede implementarse o darse por concluido si rompe las reglas de este documento.*

---

## 1. MODO "DESIGN INSPECTOR" (Protocolo de Gobernanza)

Antes de codificar, modificar o dar por terminado cualquier componente, pantalla o herramienta:

1. **Inspección Previa**: Validar contra los 10 pilares medibles.
2. **Evaluación de Consistencia (0 a 100 pts)**:
   - Cada componente terminado se somete al *Checklist de Consistencia* (10 categorías de 10 puntos c/u).
   - **Puntuación mínima de aprobación: 95 / 100**.
   - Si la puntuación es **< 95**, se debe iterar de inmediato y corregir las discrepancias antes de continuar.
3. **Cero Emojis**: Prohibidos terminantemente en código fuente nuevo. Toda simbología visual debe ser vectorial (Lucide Icons).

---

## 2. TRIANGULACIÓN DE REFERENCIAS (Patrones Validados en ≥ 3 Marcas)

El sistema sintetiza exclusivamente patrones validados en al menos 3 de las 7 marcas de referencia:
- **Apple**: Curvatura continua concéntrica, tipografía dual-tracking, materiales esmerilados (*frosted glass*).
- **Tesla**: Paleta obsidian, minimalismo de controles, micro-bordes milimétricos, ergonomía táctil.
- **SpaceX**: Datos numéricos/telemetría monoespaciados, estética aeroespacial, retículas bento, badges con pulso en vivo.
- **Nike**: Jerarquía audaz, respiración visual generosa, microinteracciones ágiles.
- **Gemini**: Iluminación ambiental difusa (*chromatic glow*), micro-bordes con specular highlight.
- **Pinterest**: Densidad balanceada, modularidad de tarjetas, micro-steppers y acciones integradas sin fricción.
- **Animate UI / Linear**: Física de resorte (*spring physics*), densidad de comando ejecutivo, estados optimistas inmediatos.

---

## 3. ESPECIFICACIÓN TÉCNICA DE REGLAS MEDIBLES

### 3.1. Arquitectura de Color y Capas de Luminancia (Canvas Stacking)
La profundidad se genera mediante capas de luminancia oscura y luz ambiental, nunca con negro puro plano (`#000000`).

| Capa | Token / Hex | Propósito | Aplicación Tailwind |
| :--- | :--- | :--- | :--- |
| **L0 (Base Canvas)** | `#070E17` | Fondo general de la aplicación | `bg-[#070E17]` |
| **L1 (Superficie)** | `#0F1C2A` (o `rgba(15,28,42,0.75)`) | Tarjetas, contenedores, sidebars | `bg-[#0F1C2A]` / `bg-[#0F1C2A]/80` |
| **L2 (Elevado/Card)** | `#142436` | Tarjetas secundarias, inputs, filas | `bg-[#142436]` o `bg-white/[0.04]` |
| **L3 (Modal/Popover)**| `#182C42` | Modales, flyouts, menús flotantes | `bg-[#182C42]` o `bg-[#0F1C2A]` |
| **Glow Primario** | `rgba(16, 185, 129, 0.10)` | Halos esmeralda de actividad viva | `bg-emerald-500/10` / `blur-[140px]` |
| **Glow Secundario** | `rgba(59, 130, 246, 0.08)` | Halo de contraste azul/cian | `bg-blue-500/8` / `blur-[120px]` |

### 3.2. Micro-Bordes & Especularidad (Borders)
Quedan prohibidos los bordes sólidos de alto contraste opaco. Se utilizan micro-bordes de especularidad:
- **Borde Estándar**: `1px solid rgba(255, 255, 255, 0.08)` (`border-white/8` a `border-white/10`).
- **Borde en Foco / Hover**: `1px solid rgba(255, 255, 255, 0.20)` o color temático al 40% (`hover:border-white/20`, `hover:border-emerald-500/40`).
- **Borde Activo / Seleccionado**: `border-emerald-500/50` acompañado de sombra volumétrica.
- **Línea Divisoria Sutil**: `border-white/5` a `border-white/10` para separar secciones internas de una tarjeta.

### 3.3. Jerarquía Concéntrica de Radios (Corner Radii)
Fórmula matemática concéntrica estricta:
$$R_{interior} = R_{exterior} - \text{Padding}$$

| Nivel | Radio | Tailwind | Uso Exclusivo |
| :--- | :--- | :--- | :--- |
| **Contenedores Mayores** | 24px - 28px | `rounded-3xl` | Modales, paneles maestros, bento grid containers |
| **Tarjetas Principales** | 16px - 20px | `rounded-2xl` | Tarjetas de producto, KPI cards, paneles sticky |
| **Controles & Botones** | 10px - 14px | `rounded-xl` | Botones, inputs, selects, segmented tabs |
| **Micro-elementos** | 6px - 8px | `rounded-lg` | Steppers internos, sub-botones, mini-chips |
| **Pills & Status** | 9999px | `rounded-full` | Indicadores de estado, category pills, badges |

### 3.4. Escala de Alturas & Blancos Táctiles (Heights & Touch Targets)
Ningún elemento interactivo puede tener una altura arbitraria:
- **Hero / Botón Primario de Cobro**: `h-12` a `h-14` (48px a 56px), padding vertical `py-3.5` a `py-4`.
- **Botón Estándar / Input**: `h-10` a `h-11` (40px a 44px), padding vertical `py-2.5`.
- **Botón Compacto / Pill**: `h-8` a `h-9` (32px a 36px), padding vertical `py-1.5`.
- **Micro-Control / Stepper en Tarjeta**: `h-6` a `h-7` (24px a 28px), botones internos `w-5 h-5`.
- **Blanco Táctil Mínimo**: 36px × 36px en escritorio, 44px × 44px en móviles/tablets.

### 3.5. Espaciado y Ritmo Vertical / Horizontal (Padding & Gaps)
Basado estrictamente en escala de 4px / 8px:
- **Gap entre tarjetas**: `gap-3` (12px) en rejillas densas; `gap-4` a `gap-6` (16px a 24px) en vistas principales.
- **Padding interno de tarjetas**:
  - Compacta / Grid: `p-3.5` a `p-4` (14px - 16px).
  - Normal / Panel: `p-5` a `p-6` (20px - 24px).
  - Modal / Checkout: `p-6` a `p-8` (24px - 32px).
- **Separación entre bloques funcionales**: `space-y-4` o `space-y-6`.

### 3.6. Sombras y Elevación Lumínica (Shadows & Elevation)
- **Superficie plana / base**: Sin sombra o `shadow-sm`.
- **Tarjeta activa / hover**: `shadow-[0_0_20px_rgba(16,185,129,0.12)]` (halo esmeralda) o `shadow-lg`.
- **Botón Primario de Acción**: `shadow-[0_4px_24px_rgba(16,185,129,0.35)]`.
- **Modal / Floating Register**: `shadow-2xl` con backdrop blur `backdrop-blur-xl`.

### 3.7. Tipografía y Regla Dual-Tracking
Tipografía base: **Plus Jakarta Sans** (display y cuerpo) + **DM Mono** (cifras y folios).

| Nivel | Tamaño | Peso | Tracking | Color | Uso |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Title** | 24px - 30px (`text-2xl` a `text-3xl`) | Bold / Extrabold | `-0.025em` (`tracking-tight`) | `text-white` | Título de herramienta |
| **Card Heading** | 16px - 18px (`text-base` a `text-lg`) | Bold | `-0.015em` (`tracking-tight`) | `text-white` | Título de modal, panel |
| **Item Title** | 13px - 14px (`text-sm`) | Semibold | Normal | `text-white` | Nombre de producto/item |
| **Micro-Label** | 10px - 11px (`text-[10px]` a `text-[11px]`) | Bold / Extrabold | `+0.15em` (`tracking-widest` / `uppercase`) | `text-white/40` | Categorías, metadatos, tags |
| **Body / Texto** | 12px - 13px (`text-xs`) | Regular / Medium | Normal | `text-white/50` a `text-white/70` | Descripciones, notas |
| **Telemetría / Cifras** | 13px a 24px (`font-mono`) | Bold / Extrabold | `font-mono` | `text-emerald-300` / `text-white` | Precios, folios, métricas, % |

### 3.8. Iconografía (Lucide SVG Scale)
- **Micro-Icono** (dentro de pills, badges, inputs): `w-3 h-3` o `w-3.5 h-3.5` (12px - 14px).
- **Icono Estándar** (botones, tabs, listados): `w-4 h-4` (16px).
- **Icono Destacado** (encabezados de tarjetas, KPIs): `w-5 h-5` dentro de contenedor `w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20`.
- **Icono Hero / Modal Éxito**: `w-6 h-6` a `w-8 h-8` dentro de avatar `w-12 h-12` a `w-14 h-14`.
- **Stroke Width**: Uniforme en `strokeWidth={1.75}` o `strokeWidth={2}`. Prohibido mezclar grosores dispares.

### 3.9. Tiempos y Curvas de Animación (Motion & Springs)
- **Hover Transitions**: `duration-200 ease-out` o `transition-all duration-300`.
- **Modales & Overlays (Framer Motion)**:
  - Entrada: `initial={{ opacity: 0, scale: 0.95, y: 16 }}` -> `animate={{ opacity: 1, scale: 1, y: 0 }}`.
  - Salida: `exit={{ opacity: 0, scale: 0.95, y: 16 }}`.
  - Transición: `transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}` (Curva Apple/Linear).
- **Feedback de Click (Active)**: `active:scale-[0.98]` para sensación física táctil.
- **Status Pulsing**: `animate-pulse` con período de 2s suave (`duration-2000`).

### 3.10. Bento Grid & Alineación
- **Dashboard / Vista Dividida**: Rejilla asimétrica de 12 columnas (`lg:grid-cols-12`).
  - Catálogo / Flujo principal: `lg:col-span-8`.
  - Caja registradora / Panel de control sticky: `lg:col-span-4`.
- **Tarjetas de Catálogo**: `grid-cols-2 sm:grid-cols-3` con altura equilibrada vía `flex flex-col justify-between`.
- **KPI Banners**: `grid-cols-2 lg:grid-cols-4 gap-3`.

---

## 4. CHECKLIST DE EVALUACIÓN DE CONSISTENCIA (0 a 100 PUNTOS)

Todo componente o herramienta terminada debe evaluarse obligatoriamente bajo esta rúbrica:

| Criterio | Puntos | Verificación |
| :--- | :---: | :--- |
| **1. Luminancia y Fondos** | 10 | Uso de capas $L_0$, $L_1$, $L_2$ con fondos oscuros calibrados (`#070E17`, `#0F1C2A`) y halos ambientales. 0 negros planos sin atmósfera. |
| **2. Micro-Bordes Especulares**| 10 | Bordes sutiles `border-white/8` a `border-white/10`. Hover refinado. Cero bordes gruesos u opacos. |
| **3. Jerarquía de Radios** | 10 | Cumplimiento estricto de la regla concéntrica ($R_{int} = R_{ext} - pad$). 28px externo, 16-20px tarjeta, 12px control, pill completa en badges. |
| **4. Alturas y Touch Targets** | 10 | Controles alineados a la escala (48-52px primario, 40-44px estándar, 32-36px compacto). Cero alturas arbitrarias. |
| **5. Espaciado y Gaps** | 10 | Ritmo de 4/8px respetado en padding y gaps (`p-4`, `p-5`, `gap-3`). |
| **6. Tipografía Dual-Tracking** | 10 | Headings en `tracking-tight`, micro-labels en `tracking-widest uppercase`, cifras en `font-mono`. |
| **7. Iconografía Proporcional** | 10 | Lucide Icons escalados (`w-3.5` a `w-5`) en contenedores estilizados. Stroke uniforme. Cero emojis. |
| **8. Animación y Respuesta** | 10 | Transiciones de 200-300ms, curva `[0.16, 1, 0.3, 1]`, microinteracciones en hover y click. |
| **9. Ergonomía de Operación** | 10 | Acciones rápidas en 1 clic (stepper in-card, cobro rápido exacto, atajos, toggle directo). |
| **10. Integración de Sistema** | 10 | Coherencia total con la suite (Finanzas, Contabilidad, CRM, Inventario). Mismo estilo que parece programado por una sola persona. |

**TOTAL: 100 PUNTOS**
- **Aprobado**: $\ge 95$ puntos.
- **Rechazado (Iteración Obligatoria)**: $< 95$ puntos.
