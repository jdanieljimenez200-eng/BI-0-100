# Auditoría de los 6 módulos de análisis — ¿le sirven a un negocio real?

**Fecha:** 2026-09-23 · **Rama:** `master`, sin commit · **Alcance:** backend de Mercado, Marketing, Finanzas, Legal, Brief y Ventas (~10 000 líneas: orquestadores, servicios, prompts) y las pantallas de resultado que los consumen.
**Método:** lectura del código, ejecución de la suite de tests y comprobaciones HTTP contra el entorno Docker local. Lo que no se pudo ejecutar se marca **No verificado**.
**Pregunta que se respondía:** si un dueño de negocio real usa esto, ¿las cifras que ve describen su negocio?

---

## Resumen

La base es mejor de lo que aparenta: el modelo de viabilidad declara sus pesos y excluye los factores que no puede medir; Finanzas hace aritmética correcta sobre datos del usuario; Legal está bien construido (metadatos por país, anti-inyección, prohibición de inventar leyes y URLs, validación del dominio oficial, Opus a temperatura 0.3); y Marketing se alimenta del análisis de Mercado, del Brief y del ICP de Ventas, que es el verdadero diferenciador.

El problema no era la IA alucinando: era **código determinista que fabricaba cifras**. Cinco defectos producían números que un dueño habría tomado por buenos:

| # | Defecto | Efecto en un negocio real | Estado |
|---|---|---|---|
| 1 | El «payback» no tenía dato de inversión | Decía «recuperas tu inversión en 1 mes» a cualquier negocio rentable | **Corregido** |
| 2 | ROAS con piso de 1.2 por código | La simulación de pauta nunca podía avisar de una campaña perdedora | **Corregido** |
| 3 | Competidores fabricados sin fuente | «ImportadoraPlus2» con rating, reseñas y años en el mercado; fijaban el precio de mercado y puntuaban la viabilidad | **Corregido** |
| 4 | El tablero de Ventas+ pedía campos que el backend nunca emitió | Unit economics en 0 y guion de WhatsApp vacío **para todos los usuarios** | **Corregido** |
| 5 | Inversión y costos fijos inventados en Mercado (50 000 / 8 000) | Payback y reporte BI calculados sobre un negocio que no existe | **Corregido** |

---

## Hallazgos y qué se hizo

### 1. El payback de Finanzas era siempre el mes 1 · P0 · corregido

`breakevenService` buscaba el primer mes con utilidad acumulada ≥ 0 **partiendo de cero**, y no existía ningún campo de inversión inicial en `FinanzasInput` ni en el zod de la ruta. Para cualquier negocio rentable eso es el mes 1. El dato viajaba a `resumenService` como `payback_meses` y entraba en el prompt de riesgos, así que la IA razonaba sobre él. La pantalla, además, lo sustituía por el mes de equilibrio cuando venía vacío.

**Corregido:** campo `inversion_inicial` (opcional) en el formulario, la ruta y el modelo; el payback es ahora el mes en que la utilidad acumulada alcanza lo invertido, o `null` con motivo (`sin_inversion_declarada` / `no_se_recupera_en_12_meses`). Sin el dato, la tarjeta dice «Sin calcular · declara tu inversión inicial». El prompt de riesgos recibe el motivo para no hablar de recuperación cuando nadie declaró inversión.

**De regalo:** el `roi_anual` se calculaba contra los costos fijos del año, no contra una inversión. Ahora usa la inversión cuando existe y, si no, la etiqueta cambia a «Retorno s/ costos fijos» en vez de llamarlo ROI.

### 2. El ROAS no podía dar pérdida · P0 · corregido

`posicionamientoService` cerraba con `roas_estimado: Math.max(1.2, roasEstimado)`. Por construcción, la herramienta jamás decía que una campaña perdía dinero.

**Corregido:** sin piso, más `rentable: boolean` y un aviso explícito en la pantalla cuando el retorno baja de 1. La unit economics se presenta como «simulación con supuestos», no como proyección.

### 3. El CPC era 2.6 para los 18 países · P1 · corregido

El mismo número se aplicaba a pesos mexicanos, pesos colombianos, soles y reales. Un CPC de 2,6 COP no existe.

**Corregido:** `services/marketing/benchmarksPais.ts` con el CPC de referencia por país **en su moneda**, usado solo cuando el usuario no ha subido su reporte de anuncios; la salida marca `origen_supuestos: 'tus_datos' | 'benchmark'` y la pantalla lo dice.

### 4. Competencia y tendencias fabricadas · P0 · corregido

Sin `SERPAPI_KEY` (y la variable viene vacía en `.env.production.template`):

- `competenciaService` generaba de 2 a 7 competidores con nombres de plantilla («TiendaOnline1», «ImportadoraPlus2»), precio, rating, número de reseñas, años en el mercado y hasta un «gap detectado».
- `googleLocalService` hacía lo mismo para servicios con una tabla de benchmarks por sector.
- `tendenciasService` inventaba el volumen de búsquedas mensual y una serie de 12 meses a partir de un hash del nombre del producto.
- MercadoLibre sin resultados devolvía «mercado por explorar» **y el precio del propio usuario como precio de mercado**, con lo que su precio siempre parecía estar en la media.

La interfaz los etiquetaba «estimado», pero seguían fijando el precio de mercado y puntuando la viabilidad.

**Corregido:** los mocks se eliminaron. `CompetenciaResult` y `TendenciasResult` llevan `fuente_disponible` + `motivo_sin_fuente` (`sin_configurar` / `fuente_fallo` / `sin_resultados`), y la pantalla muestra «No pudimos rastrear competencia en tu zona» explicando que ese bloque no puntuó.

**Y lo más importante:** `scoreCompetencia(0)` valía **100**. Al quitar los mocks, un mercado sin rastrear habría salido como el mejor hueco del mundo. Ahora los factores sin fuente **no puntúan** (se reparte el peso, como ya hacía el precio relativo), la confianza baja y el resultado incluye `cobertura_datos` (qué proporción del modelo se pudo evaluar). La densidad por km² tampoco se calcula sin competencia: dividir cero entre el área daba «hueco geográfico».

### 5. El tablero de Ventas+ llevaba mostrando ceros · P0 · corregido

`VentasPlusEstrategiaView.tsx` leía `roas_proyectado`, `clics_proyectados`, `cpc_estimado`, `leads_proyectados`, `paso_1_filtro`, `dia_1_caso_exito`… **Ninguno de esos nombres existe en el backend**, que emite `roas_estimado`, `clics_estimados`, `cpc_promedio`, `leads_o_conversaciones`, `paso1_filtro`, `dia1_caso_exito`. Resultado: la estrategia recomendada (la de mayor valor, «Ventas+») mostraba «ROAS 0x», «Tráfico 0», «CPC —» y el guion de cierre vacío para todos los usuarios.

**Corregido:** la vista se alineó con la forma real del backend, con comentario de que los dos archivos se mueven juntos. El CPL y la ganancia bruta, que el backend no manda, ahora se derivan de los datos que sí llegan.

### 6. Mercado inventaba inversión y costos fijos · P0 · corregido

`mercadoOrchestrator` construía el contexto financiero con `inversion_inicial: rentaEstimada * 3 || 50000` y `costos_fijos: rentaEstimada || 8000`, y repetía `50000` para el reporte BI. Mientras tanto, **el producto ya guardaba `inversion_inicial`, `costos_fijos` y `puv` declarados por el dueño**, y el orquestador los ignoraba (mandaba `puv: ''`).

**Corregido:** se usan los datos declarados del producto; si no hay inversión, el payback no se genera en vez de rellenarse.

### 7. El TAM no distinguía un negocio de barrio de uno nacional · P1 · corregido

Penetraciones fijas (0,1 / 0,25 / 0,5 %) sobre la población del estado o del país. Una barbería de una colonia recibía «clientes potenciales» de todo Jalisco. Además, el filtro de nivel socioeconómico usa la clasificación **AMAI mexicana** y se multiplicaba igual en Colombia (estratos 1-6) o Brasil, y la estacionalidad (Buen Fin, fiestas patrias, cuesta de enero) se aplicaba a los 18 países.

**Corregido:** nuevo `services/mercado/coberturaPais.ts` declara qué país tiene tabla propia. Fuera de México no se aplica NSE ni estacionalidad **y se explica por qué**. El resultado incluye `supuestos` con las penetraciones usadas, la población base y advertencias (entre ellas, que un negocio local está midiéndose contra toda la región).

### 8. La proyección no descuenta impuestos · P1 · corregido a medias (y honesto)

La proyección a 12 meses presentaba utilidad **antes** de impuestos llamándola «utilidad neta». Matiz importante que corrige una sospecha inicial: **sí existe** un estimador fiscal detallado (IVA, RESICO, IMSS, INFONAVIT) en la pestaña de movimientos, pero trabaja sobre lo que de verdad se facturó, no sobre la proyección.

**Corregido:** la proyección declara `utilidad_antes_de_impuestos` y la tarjeta se llama «Utilidad antes de impuestos». **No** se modeló un motor fiscal por país para la proyección: inventar tasas para 18 países sería repetir el problema que esta auditoría venía a arreglar.

**Añadido de paso:** `caja_necesaria` y `mes_valle` — el punto más bajo del saldo contando la inversión. Un negocio rentable en el papel puede quedarse sin dinero en el mes 3 y la proyección no lo mencionaba. Se calcula con los datos que ya había, sin pedir nada nuevo.

### 9. Los análisis ignoraban las ventas reales del negocio · P2 · corregido

La plataforma tiene POS, inventario y contabilidad, y `calcularCalibracionMensual` ya calculaba ingreso y egreso promedio, costos fijos sugeridos y crecimiento real desde `movimientos_contables` — pero solo se usaba al importar un CSV. Un negocio en marcha volvía a teclear a mano lo que el sistema ya sabía.

**Corregido:** `GET /api/finanzas/calibracion/:productoId` y un aviso en el formulario: «Tenemos tus números reales — N meses de tu contabilidad» con un botón para volcarlos. Se ofrecen, no se imponen, y se muestra la confianza cuando hay pocos meses de historial.

### 10. Prompts que afirmaban datos inventados · P2 · corregido

El prompt del calendario enseñaba como hechos «comentar 30 min antes = +40 % de alcance orgánico» y «el engagement de nicho supera 3× el promedio». A diferencia de Legal, no prohibía inventar métricas.

**Corregido:** fuera las cifras inventadas y regla nueva: «no inventes cifras de desempeño; si das un número, enúncialo como hipótesis a medir».

### 11. Legal no fechaba su vigencia · P2 · corregido

El dictamen depende del corte de conocimiento del modelo y no lo decía. Ahora el descargo incluye la fecha de redacción y avisa de que una reforma posterior no está recogida.

### 12. Mercado también ignoraba las ventas del POS · P2 · corregido

El formulario pedía «ventas al mes» y «tasa de repetición» a mano incluso a un negocio que lleva meses cobrando con el POS de la propia plataforma. El análisis se construía sobre un recuerdo, y de ahí salían el payback, el estudio del área y los prompts del reporte BI.

**Corregido:** `services/mercado/traccionReal.ts` agrega en SQL las ventas del producto —reutilizando `filtroVentas` de Reportes, así que hereda la regla de que **las canceladas no cuentan**— sobre los **meses completos** (el mes en curso va a medias y hundiría el promedio) y devuelve tickets por mes, ticket promedio y tasa de repetición real. Esta última solo se calcula con 5 o más clientes identificados: con 2 o 3 el porcentaje es ruido.

El orquestador usa esos números por encima de lo declarado y guarda el rastro en `traccion_data` (migración `1775650000000`), de modo que la pantalla puede decir «Tracción de tus ventas» en vez de presentarlo como una estimación más. El formulario los precarga desde `GET /api/mercado/traccion/:productoId` y el usuario puede corregirlos si ese periodo no representa su mes típico. Sin ventas, todo sigue como antes con el dato declarado.

---

## Lo que NO se tocó, y por qué

| Tema | Decisión |
|---|---|
| Población por país en `utils/latam.ts` (cifras redondas sin fuente ni año) | Documentar la fuente es tarea de datos, no de código. Pendiente. |
| Motor fiscal por país en la proyección | Inventar tasas de 18 países sería repetir el defecto auditado. La proyección declara que va antes de impuestos. |
| Días de inventario y de cobro como entrada | Habría que añadir campos al formulario; en su lugar se derivó `caja_necesaria`, que no pide nada. |
| `clientes_mes` real del POS hacia Mercado | **Hecho** (ver §12). |
| `frontend/lib/taxConfig.ts` duplicado con el backend | Moverlo toca POS, inventario y contabilidad, herramientas con trabajo en curso de otras sesiones. |

---

## Validaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` backend | ✅ 0 errores |
| `npm run typecheck` frontend | ✅ 0 errores |
| Tests de servicios (con los nuevos) | ✅ 685/685 |
| Suite completa del backend (unitarios + integración) | ✅ 95/95 suites, 1138/1138 tests |
| ESLint de los tres módulos tocados | ✅ 0 errores (71 avisos previos) |
| `next build` | ✅ 64 rutas, 40 s |
| Rutas nuevas sin sesión | ✅ 401 en `/api/finanzas/calibracion/:id`, con UUID válido e inválido |
| Docker | ✅ `/health`: base de datos, Redis y worker operativos |

**Tests nuevos:** payback con y sin inversión declarada y cuando no se recupera en 12 meses; caja necesaria con arranque en pérdidas; TAM sin tabla de país (no multiplica NSE ni muestra estacionalidad) y aviso de escala local; score con competencia no evaluable (los factores se excluyen, baja `cobertura_datos` y aparece el motivo); campaña con ROAS < 1 reportada como no rentable; CPC distinto por país; y que ninguna fuente caída produzca competidores o tendencias inventadas.

**No verificado:** el recorrido completo en el navegador con sesión real (crear producto → correr los 6 módulos → leer resultados). El agente no introduce contraseñas; queda para una pasada manual.
