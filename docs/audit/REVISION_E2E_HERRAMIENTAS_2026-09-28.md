# Revisión de extremo a extremo del backend y las herramientas — 2026-09-27/28

**Pregunta:** ¿funciona todo de verdad —cada botón, enlace, formulario y navegación—,
de lo básico a lo complicado?

**Respuesta corta:** la base era sólida (autenticación, rutas y contratos
formulario↔API casi todos bien), pero al usar las herramientas como las usaría un
negocio aparecieron **fallos que sí le costaban dinero o datos**: ventas de
cotizaciones cuyo ingreso sobrevivía a la cancelación, gastos que podían duplicarse,
compras que perdían su egreso sin avisar, fechas que por la tarde caían en el día
siguiente y enlaces de WhatsApp que no abrían ningún chat. Todo lo encontrado está
corregido, con test, salvo lo listado en «Pendiente» al final.

---

## Método

Pila aislada para no tocar la de desarrollo: base `bi0a100_e2e` (migraciones desde
cero), backend compilado en `:3101` con Redis db 13 y `next dev` en `:3102`.

| Comprobación | Resultado |
|---|---|
| Endpoints privados sin sesión | 244 responden 401; 17 públicos, todos a propósito |
| `GET` con tres perfiles (dueño, trabajador, admin) | 102 × 3, ningún 5xx |
| Llamadas del frontend ↔ endpoints del backend | 263 llamadas: 260 resueltas, 2 con URL dinámica revisadas a mano, 1 falso positivo del script |
| Páginas | Las 56 cargan; cierre de sesión y bloqueo de `/admin` a no admins, correctos |
| Campos que el formulario manda como `null` y el esquema rechazaba | 19 envíos comparados: 0 tras los arreglos |
| Campos que el formulario manda y Zod descartaba en silencio | 40 envíos: 0 con pérdida real |
| Handlers `async` sin captura de errores | 0 tras los arreglos (eran 4) |
| SQL con datos del usuario interpolados | Ninguno: todo parametrizado |
| Flujos completos en el navegador | Cotización → venta → cancelación, fila de hoy, nómina, almacén, contabilidad, mantenimientos, análisis de Finanzas |
| Suite del backend | **104/104 suites, 1213/1213 tests** |

---

## Hallazgos y arreglos

### Dinero y contabilidad

1. **Cancelar una venta que venía de una cotización no revertía su ingreso.** La
   cancelación solo buscaba asientos con `referencia_tipo = 'venta'` y los de la
   cotización referencian la cotización. El test existente pasaba en vacío porque su
   consulta tampoco los incluía. Ahora la cancelación invierte también el asiento
   principal de la venta y sus hijos (`routes/pos.ts`); el test se reescribió y
   exige 4 asientos con neto cero.
2. **La venta de una cotización no apartaba el IVA.** El POS registra el ingreso y un
   hijo «IVA por pagar»; la conversión solo el ingreso, así que la utilidad salía
   inflada y el IVA a declarar corto. Ahora lo aparta igual.
3. **«Aceptar» dejaba la cotización imposible de vender** (la conversión trataba
   `estado = 'aceptada'` como «ya vendida»). Lo que decide ahora es la venta vigente;
   hay botón «Vender» con método de pago validado (antes cualquier texto acababa en
   `ventas.metodo_pago`), y la migración `1775670000000` hace parcial el índice
   único para que una cotización cuya venta se canceló pueda venderse otra vez.
4. **Gastos que se podían duplicar.** El backend ofrece idempotencia, pero Almacén
   (compras), Contabilidad (movimiento manual) y Mantenimientos (servicio con costo)
   no mandaban `Idempotency-Key`: un doble clic o un reintento tras un corte de red
   registraba el gasto dos veces. Ahora la mandan.
5. **Una compra con un producto de otra cuenta perdía su egreso sin avisar** y
   guardaba la referencia ajena. Ahora responde 404.
6. **Borrar un movimiento de almacén no revertía el stock** (una compra borrada
   dejaba sus unidades) y quitaba el egreso fuera de la transacción tragándose el
   error. Ahora solo se deshace el último movimiento del insumo, entero y en una
   transacción: stock, costo promedio y egreso.
7. **El stock inicial nacía sin movimiento** que lo explicara. El alta deja un ajuste
   «Inventario inicial» (sin gasto: no es una compra de hoy) que no consume el tope
   del plan gratuito.
8. **Simulador de precios:** un canal inexistente simulaba con 0 % de comisión sin
   avisar. Ahora 404, como ya hacían el POS y el alta manual.

### Fechas

9. **«Hoy» en UTC en el frontend.** En México, desde las 18:00 es «mañana» en UTC:
   - la tarjeta «Ventas de hoy» y el filtro «Hoy» del POS salían en $0 por la tarde;
   - registrar un mantenimiento por la tarde fallaba (el backend lo veía «futuro»);
   - un pago de nómina del día 30 por la tarde quedaba con fecha del 1 (otro mes);
   - movimientos manuales y liquidaciones quedaban con fecha de mañana.
   Nuevo `lib/fechaLocal.ts` (`hoyLocal()`, `fechaLocal(d)`), equivalente a
   `hoyDePeticion()` del backend. En el backend, «la historia del día» de Ventas y su
   análisis también usan ya el día local.
10. **Proyección de Finanzas:** los meses se llamaban Enero…Diciembre aunque el
    análisis se hiciera en septiembre («tu peor mes: Enero» era el primero). Ahora el
    mes 1 es el mes en curso de quien lo pide.

### Accesos y datos de otras cuentas

11. **Trabajadores (pre-corte):** no veían los productos asignados, los módulos de
    análisis los bloqueaban o miraban la cuenta equivocada, el panel mezclaba datos y
    el POS les pedía los canales a Contabilidad (403). Corregido con
    `requireModuloAcceso()` y `productosAsignados()`; `GET /pos/canales` nuevo.
12. **Referencias ajenas en altas:** cotizaciones (cliente, producto y negocio),
    empleados (negocio y producto) y ventas del POS (negocio) guardaban ids de otra
    cuenta sin comprobarlos. Ahora 404. El `cliente_id` de las cotizaciones además se
    descartaba: ninguna quedaba ligada a su expediente.
13. **Cuatro acciones de admin** (rol, reinicio de 2FA, papelera, restaurar) dejaban
    la petición colgada si la verificación TOTP fallaba por algo inesperado.

### Formularios y botones

14. Cotizaciones y Nómina rechazaban con 400 los campos opcionales vacíos (el
    formulario manda `null`). Moneda por defecto `USD` en ambos → la del país.
15. «Duplicar» cotización mandaba un `PATCH` sin id: nunca funcionó.
16. El IVA de una cotización nueva arrancaba en 0 %: ahora el del país (16 % en MX).
17. «Agendar cita» y «Crear cotización» desde un cliente abrían la herramienta vacía:
    ahora con el cliente precargado y ligado.
18. POS sin botón para cancelar una venta; Contabilidad ofrecía Editar/Borrar en
    asientos que el backend nunca deja tocar y fallaba en silencio. Resueltos.
19. **WhatsApp sin lada:** `wa.me/3312345678` no abre ningún chat. Nuevo
    `utils/whatsapp.ts` (y su gemelo en `frontend/lib/whatsapp.ts`) añade la lada del
    país del producto; lo usan clientes, citas, fila, cotizaciones, tickets y nómina.
20. Riesgos de Finanzas sin IA: titulaba «margen insuficiente» con un 27 % y hablaba
    de «recuperar la inversión» sin inversión declarada.
21. Favicon (`app/icon.svg`) e imagen para compartir (`app/opengraph-image.tsx`); el
    layout apuntaba a un `/og-image.png` inexistente. `h1` en Mantenimientos, nombres
    accesibles en botones de icono de la fila, lugares y edición contable.

---

## Pendiente (no se tocó, con motivo)

- **Términos y Aviso de privacidad** son páginas de relleno: necesitan el texto legal
  del negocio (razón social, domicilio, responsable de datos). Bloquea el lanzamiento.
- **Botón de «Entrar» sin nombre accesible** en `/auth/login`: es la zona de
  autenticación; se deja para quien lleva ese diseño.
- **Títulos de pestaña**: todas las herramientas dicen «Dashboard | BI 0 A 100».
- Los permisos de herramientas de un trabajador valen para toda la cuenta, no por
  producto (los de módulos de análisis sí se acotan a sus productos). Es una
  decisión de producto, no un fallo.
- Borrar un equipo de Mantenimientos deja sus egresos (correcto: el gasto existió),
  pero ya no hay herramienta donde corregirlos.
- 287 avisos de ESLint previos (imports sin usar, patrones de hooks), 0 errores.
- Las 14 bases temporales de la auditoría y de esta revisión se borraron el
  2026-09-28 con permiso del dueño; quedan solo `bi0a100_db` y `bi0a100_test`.
