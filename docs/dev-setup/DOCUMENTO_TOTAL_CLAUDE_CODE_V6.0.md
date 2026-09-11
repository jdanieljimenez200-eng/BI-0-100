# 🤖 DOCUMENTO TOTAL PARA CLAUDE CODE
**TODO Lo Que Necesitas Saber - BI 0 A 100**

**Versión 6.0 | Definitiva | Marzo 2025**

---

## 📌 INSTRUCCIÓN INICIAL

**Lee este documento COMPLETO una sola vez.**

Después, tendrás TODO el contexto para:
- Generar estructura base
- Implementar módulos
- Crear APIs
- Escribir validaciones
- Hacer tests
- **SIN HACER MÁS PREGUNTAS**

Si algo NO está claro aquí, es culpa del documento. Reporta.

---

## 🚀 PARTE 1: PROYECTO EN 60 SEGUNDOS

**¿QUÉ ES BI 0 A 100?**

SaaS web que valida si un negocio es viable en 2-3 minutos.

**FLUJO:**
```
1. Usuario sube producto (foto + nombre + categoría)
2. Ingresa presupuesto disponible
3. Elige: LOCAL (su estado) o NACIONAL (México completo)
4. Sistema analiza SIMULTÁNEAMENTE 4 módulos
5. En 2-3 minutos devuelve resultados listos para actuar
6. Usuario descarga todo y decide: ¿Adelante o cambio de idea?
```

**¿CUÁLES SON LOS 4 MÓDULOS?**

```
1. MARKETING: Genera 3 opciones posicionamiento + bocetos + copy + calendario
2. MERCADO: Calcula viabilidad score (0-100) + competencia + TAM
3. PROVEEDORES: Encuentra proveedores, ordena por costo total REAL
4. FINANZAS: Proyecta ganancias ajustadas al presupuesto real usuario
```

**¿CUÁL ES EL TIMELINE?**

10 sprints de 2 semanas cada uno = 4.5 meses MVP.
Desarrollo LOCAL primero, después deploy a PRODUCCIÓN.

**¿QUIÉN LO USA?**

Emprendedores solos, PYMEs 1-10 personas, importadores/distribuidores.
TAM: ~4M en México, ~20M en LATAM.

---

## 💼 PARTE 2: MONETIZACIÓN EXACTA

**4 PLANES:**

```
FREEMIUM ($0/mes):
├─ 1 análisis/mes
├─ Acceso proveedores básico
├─ Watermark en PDFs
└─ Meta: Adquisición, conversión a Pro

PRO ($19.99-29.99/mes):
├─ Análisis ILIMITADOS
├─ 5 personalizaciones marketing/mes (editor de prompts)
├─ Historial completo análisis
├─ Contacto directo proveedores
├─ Sin watermark PDFs
└─ Meta: Early adopters, PMF

BUSINESS ($79.99-99.99/mes):
├─ TODO PRO +
├─ 50 personalizaciones marketing/mes
├─ Análisis múltiples productos simultáneos
├─ Monitoreo competencia automático
├─ Soporte prioritario
└─ Meta: PYMEs, equipos, agencias

ENTERPRISE (Custom >$500/mes):
├─ TODO ilimitado
├─ Fine-tuning IA para marca
├─ API privada
├─ Integración ERP
├─ Soporte 24/7
└─ Meta: Corporativas
```

**INGRESOS SECUNDARIOS:**

```
Comisión transacciones: 5% si venta >= $500
├─ Ejemplo: 100 transacciones × $1000 promedio × 5% = $5K/mes

Featured Listing: $9.99/mes por proveedor destacado
├─ Ejemplo: 100 proveedores × $9.99 = $1K/mes

Futuro (V2):
├─ Datos anonimizados
├─ Affiliate links
├─ Financiamiento B2B
```

**PROYECCIÓN AÑO 1:**

```
Conservador:
├─ Mes 1-3: $0 (MVP apenas lanzado)
├─ Mes 3-6: $5K-10K MRR (early users trickle)
├─ Mes 6-9: $20K-30K MRR (word of mouth)
├─ Mes 9-12: $40K-60K MRR (escala)
└─ ARR: ~$240K

Optimista (5K usuarios activos: 60% free, 35% Pro, 5% Business):
├─ MRR: $72K-77K
├─ Ingresos secundarios: +$6K-10K
└─ ARR: $864K+
```

---

## 🎨 PARTE 3: MÓDULO MARKETING - ESPECIFICACIÓN EXACTA

### ENTRADA

```javascript
{
  producto_id: "uuid-123",
  usuario_id: "uuid-user",
  
  // Datos del producto
  nombre: "Camisetas de Algodón",
  descripcion: "Camisetas 100% algodón, alta calidad",
  tipo: "producto", // o "servicio"
  categoria: "Ropa",
  precio_esperado: 30,
  
  // Imagen para análisis
  imagen_url: "https://s3.../camiseta.jpg",
  
  // Marca (opcional)
  marca_id: "uuid-marca" // Si existe, incluir
}
```

### PROCESAMIENTO - 6 FASES

#### FASE 1: Extracción de Características

```
Input: imagen_url + descripción
    ↓
IA (Claude Vision) analiza:
├─ Colores dominantes (máx 5)
├─ Estilo visual (moderno, clásico, casual, etc)
├─ Materiales percibidos
├─ Público objetivo implícito
├─ Casos de uso
├─ Diferenciadores evidentes
    ↓
Output:
{
  colores_dominantes: ["#2C3E50", "#E74C3C", "#ECF0F1"],
  estilo: "casual-moderno",
  materiales: ["algodón 100%"],
  publico_objetivo: ["18-35", "casual", "consciente"],
  casos_uso: ["día a día", "actividades"],
  diferenciadores: ["sostenible", "calidad", "precio accesible"]
}
```

#### FASE 2: Generar 3 Opciones Posicionamiento

**OPCIÓN A: PREMIUM**

```javascript
{
  id: "opcion-a",
  nombre: "PREMIUM",
  posicionamiento: "Lujo accesible - Cada prenda una joya",
  
  rango_precio: { minimo: 45, maximo: 60 },
  margen_estimado: 50, // %
  
  publico_objetivo: "25-45 años, poder compra alto, lifestyle",
  tono: "elegante, aspiracional",
  
  diferenciador: "Atención al detalle, exclusividad",
  propuesta: "Viste tu mejor versión todos los días",
  
  paleta_colores: ["#2C3E50", "#D4AF37", "#ECF0F1"],
  tipografia: "Raleway",
  
  ventajas: [
    "Mayor margen (50%+)",
    "Menos competencia",
    "Cliente más leal"
  ],
  
  desventajas: [
    "Audiencia pequeña",
    "Requiere más marketing",
    "Ciclo de venta largo"
  ]
}
```

**OPCIÓN B: VOLUMEN**

```javascript
{
  id: "opcion-b",
  nombre: "VOLUMEN",
  posicionamiento: "Accesible pero de calidad - Para todos",
  
  rango_precio: { minimo: 20, maximo: 30 },
  margen_estimado: 30, // %
  
  publico_objetivo: "16-40 años, precio-conscientes",
  tono: "directo, amigable, urgencia moderada",
  
  diferenciador: "Mejor relación precio-calidad",
  propuesta: "Comodidad y estilo para todos",
  
  paleta_colores: ["#E74C3C", "#F39C12", "#FFFFFF"],
  tipografia: "Montserrat",
  
  ventajas: [
    "Mayor volumen clientes",
    "Rápido retorno",
    "Escalabilidad fácil"
  ],
  
  desventajas: [
    "Margen más bajo",
    "Más competencia",
    "Requiere operaciones eficientes"
  ]
}
```

**OPCIÓN C: ESPECIALIZADO**

```javascript
{
  id: "opcion-c",
  nombre: "ESPECIALIZADO",
  posicionamiento: "Sostenible y consciente - Moda que importa",
  
  rango_precio: { minimo: 25, maximo: 50 },
  margen_estimado: 40, // %
  
  publico_objetivo: "20-45 años, valores sostenibles",
  tono: "educativo, apasionado, responsable",
  
  diferenciador: "Ecológico, ético, duradero",
  propuesta: "Moda consciente que importa",
  
  paleta_colores: ["#27AE60", "#8B6F47", "#FFFFFF"],
  tipografia: "Poppins",
  
  ventajas: [
    "Margen excelente",
    "Cliente apasionado y leal",
    "Menos competencia directa"
  ],
  
  desventajas: [
    "Audiencia más pequeña",
    "Requiere coherencia marca",
    "Crecimiento más lento"
  ]
}
```

#### FASE 3: Generar Bocetos (Nano Banana Pro)

**PARA CADA OPCIÓN, GENERAR:**

**FACEBOOK (5 bocetos):**
```
Variante 1: Carrusel (5-10 imágenes)
├─ Imagen 1: Producto en contexto
├─ Imagen 2: Beneficio principal
├─ Imagen 3: Beneficio secundario
├─ Imagen 4: Social proof / Testimonial
└─ Imagen 5: CTA clara

Variante 2: Story (vertical, 1080x1920)
└─ Imagen simple + CTA

Variante 3: Feed single image (1200x628)
└─ Producto + logo marca + texto

Variante 4: Video preview (15-30 seg)
└─ Mostrando producto en uso

Variante 5: Collection grid (9 imágenes 3x3)
└─ Variedad de colores/estilos
```

**INSTAGRAM (5 bocetos):**
```
Variante 1: Feed post (1080x1080 cuadrado)
└─ Imagen horizontal del producto

Variante 2: Reel preview (1080x1920)
└─ Thumbnail atractiva para video

Variante 3: Story (1080x1920)
└─ Vertical, simple, con CTA

Variante 4: Reels corto (15-30 seg)
└─ Video dinámico, educativo o entretenido

Variante 5: Carousel (1080x1080 cada slide)
└─ 3-5 imágenes deslizables
```

**PROMPT A NANO BANANA PRO (Ejemplo):**

```
"Camiseta de algodón premium, colores azul oscuro y blanco, 
estilo minimalista, fotografía profesional, fondo blanco limpio, 
iluminación estudio, producto en primer plano, 
paleta colores: azul #2C3E50, blanco #ECF0F1, 
tipografía Raleway Bold, 
logo marca en esquina superior derecha, 
estilo: elegante, exclusivo, aspiracional, 
sin texto en la imagen (añadir después)"
```

**MANEJO DE ERRORES:**

```
Si Nano Banana Pro falla:
1. Reintentar con mismo prompt (máx 2 veces)
2. Si sigue fallando: usar Nana DOS como fallback
3. Si ambos fallan: guardar análisis con estado "image_generation_error"
   y permitir usuario ver opciones sin imágenes (solo texto)
```

#### FASE 4: Generar Copywriting (Claude API)

```
Para CADA boceto, generar:

{
  red_social: "facebook",
  variante: 1,
  
  titulo: "Descubre la comodidad que mereces ✨",
  descripcion: "Camisetas de algodón 100% puro. Cómodas, duraderas, 
               accesibles. La mejor relación precio-calidad.",
  
  beneficios: [
    "✓ Hecha de algodón premium",
    "✓ Dura años sin desgastarse",
    "✓ Perfecta para cualquier ocasión"
  ],
  
  cta: "Compra ahora con envío gratis",
  
  hashtags: ["#Camisetas", "#Algodón", "#Moda", "#Comodidad"],
  
  emojis: ["✨", "👕", "❤️", "🛒"],
  
  tono_voz: "directo, amigable, urgencia moderada, inclusivo"
}
```

#### FASE 5: Paleta de Colores Automática

```
Input: imagen_url O logo_url
    ↓
Claude Vision extrae:
├─ Colores dominantes
├─ Calcula valores HEX, RGB, HSL
├─ Genera nombres descriptivos
└─ Crea paleta armónica
    ↓
Output:
{
  paleta: [
    {
      nombre: "Azul Primario",
      hex: "#2C3E50",
      rgb: "44, 62, 80",
      hsl: "204, 29%, 24%",
      pantone: "19-3950",
      uso: "Elementos principales, titulares",
      contraste_wcag: "AAA (7.5:1)"
    },
    {
      nombre: "Rojo Secundario",
      hex: "#E74C3C",
      rgb: "231, 76, 60",
      hsl: "6, 78%, 57%",
      pantone: "16-1546",
      uso: "CTAs, urgencia",
      contraste_wcag: "AA (4.5:1)"
    },
    // ... más colores
  ],
  
  tipografia_recomendada: {
    titulares: "Montserrat Bold (Google Fonts)",
    cuerpo: "Open Sans Regular (Google Fonts)",
    tamaños: { h1: 32, h2: 24, body: 16 }
  }
}
```

#### FASE 6: Calendario de Publicación

```
Input: Opción elegida, duración (30/60/90 días)
    ↓
Generar calendario optimizado:

{
  duracion: 30,
  tipo_contenido_rotado: [
    "Promoción",
    "Educación",
    "Social proof",
    "Behind-the-scenes",
    "Urgencia"
  ],
  
  horarios_optimos: {
    facebook: ["10:00", "14:00", "20:00"],
    instagram: ["08:00", "13:00", "19:00"]
  },
  
  dias: [
    {
      fecha: "2025-03-27",
      dia_semana: "jueves",
      publicaciones: [
        {
          red_social: "facebook",
          hora: "10:00",
          variante: 1,
          tipo: "Carrusel",
          titulo: "Descubre...",
          link_boceto: "..." 
        },
        {
          red_social: "instagram",
          hora: "14:00",
          variante: 2,
          tipo: "Story",
          titulo: "¿Ya lo viste?",
          link_boceto: "..."
        }
      ]
    },
    // ... 29 días más
  ]
}
```

### SALIDA FINAL - MARKETING

```javascript
{
  analisis_id: "uuid-marketing",
  estado: "completado",
  
  // Opciones
  opciones: [ // Array 3 opciones (A, B, C)
    { opcion-a },
    { opcion-b },
    { opcion-c }
  ],
  opcion_elegida: "B",
  
  // Bocetos
  bocetos_facebook: [ // Array 5 URLs
    { url: "s3://...", variante: 1, titulo: "..." },
    // ...
  ],
  bocetos_instagram: [ // Array 5 URLs
    { url: "s3://...", variante: 1, titulo: "..." },
    // ...
  ],
  
  // Copywriting
  copywriting: { /* JSON con todo copy */ },
  
  // Branding
  paleta_colores_usada: { /* Paleta final */ },
  logo_integrado: true,
  tipografia_usada: "Montserrat",
  
  // Calendario
  calendario_30_dias: [ /* 30 días */ ],
  calendario_60_dias: [ /* 60 días */ ],
  calendario_90_dias: [ /* 90 días */ ],
  
  // Ads
  presupuesto_ads_recomendado: 250, // USD/mes
  desglose_ads: {
    facebook: { cantidad: 150, razon: "..." },
    instagram: { cantidad: 100, razon: "..." }
  },
  
  // Archivo
  guia_branding_url: "s3://...",
  
  // Metadata
  fecha_creacion: "2025-03-26T14:30:00Z",
  fecha_completado: "2025-03-26T14:33:00Z"
}
```

### FEATURE EXTRA: Editor de Prompts Personalizado

```
Si usuario NO le gusta los bocetos automáticos:

Usuario click: "Personalizar Bocetos"
    ↓
Abre EDITOR DE PROMPTS:
├─ Campo 1: Prompt original (read-only, para referencia)
├─ Campo 2: Textarea editable (usuario cambia aquí)
├─ Sugerencias: Palabras clave por categoría (clickables)
├─ Vista previa: Muestra cómo se vería con nuevo prompt
├─ Contador: Caracteres (máx 500)
└─ Botón: "Regenerar con este prompt" (usa 1 crédito)
    ↓
Descuenta 1 crédito:
├─ Free: 0 créditos (bloqueado, mostrar "Upgrade a Pro")
├─ Pro: 5/mes (contador visible)
├─ Business: 50/mes
└─ Enterprise: Ilimitado
    ↓
Regenera bocetos con nuevo prompt
    ↓
Usuarios ve nuevos bocetos
```

### LÍMITES DE CRÉDITOS

```
Free: 0 regeneraciones (sin personalizar)
Pro: 5 regeneraciones/mes
Business: 50 regeneraciones/mes
Enterprise: Ilimitadas

Los créditos se renuevan el 1 de cada mes automáticamente.

Si usuario intenta regenerar sin créditos:
{
  error: "Sin créditos disponibles",
  usados: 5,
  limite: 5,
  se_renuevan: "2025-04-01T00:00:00Z",
  sugerencia: "Upgrade a Business para 50/mes"
}
```

---

## 📊 PARTE 4: MÓDULO MERCADO - ESPECIFICACIÓN EXACTA

### ENTRADA

```javascript
{
  producto_id: "uuid-123",
  usuario_id: "uuid-user",
  
  scope: "local", // o "nacional"
  
  // Si LOCAL:
  usuario_ciudad: "Oaxaca",
  usuario_estado: "Oaxaca",
  usuario_latitud: 17.0633,
  usuario_longitud: -96.7265,
  radio_accion_km: 50
}
```

### FLUJO: USUARIO ELIGE SCOPE

```
Pantalla: "¿Dónde quieres vender?"

OPCIÓN 1: LOCAL
├─ Describir: "Vendo SOLO en mi estado"
├─ TAM estimado: $245K/año (ejemplo Oaxaca)
├─ Ventaja: Análisis personalizado para tu zona
└─ Click: [ANALIZAR LOCAL]

OPCIÓN 2: NACIONAL
├─ Describir: "Vendo en TODO México"
├─ TAM estimado: $3.5M-4.8M/año
├─ Ventaja: Mercado 15x más grande
└─ Click: [ANALIZAR NACIONAL]
```

### PROCESAMIENTO - 5 FASES

#### FASE 1: Google Trends

```
Input: palabra_clave, ubicación, periodo (12 meses)
    ↓
Obtener:
├─ Volumen búsquedas mensual (números)
├─ Línea de tendencia (12 puntos)
├─ Proyección próximos 6 meses
├─ Picos estacionales (ej: Navidad +40%)
└─ Comparación vs año anterior (%)
    ↓
Output:
{
  palabra_clave: "camisetas algodón",
  ubicacion: "Oaxaca", // o "México"
  volumen_busquedas_mensual: 1850,
  
  datos_12_meses: [
    { mes: "Marzo 2024", volumen: 120 },
    { mes: "Abril 2024", volumen: 135 },
    // ... 12 meses
  ],
  
  proyeccion_6_meses: [145, 148, 152, 155, 158, 160],
  
  crecimiento_porcentaje: 18, // %
  crecimiento_descripcion: "+18% vs hace 1 año",
  
  picos_estacionales: {
    "Diciembre": "+40%",
    "Enero": "-20%"
  },
  
  tendencia: "CRECIENTE" // CRECIENTE, ESTABLE, DECRECIENTE
}
```

#### FASE 2: Web Scraping (Competencia)

```
Input: palabra_clave, ubicación (si local)
    ↓
Buscar en:
├─ Google Shopping (primeros 10)
├─ MercadoLibre (primeros 10)
├─ Facebook Marketplace (top resultados)
├─ Google Maps (si local, en radio)
└─ Directorios locales (si local)
    ↓
Para CADA competidor, extraer:
├─ Nombre / URL / Ubicación
├─ Precio actual
├─ Rating (0-5)
├─ Número de reseñas
├─ Descripción / Diferenciadores
├─ Tiempo en mercado (estimado)
└─ Distancia (si local)
    ↓
Output:
{
  total_competidores: 4,
  
  competidores: [
    {
      ranking: 1,
      nombre: "FábricasOaxaca",
      url: "https://...",
      ubicacion: "Oaxaca, 2.5 km",
      distancia_km: 2.5,
      
      precio_minimo: 8,
      precio_maximo: 12,
      precio_promedio: 9.5,
      
      rating: 4.8,
      numero_resenas: 2340,
      
      fortalezas: ["Marca conocida", "Envíos rápidos"],
      debilidades: ["Precio alto", "No opciones eco"],
      
      tiempo_en_mercado: "5+ años",
      
      fuente: "google_maps"
    },
    // ... más competidores
  ]
}
```

#### FASE 3: Cálculo Viabilidad Score

```
FÓRMULA EXACTA:

viabilidad_score = (tendencia×0.25) + (competencia×0.20) + 
                   (margen×0.15) + (demanda×0.20) + (oportunidad×0.20)

DONDE CADA FACTOR ES 0-100:

TENDENCIA (25% del score):
├─ Crecimiento >= 20%: 90
├─ Crecimiento 10-20%: 75
├─ Crecimiento 5-10%: 60
├─ Crecimiento 0-5%: 40
├─ Decrecimiento: 20
└─ Decrecimiento severo (>20%): 10

COMPETENCIA (20% del score):
├─ 0-1 competidores: 100 (monopolio)
├─ 2-3 competidores: 85 (poco saturado)
├─ 4-6 competidores: 70 (moderado)
├─ 7-10 competidores: 55 (saturado)
├─ 10-15 competidores: 40
└─ 15+ competidores: 20 (muy saturado)

MARGEN (15% del score):
├─ >= 40%: 90
├─ 30-40%: 75
├─ 20-30%: 60
├─ 10-20%: 40
├─ < 10%: 20
└─ < 5%: 0 (no viable)

DEMANDA (20% del score):
├─ >= 5000 búsquedas/mes: 90
├─ 2000-5000: 75
├─ 500-2000: 60
├─ 100-500: 40
└─ < 100: 20

OPORTUNIDAD (20% del score):
├─ Gap detectado (demanda sin oferta): 100
├─ Diferenciación clara posible: 80
├─ Nicho subatendido: 70
├─ Mercado segmentado: 60
├─ Mercado genérico: 30
└─ Sin oportunidad clara: 10

EJEMPLO CÁLCULO - CAMISETAS OAXACA LOCAL:
├─ Tendencia (+18%): 75 × 0.25 = 18.75
├─ Competencia (4): 70 × 0.20 = 14.0
├─ Margen (40-55%): 90 × 0.15 = 13.5
├─ Demanda (1850/mes): 60 × 0.20 = 12.0
├─ Oportunidad (diferenciación): 80 × 0.20 = 16.0

TOTAL: 18.75 + 14.0 + 13.5 + 12.0 + 16.0 = 74.25 ≈ 74/100 ✓ VIABLE

ESCALA FINAL:
├─ 80+: MUY VIABLE ✓✓✓ (recomendado, adelante)
├─ 60-80: VIABLE ✓✓ (viable, pero requiere diferenciación)
├─ 40-60: MODERADO ✓ (posible, con cuidado)
├─ 20-40: POCO VIABLE ✗ (riesgoso, considerar pivotar)
└─ 0-20: NO RECOMENDADO ✗✗ (alto riesgo, cambiar idea)
```

#### FASE 4: DAFO (Claude API)

```
Input: características producto, competencia, mercado
    ↓
Claude genera DAFO estratégico:
    ↓
Output:
{
  debilidades: [
    {
      titulo: "Marca nueva",
      descripcion: "Sin reputación establecida en mercado",
      impacto: "alto",
      mitigacion: "Enfocarse en calidad y satisfacción cliente"
    },
    // ... más
  ],
  
  amenazas: [
    {
      titulo: "CompA tiene 80% market share",
      descripcion: "Muy dominante, difícil competir en precio",
      probabilidad: "alta",
      mitigacion: "Diferenciación clara (sostenibilidad, nicho)"
    },
    // ... más
  ],
  
  fortalezas: [
    {
      titulo: "Mejor relación precio-calidad",
      descripcion: "Comparado con CompA",
      impacto: "alto",
      apalancamiento: "Marketing enfocado en valor"
    },
    // ... más
  ],
  
  oportunidades: [
    {
      titulo: "TikTok como canal de marketing",
      descripcion: "Público joven, visual, bajo costo",
      potencial: "muy alto",
      accion: "Crear contenido visual corto"
    },
    // ... más
  ],
  
  estrategias: {
    maximizar: "Usa fortalezas para aprovechar oportunidades",
    desarrollar: "Aprovecha oportunidades a pesar de debilidades",
    mantener: "Usa fortalezas para contrarrestar amenazas",
    minimizar: "Protégete de amenazas considerando debilidades"
  }
}
```

#### FASE 5: TAM Estimation

```
FÓRMULA LOCAL (Ejemplo: Oaxaca):

Paso 1: Población que compra categoría
├─ Población total Oaxaca: 450,000
├─ % que compra tu categoría: 15-20%
└─ = 67,500 - 90,000 personas

Paso 2: Frecuencia de compra anual
├─ Promedio: 2 veces/año
└─ = 135,000 - 180,000 transacciones/año

Paso 3: Valor transacción promedio
├─ Precio promedio: $30
└─ = $4,050,000 - $5,400,000/año (TAM GENERAL)

Paso 4: Penetración realista (5-10%)
├─ TAM ALCANZABLE: $202,500 - $540,000/año
└─ TAM PROMEDIO: $245,000/año

Paso 5: Si usuario captura 5% del TAM:
├─ Mercado/año: $202,500
├─ Mercado/mes: $16,875
├─ Unidades/mes: 562 (a $30 cada una)
└─ A 40% margen: $6,750/mes ganancia

FÓRMULA NACIONAL (México):

Paso 1: Población que compra
├─ Población urbana México: 130,000,000
├─ % que compra categoría: 20-25%
└─ = 26,000,000 - 32,500,000 personas

Paso 2: Frecuencia
├─ 2x/año
└─ = 52,000,000 - 65,000,000 transacciones

Paso 3: Valor transacción
├─ $30 promedio
└─ = $1.56B - $1.95B/año (TAM GENERAL)

Paso 4: Penetración realista (0.2-0.3%)
├─ TAM ALCANZABLE: $3.1M - $5.8M/año
└─ TAM PROMEDIO: $4,000,000/año

Paso 5: Si usuario captura 0.5% TAM:
├─ Mercado/año: $1,750,000
├─ Mercado/mes: $145,833
├─ Unidades/mes: 4,861
└─ A 40% margen: $58,333/mes ganancia

OUTPUT:
{
  scope: "local", // o "nacional"
  
  tam_estimado_minimo: 202500,
  tam_estimado_maximo: 540000,
  tam_estimado_promedio: 245000,
  
  tam_escenarios: {
    pesimista: {
      penetracion: 2,
      mercado_anual: 81000,
      mercado_mensual: 6750,
      unidades_mes: 225
    },
    realista: {
      penetracion: 5,
      mercado_anual: 202500,
      mercado_mensual: 16875,
      unidades_mes: 562
    },
    optimista: {
      penetracion: 10,
      mercado_anual: 405000,
      mercado_mensual: 33750,
      unidades_mes: 1125
    }
  }
}
```

### SALIDA FINAL - MERCADO

```javascript
{
  analisis_id: "uuid-mercado",
  estado: "completado",
  
  scope: "local",
  ubicacion: "Oaxaca, Oaxaca",
  
  // Viabilidad
  viabilidad_score: 74,
  viabilidad_estado: "VIABLE",
  
  factores_positivos: [
    "Mercado en crecimiento (+18%)",
    "Margen potencial 40-55%",
    "Demanda latente detectada"
  ],
  
  factores_negativos: [
    "Competencia media (3-4 directos)",
    "Requiere marketing inicial"
  ],
  
  // Tendencias
  volumen_busquedas_mensual: 1850,
  tendencia_porcentaje: 18,
  tendencia_direccion: "up",
  datos_tendencias: { /* 12 meses + proyección */ },
  
  // Competencia
  total_competidores: 4,
  competidores_data: [ /* Array competidores */ ],
  gap_detectado: "Nadie ofrece sostenibilidad + precio accesible",
  
  // DAFO
  dafo_debilidades: [ /* Array */ ],
  dafo_amenazas: [ /* Array */ ],
  dafo_fortalezas: [ /* Array */ ],
  dafo_oportunidades: [ /* Array */ ],
  dafo_estrategias: { /* Estrategia integrada */ },
  
  // TAM
  tam_estimado_minimo: 202500,
  tam_estimado_maximo: 540000,
  tam_estimado_promedio: 245000,
  tam_escenarios: { /* Pesimista, realista, optimista */ },
  
  // Palabras clave
  palabras_clave: [
    {
      palabra: "camisetas algodón",
      volumen: 1850,
      competencia: "media",
      intension: "compra",
      recomendacion: "Usa en títulos y meta descriptions"
    },
    // ... más palabras
  ],
  
  // Alertas
  alertas: [
    {
      nivel: "verde",
      tipo: "oportunidad",
      mensaje: "Mercado en crecimiento, viabilidad buena"
    }
  ],
  
  // Archivo
  pdf_url: "s3://...",
  
  fecha_creacion: "2025-03-26T14:30:00Z",
  fecha_completado: "2025-03-26T14:36:00Z"
}
```

---

## 🤝 PARTE 5: MÓDULO PROVEEDORES - ESPECIFICACIÓN EXACTA

### CONCEPTO CLAVE

**NO buscamos proveedores.**  
**LOS PROVEEDORES SE REGISTRAN SOLOS.**

```
Landing page tiene botón: "¿Eres Proveedor?"
    ↓
Click → Registro proveedor
```

### MODELO DE PROVEEDOR

```javascript
{
  id: "uuid-proveedor",
  usuario_id: "uuid-user",
  
  // Empresa
  nombre_empresa: "FábricasOaxaca",
  descripcion: "Fábrica de textiles, 20 años experiencia",
  
  // Ubicación
  ciudad: "Oaxaca",
  estado: "Oaxaca",
  latitud: 17.0633,
  longitud: -96.7265,
  
  // Productos/servicios
  categorias: ["Textiles", "Ropa", "Accesorios"],
  
  // Precios
  precio_min: 8,
  precio_max: 12,
  
  // Logística
  moq: 500, // Cantidad mínima
  plazo_entrega_dias: 7, // Días desde pago
  
  // Certificaciones
  certificaciones: ["ISO 9001", "Comercio Justo"],
  
  // Contacto
  email: "info@fabricasoaxaca.com",
  telefono: "+52-951-123-4567",
  whatsapp: "+52-951-123-4567",
  
  // Reputación
  rating: 4.8,
  total_resenas: 156,
  verified: true, // Después 10+ reseñas positivas
  
  // Financiero
  comisiones_acumuladas: 1250.50,
  
  // Featured
  featured_activo: true,
  fecha_featured_hasta: "2025-04-26",
  
  status: "activo",
  fecha_creacion: "2025-02-15"
}
```

### BÚSQUEDA INTELIGENTE - ORDENAMIENTO POR COSTO TOTAL REAL

```
Usuario busca proveedores:
├─ Categoria: "Textiles"
├─ Cantidad: 500 unidades
├─ Presupuesto máx: $10/u
├─ Plazo deseado: 14 días
├─ Ubicación: "Local" (Oaxaca)
└─ Radio: 50 km

Sistema CALCULA COSTO TOTAL PARA CADA PROVEEDOR:

COSTO TOTAL = (precio_unitario × cantidad) + costo_envio

Ejemplo:
#1 FábricasOaxaca (LOCAL, 8km):
├─ Precio: $9.50/u
├─ Envío: $100 (cercano)
├─ COSTO TOTAL: (9.50 × 500) + 100 = $4,850
├─ Plazo: 7-10 días ← RÁPIDO
├─ Rating: 4.8/5
└─ RECOMENDACIÓN: "Opción recomendada por rapidez"

#2 TexMexico (Puebla, 450km):
├─ Precio: $9.00/u
├─ Envío: $250 (lejanía)
├─ COSTO TOTAL: (9.00 × 500) + 250 = $4,750 ← MÁS BARATO
├─ Plazo: 10-12 días
├─ Rating: 4.6/5
└─ RECOMENDACIÓN: "Mejor precio, pero tarda más"

#3 TextilesDelnorte (Monterrey, 1400km):
├─ Precio: $8.20/u
├─ Envío: $650 (muy lejos)
├─ COSTO TOTAL: (8.20 × 500) + 650 = $4,750
├─ Plazo: 14-18 días ← LENTO
├─ Rating: 4.5/5
└─ RECOMENDACIÓN: "Igual costo que TexMexico, pero más lento"

Usuario VE CLARO:
"Opción 1 es $100 más cara pero llega en 7-10 días.
 Opción 2 es más barata pero tarda 10-12 días.
 Opción 3 es caro Y lento, no recomendado."

USUARIO ELIGE BASADO EN SUS PRIORIDADES
(No en "precio unitario" que es incompleto)
```

### RFQ - REQUEST FOR QUOTE

```javascript
Usuario click en proveedor:
    ↓
Formulario RFQ aparece:
{
  cantidad_solicitada: 500,
  especificaciones: "Color: Azul, Material: 100% algodón, Talla: M",
  presupuesto_unitario_max: 10, // Su límite
  plazo_requerido_dias: 14, // Cuando lo necesita
  
  mensaje_adicional: "¿Hacen variaciones? ¿Precio por volumen?"
}
    ↓
Usuario click: "Enviar solicitud"
    ↓
Proveedor recibe en dashboard:
{
  usuario_nombre: "Jorge",
  usuario_email: "jorge@example.com",
  cantidad_solicitada: 500,
  especificaciones: "...",
  presupuesto_max: 10,
  plazo_requerido: 14,
  
  fecha_solicitud: "2025-03-26T15:30:00Z",
  estado: "solicitada"
}
    ↓
Proveedor responde (en 24-48h):
{
  precio_ofertado: 9.50,
  plazo_ofertado: 10,
  detalles_adicionales: "Disponemos de colores. Envío incluido.",
  estado: "respondida"
}
    ↓
Usuario recibe notificación:
{
  proveedor: "FábricasOaxaca",
  precio_ofertado: 9.50,
  plazo_ofertado: 10,
  costo_total: 4850,
  
  acciones: [
    { label: "Aceptar", action: "accept" },
    { label: "Negociar", action: "message" },
    { label: "Rechazar", action: "decline" }
  ]
}
```

### SISTEMA DE REPUTACIÓN

```
Después de transacción completada:

Usuario deja RESEÑA:
{
  rating_calidad: 5, // 1-5 estrellas
  rating_plazo: 4,   // 1-5 estrellas
  rating_comunicacion: 5, // 1-5 estrellas
  
  comentario: "Excelente proveedor. Muy responsable, 
              calidad premium, cumplió plazo.",
  
  recomendaria: true,
  
  fecha_transaccion: "2025-03-01"
}
    ↓
Proveedor VE:
{
  nueva_resena_recibida: true,
  rating_promedio_ahora: 4.8,
  total_resenas: 157,
  
  tendencia: "MEJORANDO", // MEJORANDO, ESTABLE, EMPEORANDO
  
  badge_verificado: true, // Si 10+ reseñas positivas (4.5+)
}
    ↓
Sistema PRIORIZA:
├─ Proveedores con más reseñas positivas
├─ Penaliza reseñas negativas (bajan en ranking)
├─ Featured Listing para los mejores ($9.99/mes)
└─ Badge "Verificado" visible en listados
```

### SALIDA FINAL - PROVEEDORES

```javascript
{
  resultados: [
    {
      id: "uuid-prov1",
      nombre: "FábricasOaxaca",
      ubicacion: "Oaxaca, 8km",
      distancia_km: 8,
      
      precio_min: 8,
      precio_max: 12,
      precio_promedio: 9.5,
      
      costo_total_estimado: 4850, // (precio × cantidad) + envío
      
      moq: 500,
      plazo_entrega: 7,
      
      rating: 4.8,
      resenas: 156,
      verified: true,
      
      featured: false,
      
      acciones: [
        { label: "Ver detalle", action: "view" },
        { label: "Solicitar cotización", action: "rfq" }
      ]
    },
    // ... más resultados
  ],
  
  total: 3,
  pagina: 1,
  por_pagina: 10,
  
  filtros_aplicados: {
    categoria: "Textiles",
    moq: { max: 500 },
    presupuesto: { max: 10 },
    ubicacion: "local"
  },
  
  fecha_busqueda: "2025-03-26T15:30:00Z"
}
```

---

## 💰 PARTE 6: MÓDULO FINANZAS - ESPECIFICACIÓN EXACTA

### ENTRADA

```javascript
{
  producto_id: "uuid-123",
  usuario_id: "uuid-user",
  
  // INPUT PRINCIPAL
  presupuesto_total: 60000, // "¿Cuánto presupuesto tienes?"
  
  // INPUTS OPERACIONALES (Personalizables)
  cogs_unitario: 9.50,
  precio_venta: 32,
  volumen_mensual_esperado: 500,
  
  // Gastos fijos mensuales
  gastos_fijos: {
    arriendo: 500,
    servicios: 200, // luz, agua, internet
    empleados: 1000,
    seguros: 500,
    otros: 300
  },
  
  // Gastos variables por unidad
  gastos_variables_unitarios: {
    empaque: 0.50,
    envio: 1.00,
    comision_vendedor: 0.50,
    control_calidad: 0.20
  }
}
```

### PROCESAMIENTO - DISTRIBUCIÓN AUTOMÁTICA

```
INPUT: $60,000 presupuesto total
    ↓
DISTRIBUCIÓN ESTÁNDAR (Editable):

$60,000
├─ 50% Inventario (COGS): $30,000
│  └─ Para comprar MOQ del proveedor
│
├─ 30% Gastos Operativos: $18,000
│  ├─ Arriendo: $500/mes × 3 = $1,500
│  ├─ Servicios: $200/mes × 3 = $600
│  ├─ Empleados: $1,000/mes × 3 = $3,000
│  ├─ Seguros: $500
│  └─ Otros: $800
│  └─ Total asignado: $6,400
│
├─ 20% Marketing: $12,000
│  ├─ Redes sociales: $4,000
│  ├─ Influenciadores: $4,000
│  └─ Diseño/Content: $1,600 (se ajusta a $12K)
│
└─ Margen de seguridad: $13,600
   └─ Para gastos inesperados, reinversión, etc
```

### PROCESAMIENTO - 3 ESCENARIOS

```
ESCENARIO PESIMISTA (Mes 1-2: Despegue lento):

Volumen: 50% estimado (250 unidades/mes)
Ingresos: 250 × $32 = $8,000
├─ COGS: 250 × $9.50 = $2,375
├─ Gastos variables: 250 × $1.70 = $425
├─ Subtotal costo producto: $2,800
│
├─ Gastos fijos mensuales: $2,133
│  └─ ($6,400 ÷ 3 meses = $2,133/mes)
│
├─ Impuestos (IVA 16%, ISR 30%, comisión pago 2.9%):
│  └─ ~$1,200/mes
│
└─ GANANCIA NETA: $8,000 - $2,800 - $2,133 - $1,200 = $1,867/mes

Break-even: Mes 5 (después $60K invertido)

ESCENARIO REALISTA (Mes 3-6: Crecimiento normal):

Volumen: 100% estimado (500 unidades/mes)
Ingresos: 500 × $32 = $16,000
├─ COGS: 500 × $9.50 = $4,750
├─ Gastos variables: 500 × $1.70 = $850
├─ Subtotal costo producto: $5,600
│
├─ Gastos fijos mensuales: $2,133
│
├─ Impuestos: ~$2,400/mes
│
└─ GANANCIA NETA: $16,000 - $5,600 - $2,133 - $2,400 = $5,867/mes

Break-even: Mes 2-3

ESCENARIO OPTIMISTA (Mes 7+: Escala):

Volumen: 150% estimado (750 unidades/mes)
Ingresos: 750 × $32 = $24,000
├─ COGS: 750 × $9.50 = $7,125
├─ Gastos variables: 750 × $1.70 = $1,275
├─ Subtotal costo producto: $8,400
│
├─ Gastos fijos mensuales: $2,233
│  └─ (aumentan un poco con volumen)
│
├─ Impuestos: ~$3,600/mes
│
└─ GANANCIA NETA: $24,000 - $8,400 - $2,233 - $3,600 = $9,767/mes

Break-even: Mes 1 (payoff inmediato)
```

### FÓRMULA BREAK-EVEN

```
BREAK-EVEN (meses) = Presupuesto inicial ÷ Ganancia neta mensual

Ejemplo escenario realista:
$60,000 ÷ $5,867/mes = 10.2 meses ≈ 10 meses

IMPORTANTE: Break-even varía por escenario
├─ Pesimista: ~11 meses
├─ Realista: ~10 meses
└─ Optimista: ~6 meses
```

### SIMULADOR INTERACTIVO

```
Usuario mueve sliders en tiempo REAL:

SLIDER 1: COGS
├─ Valor: $9.50/u → Usuario cambia a $8.00/u
└─ Sistema recalcula INMEDIATAMENTE:
   ├─ Margen bruto: 40% → 45%
   ├─ Ganancia/mes: $5,867 → $6,492
   ├─ Break-even: 10 meses → 9 meses
   └─ Usuario VE: "¡Negocia COGS! Te ahorras 1 mes de break-even"

SLIDER 2: PRECIO DE VENTA
├─ Valor: $32 → Usuario sube a $35
└─ Sistema recalcula:
   ├─ Margen: 40% → 48%
   ├─ PERO avisa: "Riesgo: Volumen podría bajar 10%"
   ├─ Ganancia estimada: $5,867 → $6,500 (sin caída)
   ├─ Break-even: 10 meses → 9.2 meses
   └─ Usuario VE: "¿Vale la pena el riesgo?"

SLIDER 3: PRESUPUESTO TOTAL
├─ Valor: $60K → Usuario cambia a $100K
└─ Sistema recalcula:
   ├─ Inventario inicial: $30K → $50K
   ├─ Volumen mes 1: 250 u → 500 u
   ├─ Ganancia mes 1: $1,867 → $5,867
   ├─ Break-even: 10 meses → 2 meses ← DRÁSTICO
   └─ Usuario VE: "¿Vale la pena el capital extra? SÍ"
```

### PROYECCIÓN 12 MESES

```
Mes│ Unidades│ Ingresos│ COGS │ Var.Op│ Fijos│ Imptos│ Ganancia│ Acumulado
───┼─────────┼────────┼──────┼───────┼─────┼──────┼────────┼──────────
 1 │  250    │ $8,000 │$2,375│ $425  │2,133│$1,200│ $1,867 │  $1,867
 2 │  300    │ $9,600 │$2,850│ $510  │2,133│$1,440│ $2,667 │  $4,534
 3 │  400    │$12,800 │$3,800│ $680  │2,133│$1,920│ $4,267 │  $8,801
 4 │  500    │$16,000 │$4,750│ $850  │2,133│$2,400│ $5,867 │ $14,668
 5 │  550    │$17,600 │$5,225│ $935  │2,233│$2,640│ $6,567 │ $21,235
 6 │  600    │$19,200 │$5,700│$1,020 │2,233│$2,880│ $7,367 │ $28,602
 7 │  650    │$20,800 │$6,175│$1,105 │2,233│$3,120│ $8,167 │ $36,769
 8 │  700    │$22,400 │$6,650│$1,190 │2,333│$3,360│ $8,867 │ $45,636
 9 │  750    │$24,000 │$7,125│$1,275 │2,333│$3,600│ $9,667 │ $55,303
10 │  800    │$25,600 │$7,600│$1,360 │2,333│$3,840│$10,467 │ $65,770 ← PAYBACK
11 │  850    │$27,200 │$8,075│$1,445 │2,400│$4,080│$11,200 │ $76,970
12 │  900    │$28,800 │$8,550│$1,530 │2,400│$4,320│$11,800 │ $88,770

AÑO 1 GANANCIA TOTAL: $88,770
ROI: ($88,770 - $60,000) / $60,000 = 48% ✓
```

### ALERTAS AUTOMÁTICAS

```
🔴 ALERTA ROJA (No viable):
├─ "Margen < 15%. Imposible ser rentable."
├─ "Break-even > 18 meses. Presupuesto insuficiente."
└─ Acción: "Repensa el modelo o aumenta presupuesto"

🟡 ALERTA AMARILLA (Cautela):
├─ "Margen 15-20%. Vulnerable a cambios."
├─ "Break-even 12-18 meses. Poco margen de error."
├─ "Gastos fijos muy altos vs ingresos."
└─ Acción: "Optimiza costos antes de lanzar"

🟢 ALERTA VERDE (Buena oportunidad):
├─ "Margen 40%+. Excelente."
├─ "Break-even < 6 meses. Seguro."
├─ "Proyección año 1 muy positiva."
└─ Acción: "¡Adelante con confianza!"
```

### RECOMENDACIONES IA

```
Claude API genera recomendaciones personalizadas:

"Para alcanzar $100K/mes de ingresos necesitas 3,125 u/mes
 (vs 500 actuales). Estrategia:
 
 1. Expande a 2-3 estados nuevos (mes 6+)
 2. Invierte en marketing nacional (mes 4)
 3. Negocia COGS baja con nuevo volumen (mes 3)
 
 Proyección con estos cambios: +$250K adicionales/año"

"Tu margen está en 40%, excelente. PERO:
 - Se agota reinventario mes 5
 - Necesitarás capital adicional ~$25K para reinvertir
 - Plan: Reinvierte ganancias o busca inversión mes 4"

"Gastos de arriendo: $1,500 × 12 = $18K/año
 Si cambias a home-based: Ahorras $12K/año
 Nueva ganancia año 1: $100K (vs $88K actual)
 
 ¿Vale la pena? SÍ, pero pierde profesionalismo"
```

### SALIDA FINAL - FINANZAS

```javascript
{
  analisis_id: "uuid-finanzas",
  estado: "completado",
  
  // Input
  presupuesto_total: 60000,
  
  // Desglose
  desglose: {
    inventario: 30000,
    gastos_ops: 6400,
    marketing: 12000,
    margen_seguridad: 13600
  },
  
  // Datos operacionales
  cogs_unitario: 9.50,
  precio_venta: 32,
  volumen_mensual_estimado: 500,
  
  margen_bruto: 70, // %
  margen_neto: 36, // % (después impuestos y gastos)
  
  // Escenarios
  escenario_pesimista: {
    volumen_inicial: 250,
    ganancia_mensual: 1867,
    break_even_meses: 11
  },
  
  escenario_realista: {
    volumen_inicial: 500,
    ganancia_mensual: 5867,
    break_even_meses: 10
  },
  
  escenario_optimista: {
    volumen_inicial: 750,
    ganancia_mensual: 9767,
    break_even_meses: 6
  },
  
  // Proyección
  proyeccion_12_meses: [ /* Array 12 meses */ ],
  
  ganancia_anual_total: 88770,
  roi: 48, // %
  
  // Alertas
  alertas: [
    {
      nivel: "verde",
      mensaje: "Margen excelente (40%+), proyecto viable"
    }
  ],
  
  // Recomendaciones
  recomendaciones: [
    "Negocia COGS con proveedor, posible ahorrar $1.50/u",
    "Mes 6, considera expansión a estado vecino",
    "Planifica reinversión de ganancias mes 5"
  ],
  
  // Archivos
  pdf_url: "s3://...",
  excel_url: "s3://...",
  
  fecha_creacion: "2025-03-26T14:30:00Z",
  fecha_completado: "2025-03-26T14:39:00Z"
}
```

---

## 🎨 PARTE 7: BRANDING Y LOGO

```
FEATURE: Usuario registra SU MARCA

Input:
├─ Logo (upload image)
├─ Nombre marca
├─ Slogan
├─ Descripción
└─ (Optional) Paleta colores manual

IA DETECTA AUTOMÁTICAMENTE:
├─ Colores dominantes del logo
├─ Tipografía predominante
├─ Estilo visual
├─ Genera paleta automática
└─ Recomienda Google Fonts

INTEGRACIÓN EN MARKETING:
├─ Todos los bocetos incluyen logo
├─ Colores de marca en posts
├─ Tipografía consistente
└─ Posts profesionales, identificables

OUTPUT - GUÍA DE BRANDING PDF:
├─ Logo versiones (horizontal, vertical, símbolo)
├─ Paleta colores (HEX, RGB, Pantone)
├─ Tipografía (tamaños, pesos)
├─ Espacios, márgenes
└─ Casos de uso (redes, email, publicidad)
```

---

## 🗄️ PARTE 8: BASE DE DATOS - 13 TABLAS

**Ver documento técnico para SQL exacto.**

Las 13 tablas son:
```
1. usuarios
2. marcas
3. productos
4. analisis_marketing
5. analisis_mercado
6. competidores_detectados
7. analisis_finanzas
8. proveedores
9. cotizaciones
10. resenas_proveedores
11. creditos_usuario
12. historial_prompts
13. actividad_usuario
```

---

## 🔐 PARTE 9: AUTENTICACIÓN

```
JWT:
├─ Access token: 24 horas
├─ Refresh token: 7 días
└─ Rotation automática

2FA (TOTP):
├─ Time-based, 30 segundos
├─ Ventana tolerancia: 2
└─ Almacenado encrypted

Contraseñas:
├─ Bcrypt (salt rounds 10+)
├─ Mín 8 caracteres
├─ Mayúscula, número, especial

Rate Limiting:
├─ 5 intentos login × 15 min
└─ Lockout 30 min después
```

---

## ⚙️ PARTE 10: STACK LOCAL

```
BACKEND:
├─ Node.js 18+
├─ Express 4.18
├─ TypeORM
├─ PostgreSQL 15
└─ Redis 7

FRONTEND:
├─ Next.js 13+
├─ React 18+
├─ Tailwind CSS
└─ Chart.js (gráficos)

DEVOPS:
├─ Docker Compose
├─ GitHub Actions
└─ Railway/Vercel (producción)

APIS:
├─ Claude (Anthropic)
├─ Nano Banana Pro
├─ Nana DOS
├─ Google Trends
├─ SerpAPI
└─ Stripe
```

---

## 🚀 PARTE 11: CÓMO EMPEZAR

```
1. Lee este documento COMPLETO (importante)

2. Cuando termines, dile al usuario:
   "Entendí TODO. Estoy listo para generar la estructura base."

3. Genera:
   - Backend (Express setup + rutas auth)
   - Frontend (Next.js setup + landing + login)
   - Docker Compose (local)
   - .env.example
   - README con instrucciones

4. Usuario hace:
   - Docker-compose up -d
   - Verifica que funciona
   - Git push

5. Luego: Sprint 1 completo (auth + productos)
```

---

## ✅ CONFIRMACIÓN FINAL

**Este documento contiene TODO.**

Si algo NO está aquí, NO existe en el proyecto.

Si algo es ambiguo, es culpa del documento.

**LISTO PARA PROGRAMAR.** 🚀

---

**FIN DOCUMENTO TOTAL PARA CLAUDE CODE**
