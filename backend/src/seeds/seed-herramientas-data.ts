/**
 * Seed: Datos de HERRAMIENTAS para la cuenta de Valeria Torres.
 *
 * Puebla las herramientas activas (POS, Inventario, Clientes, Cotizaciones)
 * con datos realistas:
 *   - 8 Items POS (catálogo de productos vendibles)
 *   - 6 Ventas POS con tickets y líneas de detalle
 *   - 5 Insumos de Inventario con stock y movimientos
 *   - 8 Movimientos de inventario (entradas, salidas, ajustes)
 *   - 3 Cotizaciones (borrador, enviada, aceptada)
 *   - Actualiza los 3 clientes con negocio_id y categoría
 *
 * REQUIERE: haber ejecutado seed-usuario-completo.ts primero.
 * Ejecutar:  npx ts-node src/seeds/seed-herramientas-data.ts
 */

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

const databaseUrl = process.env.DATABASE_URL;
const AppDataSource = databaseUrl
  ? new DataSource({ type: 'postgres', url: databaseUrl, synchronize: false, logging: false })
  : new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'bi0a100',
      synchronize: false,
      logging: false,
    });

async function seed() {
  await AppDataSource.initialize();
  console.log('✅ Conectado a la base de datos');

  const qr = AppDataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    // ─── Resolver IDs del owner y sus entidades ─────────────────────────────
    const ownerRow = await qr.query(
      `SELECT id FROM usuarios WHERE email = $1`, ['valeria.torres@studiov.mx']
    );
    if (!ownerRow.length) throw new Error('Usuario valeria.torres@studiov.mx no encontrado. Ejecuta seed-usuario-completo.ts primero.');
    const ownerId: string = ownerRow[0].id;
    console.log(`👤 Owner ID: ${ownerId}`);

    // Negocios
    const negocios = await qr.query(
      `SELECT id, nombre FROM negocios WHERE usuario_id = $1`, [ownerId]
    );
    const negMap: Record<string, string> = {};
    for (const n of negocios) negMap[n.nombre] = n.id;
    const studioId = negMap['Studio V Creativo'];
    const saborId = negMap['Sabor Artesanal'];
    if (!studioId || !saborId) throw new Error('Negocios no encontrados');

    // Productos (necesarios para ventas y cotizaciones)
    const productos = await qr.query(
      `SELECT id, nombre FROM productos WHERE usuario_id = $1 ORDER BY created_at`, [ownerId]
    );
    const prodMap: Record<string, string> = {};
    for (const p of productos) prodMap[p.nombre] = p.id;
    const prod1 = prodMap['Paquete Identidad Visual Completa'];
    const prod4 = prodMap['Caja Degustación Premium'];
    const prod5 = prodMap['Tableta Cacao Ceremonial 72%'];

    // Clientes existentes
    const clientes = await qr.query(
      `SELECT id, nombre FROM clientes WHERE usuario_id = $1`, [ownerId]
    );
    const cliMap: Record<string, string> = {};
    for (const c of clientes) cliMap[c.nombre] = c.id;

    console.log('📋 Entidades encontradas. Insertando datos de herramientas...\n');

    // ═════════════════════════════════════════════════════════════════════════
    // 1. ITEMS POS (Catálogo de productos vendibles)
    // ═════════════════════════════════════════════════════════════════════════

    const itemsPos = [
      // Studio V Creativo
      { nombre: 'Diseño de Logo', descripcion: 'Logo profesional con 3 propuestas y 2 rondas de revisión', precio: 5500, categoria: 'Diseño', emoji: '🎨', negocio_id: studioId, orden: 1 },
      { nombre: 'Manual de Marca', descripcion: 'Guía de uso de identidad visual (20 páginas)', precio: 8000, categoria: 'Diseño', emoji: '📖', negocio_id: studioId, orden: 2 },
      { nombre: 'Pack Redes Sociales', descripcion: '10 plantillas editables para Instagram/Facebook', precio: 3500, categoria: 'Digital', emoji: '📱', negocio_id: studioId, orden: 3 },
      { nombre: 'Sesión de Consultoría', descripcion: 'Consultoría de posicionamiento de marca (2 horas)', precio: 2500, categoria: 'Consultoría', emoji: '💡', negocio_id: studioId, orden: 4 },
      { nombre: 'Tarjetas de Presentación', descripcion: 'Diseño + impresión 500 unidades papel opalina 300g', precio: 1800, categoria: 'Papelería', emoji: '💳', negocio_id: studioId, orden: 5 },
      // Sabor Artesanal
      { nombre: 'Caja Degustación 12pz', descripcion: '12 trufas artesanales en caja de madera', precio: 890, categoria: 'Chocolates', emoji: '🍫', negocio_id: saborId, orden: 1 },
      { nombre: 'Tableta 72% (80g)', descripcion: 'Chocolate oscuro 72% cacao oaxaqueño', precio: 165, categoria: 'Tabletas', emoji: '🍫', negocio_id: saborId, orden: 2 },
      { nombre: 'Kit Regalo Navidad', descripcion: '2 tabletas + 6 trufas + bolsa regalo personalizada', precio: 650, categoria: 'Regalos', emoji: '🎁', negocio_id: saborId, orden: 3 },
    ];

    const itemPosIds: Record<string, string> = {};
    for (const item of itemsPos) {
      const id = uuidv4();
      await qr.query(
        `INSERT INTO items_pos
           (id, usuario_id, negocio_id, nombre, descripcion, precio, categoria, emoji, activo, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, ownerId, item.negocio_id, item.nombre, item.descripcion, item.precio, item.categoria, item.emoji, true, item.orden]
      );
      itemPosIds[item.nombre] = id;
      console.log(`  🏪 Item POS: ${item.emoji} ${item.nombre} — $${item.precio}`);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 2. VENTAS POS (Tickets con líneas de detalle)
    // ═════════════════════════════════════════════════════════════════════════

    const ventas = [
      {
        numero_ticket: 'POS-000001', fecha: '2026-09-01',
        metodo_pago: 'transferencia', cliente_nombre: 'María González', cliente_telefono: '+52 55 1111 2222',
        negocio_id: studioId, producto_id: prod1,
        items: [
          { nombre: 'Diseño de Logo', precio: 5500, cantidad: 1 },
          { nombre: 'Manual de Marca', precio: 8000, cantidad: 1 },
          { nombre: 'Tarjetas de Presentación', precio: 1800, cantidad: 1 },
        ],
        notas: 'Paquete completo de branding para Tortas Mexicanas SA',
      },
      {
        numero_ticket: 'POS-000002', fecha: '2026-09-03',
        metodo_pago: 'tarjeta', cliente_nombre: 'Carlos Herrera', cliente_telefono: '+52 55 3333 4444',
        negocio_id: studioId, producto_id: prod1,
        items: [
          { nombre: 'Sesión de Consultoría', precio: 2500, cantidad: 2 },
          { nombre: 'Pack Redes Sociales', precio: 3500, cantidad: 1 },
        ],
        notas: 'Consultoría + templates para TechStart',
      },
      {
        numero_ticket: 'POS-000003', fecha: '2026-09-05',
        metodo_pago: 'efectivo', cliente_nombre: 'Ana Castillo', cliente_telefono: null,
        negocio_id: saborId, producto_id: prod4,
        items: [
          { nombre: 'Caja Degustación 12pz', precio: 890, cantidad: 3 },
          { nombre: 'Tableta 72% (80g)', precio: 165, cantidad: 5 },
        ],
        notas: 'Pedido para regalo corporativo',
      },
      {
        numero_ticket: 'POS-000004', fecha: '2026-09-06',
        metodo_pago: 'tarjeta', cliente_nombre: null, cliente_telefono: null,
        negocio_id: saborId, producto_id: prod5,
        items: [
          { nombre: 'Tableta 72% (80g)', precio: 165, cantidad: 2 },
        ],
        notas: null,
      },
      {
        numero_ticket: 'POS-000005', fecha: '2026-09-07',
        metodo_pago: 'transferencia', cliente_nombre: 'Lucía Fernández', cliente_telefono: '+52 33 5555 6666',
        negocio_id: studioId, producto_id: prod1,
        items: [
          { nombre: 'Diseño de Logo', precio: 5500, cantidad: 1 },
          { nombre: 'Pack Redes Sociales', precio: 3500, cantidad: 1 },
        ],
        notas: 'Logo + templates para Café Origin MX',
      },
      {
        numero_ticket: 'POS-000006', fecha: '2026-09-09',
        metodo_pago: 'efectivo', cliente_nombre: 'Pedro Sánchez', cliente_telefono: '+52 55 7777 8888',
        negocio_id: saborId, producto_id: prod4,
        items: [
          { nombre: 'Kit Regalo Navidad', precio: 650, cantidad: 4 },
          { nombre: 'Caja Degustación 12pz', precio: 890, cantidad: 2 },
        ],
        notas: 'Pedido anticipado de Navidad — entrega 1 diciembre',
      },
    ];

    for (const v of ventas) {
      const subtotal = v.items.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
      const impuesto_tasa = 0.16;
      const impuesto_monto = Math.round(subtotal * impuesto_tasa * 100) / 100;
      const total = Math.round((subtotal + impuesto_monto) * 100) / 100;

      const ventaId = uuidv4();
      await qr.query(
        `INSERT INTO ventas
           (id, usuario_id, producto_id, negocio_id, numero_ticket, fecha,
            subtotal, impuesto_monto, impuesto_tasa, impuesto_nombre, moneda,
            total, metodo_pago, cliente_nombre, cliente_telefono, notas, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          ventaId, ownerId, v.producto_id, v.negocio_id, v.numero_ticket, v.fecha,
          subtotal, impuesto_monto, impuesto_tasa, 'IVA', 'MXN',
          total, v.metodo_pago, v.cliente_nombre, v.cliente_telefono, v.notas, 'completada',
        ]
      );

      // Insertar líneas de detalle
      for (const item of v.items) {
        const subtotalLinea = item.precio * item.cantidad;
        await qr.query(
          `INSERT INTO venta_items
             (id, venta_id, item_pos_id, nombre_snapshot, precio_unitario, cantidad, subtotal_linea)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), ventaId, itemPosIds[item.nombre] || null, item.nombre, item.precio, item.cantidad, subtotalLinea]
        );
      }
      console.log(`  🧾 Venta ${v.numero_ticket}: $${total.toLocaleString()} MXN — ${v.items.length} items (${v.metodo_pago})`);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3. INSUMOS DE INVENTARIO
    // ═════════════════════════════════════════════════════════════════════════

    const insumos = [
      // Sabor Artesanal
      { nombre: 'Cacao en grano oaxaqueño', categoria: 'Materia Prima', unidad: 'kg', stock_actual: 45.5, stock_minimo: 10, costo_promedio: 280, proveedor: 'Cooperativa Cacao Real, Oaxaca', emoji: '🫘', negocio_id: saborId },
      { nombre: 'Manteca de cacao', categoria: 'Materia Prima', unidad: 'kg', stock_actual: 12.3, stock_minimo: 5, costo_promedio: 450, proveedor: 'Cooperativa Cacao Real, Oaxaca', emoji: '🧈', negocio_id: saborId },
      { nombre: 'Azúcar mascabado', categoria: 'Materia Prima', unidad: 'kg', stock_actual: 25, stock_minimo: 8, costo_promedio: 65, proveedor: 'Central de Abastos CDMX', emoji: '🍬', negocio_id: saborId },
      { nombre: 'Cajas de madera grabadas', categoria: 'Empaque', unidad: 'pieza', stock_actual: 38, stock_minimo: 20, costo_promedio: 85, proveedor: 'Carpintería Don Manuel', emoji: '📦', negocio_id: saborId },
      // Studio V Creativo
      { nombre: 'Papel opalina 300g (resma)', categoria: 'Papelería', unidad: 'pieza', stock_actual: 15, stock_minimo: 5, costo_promedio: 320, proveedor: 'Papelería del Centro', emoji: '📄', negocio_id: studioId },
    ];

    const insumoIds: Record<string, string> = {};
    for (const ins of insumos) {
      const id = uuidv4();
      await qr.query(
        `INSERT INTO insumos_inventario
           (id, usuario_id, negocio_id, nombre, categoria, unidad,
            stock_actual, stock_minimo, costo_promedio, proveedor_default, emoji, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, ownerId, ins.negocio_id, ins.nombre, ins.categoria, ins.unidad,
         ins.stock_actual, ins.stock_minimo, ins.costo_promedio, ins.proveedor, ins.emoji, true]
      );
      insumoIds[ins.nombre] = id;
      console.log(`  📦 Insumo: ${ins.emoji} ${ins.nombre} — ${ins.stock_actual} ${ins.unidad} (min: ${ins.stock_minimo})`);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 4. MOVIMIENTOS DE INVENTARIO
    // ═════════════════════════════════════════════════════════════════════════

    const movimientos = [
      // Entradas (compras)
      { insumo: 'Cacao en grano oaxaqueño', tipo: 'entrada', cantidad: 50, costo_unitario: 280, fecha: '2026-08-15', motivo: 'Compra mensual', proveedor: 'Cooperativa Cacao Real', stock_resultante: 50 },
      { insumo: 'Manteca de cacao', tipo: 'entrada', cantidad: 15, costo_unitario: 450, fecha: '2026-08-15', motivo: 'Compra mensual', proveedor: 'Cooperativa Cacao Real', stock_resultante: 15 },
      { insumo: 'Azúcar mascabado', tipo: 'entrada', cantidad: 30, costo_unitario: 65, fecha: '2026-08-20', motivo: 'Reposición', proveedor: 'Central de Abastos', stock_resultante: 30 },
      { insumo: 'Cajas de madera grabadas', tipo: 'entrada', cantidad: 50, costo_unitario: 85, fecha: '2026-08-25', motivo: 'Pedido de 50 cajas', proveedor: 'Carpintería Don Manuel', stock_resultante: 50 },
      // Salidas (consumo por producción)
      { insumo: 'Cacao en grano oaxaqueño', tipo: 'salida', cantidad: 4.5, costo_unitario: 280, fecha: '2026-09-01', motivo: 'Producción lote #12 — 30 tabletas', proveedor: null, stock_resultante: 45.5 },
      { insumo: 'Manteca de cacao', tipo: 'salida', cantidad: 2.7, costo_unitario: 450, fecha: '2026-09-01', motivo: 'Producción lote #12', proveedor: null, stock_resultante: 12.3 },
      { insumo: 'Azúcar mascabado', tipo: 'salida', cantidad: 5, costo_unitario: 65, fecha: '2026-09-01', motivo: 'Producción lote #12', proveedor: null, stock_resultante: 25 },
      { insumo: 'Cajas de madera grabadas', tipo: 'salida', cantidad: 12, costo_unitario: 85, fecha: '2026-09-05', motivo: 'Empaque pedido Ana Castillo (3 cajas × 4 por set)', proveedor: null, stock_resultante: 38 },
    ];

    for (const m of movimientos) {
      const costoTotal = Math.round(m.cantidad * m.costo_unitario * 100) / 100;
      await qr.query(
        `INSERT INTO movimientos_inventario
           (id, usuario_id, insumo_id, tipo, cantidad, costo_unitario, costo_total,
            stock_resultante, fecha, motivo, proveedor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [uuidv4(), ownerId, insumoIds[m.insumo], m.tipo, m.cantidad, m.costo_unitario,
         costoTotal, m.stock_resultante, m.fecha, m.motivo, m.proveedor]
      );
      const icon = m.tipo === 'entrada' ? '📥' : '📤';
      console.log(`  ${icon} Mov. ${m.tipo}: ${m.cantidad} ${m.insumo} — $${costoTotal}`);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 5. COTIZACIONES
    // ═════════════════════════════════════════════════════════════════════════

    const cotizaciones = [
      {
        numero: 'COT-000001', estado: 'aceptada',
        cliente_nombre: 'Carlos Herrera', cliente_empresa: 'TechStart', cliente_email: 'carlos@techstart.io', cliente_telefono: '+52 55 3333 4444',
        negocio_id: studioId, producto_id: prod1,
        items: [
          { descripcion: 'Diseño de logotipo con 3 propuestas', cantidad: 1, precio_unitario: 5500, subtotal: 5500 },
          { descripcion: 'Manual de identidad visual (20 páginas)', cantidad: 1, precio_unitario: 8000, subtotal: 8000 },
          { descripcion: 'Plantillas para redes sociales (10 piezas)', cantidad: 1, precio_unitario: 3500, subtotal: 3500 },
          { descripcion: 'Papelería digital (hoja membretada, firma email)', cantidad: 1, precio_unitario: 2000, subtotal: 2000 },
        ],
        descuento_pct: 5, moneda: 'MXN',
        fecha_vencimiento: '2026-09-30',
        notas: 'Incluye 2 rondas de revisión por entregable. Entrega estimada: 3 semanas.',
        marca_nombre: 'Studio V', marca_color: '#6C2BD9',
      },
      {
        numero: 'COT-000002', estado: 'enviada',
        cliente_nombre: 'Lucía Fernández', cliente_empresa: 'Café Origin MX', cliente_email: 'lucia@cafeoriginmx.com', cliente_telefono: '+52 33 5555 6666',
        negocio_id: studioId, producto_id: prod1,
        items: [
          { descripcion: 'Rediseño de logotipo', cantidad: 1, precio_unitario: 4500, subtotal: 4500 },
          { descripcion: 'Diseño de empaque para bolsa de café (3 variedades)', cantidad: 3, precio_unitario: 3000, subtotal: 9000 },
          { descripcion: 'Fotografía de producto (sesión de 4 horas)', cantidad: 1, precio_unitario: 6000, subtotal: 6000 },
        ],
        descuento_pct: 0, moneda: 'MXN',
        fecha_vencimiento: '2026-10-15',
        notas: 'Cotización para rebranding completo de Café Origin MX. Incluye sesión fotográfica profesional.',
        marca_nombre: 'Studio V', marca_color: '#6C2BD9',
      },
      {
        numero: 'COT-000003', estado: 'borrador',
        cliente_nombre: 'Roberto Méndez', cliente_empresa: 'Gimnasio Fuerza Total', cliente_email: 'roberto@fuerzatotal.mx', cliente_telefono: '+52 55 9999 0000',
        negocio_id: studioId, producto_id: prod1,
        items: [
          { descripcion: 'Identidad visual completa', cantidad: 1, precio_unitario: 18000, subtotal: 18000 },
          { descripcion: 'Diseño de sitio web (landing page)', cantidad: 1, precio_unitario: 8500, subtotal: 8500 },
          { descripcion: 'Sesión de consultoría de marketing digital', cantidad: 2, precio_unitario: 2500, subtotal: 5000 },
        ],
        descuento_pct: 10, moneda: 'MXN',
        fecha_vencimiento: null,
        notas: 'Borrador pendiente de revisión. Roberto pidió incluir social media management mensual.',
        marca_nombre: 'Studio V', marca_color: '#6C2BD9',
      },
    ];

    for (const c of cotizaciones) {
      const subtotal = c.items.reduce((sum, i) => sum + i.subtotal, 0);
      const descuentoMonto = Math.round(subtotal * (c.descuento_pct / 100) * 100) / 100;
      const baseGravable = subtotal - descuentoMonto;
      const impuestoTasa = 16;
      const impuestoMonto = Math.round(baseGravable * (impuestoTasa / 100) * 100) / 100;
      const total = Math.round((baseGravable + impuestoMonto) * 100) / 100;

      await qr.query(
        `INSERT INTO cotizaciones
           (id, usuario_id, negocio_id, producto_id, numero,
            cliente_nombre, cliente_empresa, cliente_email, cliente_telefono,
            items, subtotal, descuento_pct, descuento_monto,
            impuesto_tasa, impuesto_nombre, impuesto_monto, total, moneda,
            estado, fecha_vencimiento, notas,
            marca_nombre, marca_color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          uuidv4(), ownerId, c.negocio_id, c.producto_id, c.numero,
          c.cliente_nombre, c.cliente_empresa, c.cliente_email, c.cliente_telefono,
          JSON.stringify(c.items), subtotal, c.descuento_pct, descuentoMonto,
          impuestoTasa, 'IVA', impuestoMonto, total, c.moneda,
          c.estado, c.fecha_vencimiento, c.notas,
          c.marca_nombre, c.marca_color,
        ]
      );
      const statusIcon = c.estado === 'aceptada' ? '✅' : c.estado === 'enviada' ? '📨' : '📝';
      console.log(`  ${statusIcon} Cotización ${c.numero}: $${total.toLocaleString()} MXN — ${c.estado} (${c.cliente_nombre})`);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 6. ACTUALIZAR CLIENTES con negocio_id y categorías
    // ═════════════════════════════════════════════════════════════════════════

    if (cliMap['María González']) {
      await qr.query(
        `UPDATE clientes SET negocio_id = $1, categoria = $2, estado = $3, tipo_contacto = $4, fecha_ultimo_contacto = $5 WHERE id = $6`,
        [studioId, 'VIP', 'cliente', 'cliente', '2026-09-01', cliMap['María González']]
      );
    }
    if (cliMap['Carlos Herrera']) {
      await qr.query(
        `UPDATE clientes SET negocio_id = $1, categoria = $2, estado = $3, tipo_contacto = $4, fecha_ultimo_contacto = $5 WHERE id = $6`,
        [studioId, 'Lead Calificado', 'lead', 'cliente', '2026-09-03', cliMap['Carlos Herrera']]
      );
    }
    if (cliMap['Lucía Fernández']) {
      await qr.query(
        `UPDATE clientes SET negocio_id = $1, categoria = $2, estado = $3, tipo_contacto = $4, fecha_ultimo_contacto = $5 WHERE id = $6`,
        [studioId, 'Cliente Activo', 'cliente', 'cliente', '2026-09-07', cliMap['Lucía Fernández']]
      );
    }
    console.log('  🤝 Clientes actualizados con categorías y fechas de contacto');

    // ═════════════════════════════════════════════════════════════════════════
    // 7. METAS DE NEGOCIO
    // ═════════════════════════════════════════════════════════════════════════

    const metas = [
      {
        nombre: 'Ingresos septiembre Studio V',
        tipo: 'ingresos', objetivo: 80000,
        negocio_id: studioId,
        periodo_inicio: '2026-09-01', periodo_fin: '2026-09-30',
        notas: 'Meta de facturación mensual para el studio de diseño',
      },
      {
        nombre: 'Ventas cajas Sabor Artesanal',
        tipo: 'ventas', objetivo: 25,
        negocio_id: saborId,
        periodo_inicio: '2026-09-01', periodo_fin: '2026-09-30',
        notas: 'Vender 25 cajas de degustación en septiembre',
      },
      {
        nombre: 'Registrar 10 clientes nuevos',
        tipo: 'personalizada', objetivo: 10,
        negocio_id: null,
        periodo_inicio: '2026-09-01', periodo_fin: '2026-12-31',
        notas: 'Meta Q4: Expandir la base de clientes CRM',
        avance_manual: 3,
      },
    ];

    for (const m of metas) {
      await qr.query(
        `INSERT INTO metas_negocio
           (id, usuario_id, negocio_id, nombre, tipo, objetivo, avance_manual,
            periodo_inicio, periodo_fin, notas, activa)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [uuidv4(), ownerId, m.negocio_id, m.nombre, m.tipo, m.objetivo,
         (m as any).avance_manual || 0, m.periodo_inicio, m.periodo_fin, m.notas, true]
      );
      console.log(`  🎯 Meta: ${m.nombre} — objetivo: ${m.objetivo}`);
    }

    // ─── COMMIT ─────────────────────────────────────────────────────────────
    await qr.commitTransaction();

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 DATOS DE HERRAMIENTAS INSERTADOS EXITOSAMENTE');
    console.log('═'.repeat(60));
    console.log('');
    console.log('🏪 POS:          8 items en catálogo');
    console.log('🧾 Ventas:       6 tickets con detalle de líneas');
    console.log('📦 Inventario:   5 insumos con stock');
    console.log('📥📤 Movimientos: 8 (4 entradas + 4 salidas)');
    console.log('📋 Cotizaciones: 3 (1 aceptada, 1 enviada, 1 borrador)');
    console.log('🤝 Clientes:     3 actualizados con categoría y estado');
    console.log('🎯 Metas:        3 metas de negocio activas');
    console.log('');

  } catch (err) {
    await qr.rollbackTransaction();
    console.error('❌ Error en seed:', err);
    throw err;
  } finally {
    await qr.release();
    await AppDataSource.destroy();
  }
}

seed().catch(console.error);
