# BI 0 A 100 — Design System

## Heurísticas Generales
El sistema visual de **BI 0 A 100** es una fusión entre **Minimalismo Editorial** e **Interfaces Brutalistas/Mecánicas**. Está diseñado para proyectar autoridad, precisión técnica ("agencia high-end") y extrema modernidad. 

- **Cero Genérico**: Evitar bordes redondeados excesivos típicos del SaaS genérico. Se usa un radio de borde controlado (xl y 2xl) compensado por geometría estricta interior.
- **Tipografía como Estructura**: Letras masivas (`tracking-tighter`), jerarquía profunda y lectura sin esfuerzo.
- **Micro-interacciones Dinámicas**: Físicas de peso y animaciones magnéticas suaves orquestadas por GSAP. Una vez que se interactúa, las respuestas visuales deben ser contundentes.

---

## 1. Topografía y Espacio

- **Canvas Principal**: `#070E17` (Oscuro profundo puro, absorbe luz).
- **Superficies (Cards)**: `#0F1C2A` y `#080E1A`. Se emplean bordes ultrafinos (`border-white/10` o `border-white/5`) para el delineado celular ("Bento Grids").
- **Grid**: En escritorio, layouts de 2, 3 o 4 columnas simétricas. Las interfaces se diagraman como "celdas" de información.
- **Destellos (Glows)**: Blur extremo (`blur-[100px]`) sobre colores primarios bajo las tarjetas para simular luz volumétrica contenida. 

## 2. Tipografía (Inter)
La fuente `Inter` rige todo el diseño, emulando la limpieza de interfaces de terminal pero escalada a un formato corporativo masivo.

- **Display Headers**: Extremadamente apretados (`tracking-tighter`, `leading-none`), peso `extrabold` (800) a `black` (900). 
- **Body / Captions**: Espaciados y transpirables, amplios niveles de transparencia (`text-white/40`, `font-light`, `leading-relaxed`). 
- **Labels (Brutalist Touch)**: Letras diminutas (`text-[10px]` o `text-[11px]`), `uppercase`, alineación justificada o espaciado extremo (`tracking-widest`), con alta transparencia (50%). Emula descripciones técnicas, medidores e indicadores.

## 3. Comportamiento y Motion (GSAP Rules)
Con el framework GSAP implementado:
1. **Curvas de easing personalizadas**: `power4.out` y `expo.out`. Nunca lineales o genéricas. El movimiento arranca veloz y frena con una fricción "de lujo".
2. **Stagger (Retardos escalonados)**: Todas las listas, mallas bento o módulos entran mediante staggers ligeros de `0.08s` o `0.1s`.
3. **Escala y Traslación Subliminal**: Los *hovers* actúan de forma suave (`scale: 1.02` máximo), sin romper el plano de lectura. Evitar movimientos de refracción muy violentos; preferir incrementos limpios en opacidad del borde (`border-white/20`) y brillo de sombras (`shadow-card-md`).

## 4. Paleta de Acentos

Las identidades de módulo se heredan pero sin opacar el lienzo oscuro principal.

- **Market**: Azul Eléctrico (`#3B82F6`)
- **Marketing**: Violeta Energético (`#8B5CF6`) 
- **Proveedores**: Cyan Gélido (`#06B6D4`)
- **Finanzas**: Verde Esmeralda (`#10B981`)
- **Brand Action**: Rojo Fuego (`#E74C3C` -> Degradado a `#ef6b59` o acentos dorados `#D4AF37`)

Los acentos operan esencialmente como luz de neón contenida detrás del cristal esmerilado de las tarjetas UI.
