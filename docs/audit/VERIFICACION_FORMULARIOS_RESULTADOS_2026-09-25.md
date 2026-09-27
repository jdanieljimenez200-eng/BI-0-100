# Verificación de formularios y resultados de los 6 módulos — 2026-09-25

Continuación de [AUDITORIA_MODULOS_ANALISIS_2026-09-23.md](AUDITORIA_MODULOS_ANALISIS_2026-09-23.md).
Allí se corrigió lo que **calculaba** mal. Aquí se comprobó lo que **llega y lo que se
enseña**: que cada formulario manda lo que el backend acepta, y que cada pantalla lee
el dato que el backend realmente escribió.

El navegador de esta sesión no tiene sesión iniciada y el agente no escribe contraseñas,
así que en lugar del recorrido manual se ejecutaron **los orquestadores de verdad** contra
`bi0a100_test`, con las claves de IA vacías (la configuración actual del entorno), y se
leyó lo que quedó guardado en cada columna.

---

## Hallazgos

### 1. La pantalla de Mercado enseñaba los cinco factores en 0 · P0 · corregido

El orquestador guarda el **resultado completo** de viabilidad en la columna
`viabilidad_factores` ([mercadoOrchestrator.ts:138](../../backend/src/services/mercado/mercadoOrchestrator.ts)):

```json
{ "score": 75, "estado": "VIABLE", "factores": { "margen": 75, "demanda": 0, … },
  "confianza": "baja", "cobertura_datos": 0.14, … }
```

`normalizeViabilidadFactores` recorría el **nivel de arriba**, así que:

- `factores` es un objeto y se descartaba entero → los cinco factores se quedaban en su
  valor inicial, **0**, en todos los análisis desde el primer commit;
- `score` y `cobertura_datos` son números y **se colaban como si fueran factores** → dos
  barras de más, una de ellas «cobertura datos: 0.14».

Resultado en pantalla: el anillo marcaba 75 y debajo «Margen 0 · Demanda 0 · Competencia 0».
La declaración de tipo tapaba el fallo: la propiedad se declaraba `Factores` cuando la
columna guarda el `ViabilidadResult`. Por eso el cotejo de tipos por nombre del 23-09 no lo
vio, y por eso ahora hay un tipo `ViabilidadGuardada` que describe la columna de verdad.

Además el normalizador ahora acepta las tres formas que existen en la base: el resultado
completo, el mapa plano (análisis viejos) y `{ score, label }` por factor (seeds de demo).

### 2. Un factor sin fuente se pintaba como un 0 medido · P0 · corregido

Con `SERPAPI_KEY` vacía, competencia y tendencias no puntúan —correcto desde el 23-09—
pero en `factores` van en 0, y un 0 rojo se lee como «lo medimos y salió malísimo».
`ViabilidadResult` gana `factores_no_evaluados` y la barra escribe **«sin datos»** en gris,
sin rellenar. Debajo aparece **cuánto del modelo se pudo evaluar**: con `cobertura_datos`
0.14 el usuario ya no ve un 75 con el mismo aire de veredicto que un 75 completo.

El subtítulo prometía «Score calculado con datos reales de competencia, tendencias, precio y
tamaño de mercado»; por debajo del 60 % de cobertura ahora dice que el score es parcial.

### 3. El aviso del TAM se contradecía con su propio número · P1 · corregido

El aviso de escala local se componía **antes** de aplicar el filtro NSE, que reasigna la
población. La misma tarjeta enseñaba «la base son los 8 348 151 habitantes de Jalisco» y
`poblacion_base: 1 168 741`. Ahora el aviso se escribe después y nombra los dos números.

### 4. Texto y cifras inventadas cuando no hay dato · P0 · corregido

En el normalizador del reporte BI de Mercado:

| Antes | Ahora |
|---|---|
| `score ?? 75` — sin score, la pantalla mostraba 75, que se lee «viable» | `?? 0` |
| «identifica 0 competidores … demanda de 0 búsquedas … **posición favorable con oportunidades claras**» | solo afirma lo que se midió; sin fuentes dice que el análisis se apoya en lo declarado |
| «Precio promedio de mercado en **competitivo**» | «No hay precio de mercado rastreado para comparar el tuyo» |
| «0 competidores analizados en el área» | «No se pudo rastrear competencia en el área» |

### 5. Marketing inventaba el calendario en el frontend · P0 · corregido

`normalizeCalendario` traía de fábrica un calendario de **dos semanas con publicaciones,
horas, plataformas y copies**, y tres tendencias con score **92 / 88 / 84** y su
justificación. Cuando `calendario_data` venía null, eso se pintaba igual que el contenido
real. Es el mismo defecto que el hallazgo 10 del 23-09 (métricas inventadas en el prompt
del calendario), pero en la pantalla. Ahora todo arranca vacío y solo se llena con lo que
mande el backend; las secciones ya estaban guardadas por `length > 0`, así que sin dato no
se enseña el bloque. El candado de la semana 2 por plan (`secciones_bloqueadas`) no cambia.

### 6. `ticket_promedio` sin tope de columna · P1 · corregido

`POST /api/ventas/analizar` valida a mano (no con zod) y no acotaba `ticket_promedio`,
que en base es `decimal(10,2)`: un dedazo de `1000000000` reventaba el INSERT y el usuario
veía un 500. Ahora responde 400 con el motivo.

---

## Lo que se comprobó y estaba bien

| Comprobación | Resultado |
|---|---|
| Formulario → esquema de la ruta (mercado, marketing, finanzas, legal) | ✅ ninguna clave enviada que el esquema no declare |
| Formulario de Ventas → `parseInput` | ✅ las 5 claves que manda son las que acepta |
| Tipos compartidos frontend ↔ backend (45 con el mismo nombre) | ✅ consistentes (2 falsos positivos: herencia por `extends` y un campo declarado en una interfaz hermana) |
| Columnas `*_data` contra las claves **reales** de una ejecución (legal, ventas, marketing, mercado, finanzas) | ✅ ningún campo obligatorio ausente |
| Tracción del POS hacia Mercado | ✅ 180 ventas en 3 meses completos → `clientes_mes: 60`, `ticket_promedio: 120`, confianza alta; pisa el 999 declarado en el formulario |
| Payback de Finanzas | ✅ `null` + `sin_inversion_declarada` sin inversión; `null` + `no_se_recupera_en_12_meses` con 180 000 que no se recuperan (58 200 de utilidad acumulada a 12 meses) |
| ROI de Finanzas | ✅ 19 % sobre costos fijos anuales sin inversión; 32 % sobre la inversión con ella (58 200 / 180 000) |
| Caja necesaria | ✅ 4 050 sin inversión, 184 050 con ella; mes valle 3 |
| Competencia y tendencias sin clave | ✅ `fuente_disponible: false` con motivo (`fuente_fallo`, `sin_configurar`) y **cero** competidores inventados |
| Legal, Ventas y Marketing completos | ✅ los tres terminan en `completado` sin error y con las secciones pobladas |

**`resultado_estimado: false` sin `ANTHROPIC_API_KEY` no es un fallo.** Está declarado en
[seguimientoIA.ts](../../backend/src/utils/seguimientoIA.ts): sin clave, la plantilla es el
comportamiento previsto de desarrollo y no se anota. Efecto práctico mientras la clave esté
vacía: los textos narrativos son plantilla, la pantalla no lo distingue y el análisis **sí**
consume cuota.

---

## Validaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` backend | ✅ 0 errores |
| `npm run typecheck` frontend | ✅ 0 errores |
| Tests de los servicios de Mercado (con los 3 nuevos) | ✅ 136/136 |
| `src/__tests__/routes/ventas.test.ts` (con los 2 nuevos) | ✅ 9/9 |
| Suite completa del backend (unitarios + integración) | ✅ 96/96 suites, 1153/1153 tests |
| ESLint de las dos pantallas tocadas | ✅ 0 errores (40 avisos previos) |
| Orquestadores ejecutados de verdad contra `bi0a100_test` | ✅ Mercado, Finanzas, Legal, Ventas y Marketing en `completado` |

**Tests nuevos:** el aviso del TAM nombra la población del estado y la ya recortada por NSE;
`factores_no_evaluados` lista los factores sin fuente y no incluye el margen; con las dos
fuentes disponibles la cobertura es 1 y no se marca nada como no evaluado; `ticket_promedio`
fuera del rango de la columna responde 400 y uno válido encola.

**No verificado:** el recorrido en el navegador con sesión real. Sigue pendiente de una
pasada manual.

**Para volver a ver las cifras guardadas** sin sesión, los dos guiones de inspección usados
aquí quedaron fuera del repositorio (scratchpad de la sesión); lo que hacen es crear un
usuario y un producto en `bi0a100_test`, sembrar ventas, llamar a los orquestadores y volcar
las claves de cada columna.
