/**
 * Seed completo de prueba: Usuario Business con negocio activo y 4 semanas de uso.
 * Incluye:
 *  - Usuario (carlos.mendoza@business.com / Business2024!) con plan 'business'
 *  - Negocio ("Café DeLaFinca") + Producto ("Café de Especialidad 1kg")
 *  - Todos los análisis completados: Mercado, Marketing, Proveedores, Finanzas, Legal
 *  - Clientes / Proveedores registrados
 *  - 4 Semanas de movimientos contables reales (ingresos por ventas, egresos por insumos, renta, nómina, servicios)
 *  - Historial de Ventas POS asociadas a los movimientos contables
 *
 * Ejecutar: npx ts-node src/seeds/seed-full-4weeks-demo.ts
 */

import '../scripts/guardiaSeeds';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { generarProyeccion } from '../services/finanzas/proyeccionService';
import { calcularBreakeven } from '../services/finanzas/breakevenService';
import { generarResumen } from '../services/finanzas/resumenService';
import type { FinanzasInput } from '../services/finanzas/types';

async function seedFull4Weeks() {
  await AppDataSource.initialize();
  console.log('✅ Conectado a PostgreSQL');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const userEmail = 'carlos.mendoza@business.com';
    const rawPass = 'Business2024!';
    const passwordHash = await bcrypt.hash(rawPass, 12);
    const userId = uuidv4();

    // 1. Crear / Asegurar Usuario
    await queryRunner.query(
      `INSERT INTO usuarios (id, email, password_hash, nombre, plan, es_admin, account_role, analisis_disponibles, creditos_marketing, activo)
       VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9)
       ON CONFLICT (email) DO UPDATE SET password_hash = $3, nombre = $4, plan = $5`,
      [userId, userEmail, passwordHash, 'Carlos Mendoza', 'business', 'owner', 50, 500, true]
    );

    const userRow = await queryRunner.query(`SELECT id FROM usuarios WHERE email = $1`, [userEmail]);
    const realUserId: string = userRow[0].id;
    console.log(`👤 Usuario registrado: ${userEmail} (${realUserId})`);

    // 2. Crear Negocio
    const negocioId = uuidv4();
    await queryRunner.query(
      `INSERT INTO negocios (id, usuario_id, nombre, emoji, descripcion)
       VALUES ($1, $2, 'Café DeLaFinca', '☕', 'Tostaduría y cafetería de especialidad artesanal')`,
      [negocioId, realUserId]
    );
    console.log(`📁 Negocio creado: Café DeLaFinca`);

    // 3. Crear Producto Principal
    const productoId = uuidv4();
    await queryRunner.query(
      `INSERT INTO productos (
        id, usuario_id, negocio_id, nombre, descripcion, categoria,
        precio, stock, pais, nse, status, fecha_creacion
       ) VALUES (
        $1, $2, $3, 'Café de Especialidad 1kg',
        'Grano entero o molido, tueste medio de origen Chiapas y Oaxaca. Notas a chocolate y avellana.',
        'Alimentos y Bebidas',
        380.00, 100, 'MX', 'B/C+/A', 'activo', NOW()
       )`,
      [productoId, realUserId, negocioId]
    );
    console.log(`📦 Producto creado: Café de Especialidad 1kg`);

    const now = new Date();
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    // 4. Crear Análisis (Mercado, Marketing, Finanzas, Legal, Brief)
    // 4.1 Análisis Mercado
    await queryRunner.query(
      `INSERT INTO analisis_mercado (
        id, producto_id, usuario_id, pais, scope, viabilidad_score, viabilidad_estado,
        volumen_busquedas_mensual, tendencia_porcentaje, total_competidores,
        tendencias_data, competencia_data, dafo_data, tam_data, alertas, estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, 'MX', 'nacional', 92, 'Alta Viabilidad', 18500, 14.50, 8, $4, $5, $6, $7, $8, 'completado', $9)`,
      [
        uuidv4(), productoId, realUserId,
        JSON.stringify({ interes_busqueda: 'Creciente', palabras_clave: ['cafe especialidad', 'grano tostado artesanal', 'cafe organico mexico'] }),
        JSON.stringify({ competidores_principales: [{ nombre: 'Café Bola de Oro', cuota: '20%' }, { nombre: 'Punta del Cielo', cuota: '15%' }] }),
        JSON.stringify({ fortalezas: ['Origen directo', 'Tueste fresco'], oportunidades: ['Venta B2B a restaurantes', 'Suscripción mensual'] }),
        JSON.stringify({ tam: 120000000, sam: 35000000, som: 4500000 }),
        JSON.stringify([{ nivel: 'verde', titulo: 'Oportunidad de Mercado', descripcion: 'Demanda de café de especialidad crece 14% anual.' }]),
        fourWeeksAgo
      ]
    );

    // 4.2 Análisis Marketing
    await queryRunner.query(
      `INSERT INTO analisis_marketing (
        id, producto_id, usuario_id, voz_marca, presupuesto_mensual, meta_campana,
        estrategias_data, copies_data, calendario_data, estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, 'Cálida, experta y sustentable', 15000, 'Captación de 200 nuevos clientes en 30 días', $4, $5, $6, 'completado', $7)`,
      [
        uuidv4(), productoId, realUserId,
        JSON.stringify({ canales: ['Instagram Ads', 'Google Search', 'Mkt por correo'], presupuesto_desglose: { meta: 8000, google: 5000, email: 2000 } }),
        JSON.stringify({ ad1: '¿Cansado del café comercial quemado? Prueba frescura directa del campo.', ad2: 'Tu mañana merece un café de 86 puntos en taza.' }),
        JSON.stringify({ semana1: 'Lanzamiento de campaña visual en Instagram', semana2: 'Email retargeting con descuento de primer pedido' }),
        fourWeeksAgo
      ]
    );

    // 4.3 Análisis Finanzas
    // Los payloads se generan con los MISMOS servicios puros que usa
    // finanzasOrchestrator, de modo que la forma del jsonb (meses/totales,
    // escenarios, viabilidad…) coincide exactamente con lo que consume el
    // frontend. Escribir el JSON a mano aquí ya provocó una página en blanco
    // por falta de `proyeccion_data.totales`.
    const finanzasInput: FinanzasInput = {
      productoId,
      usuarioId: realUserId,
      precio_venta: 380,
      costo_variable_unitario: 140,
      costos_fijos_mensuales: 45000,
      unidades_mes_inicial: 300,
      tasa_crecimiento_mensual: 15, // porcentaje: 15 = 15% mensual
    };
    const finanzasProyeccion = generarProyeccion(finanzasInput);
    const finanzasBreakeven = calcularBreakeven(finanzasInput, finanzasProyeccion.meses);
    const finanzasResumen = generarResumen(finanzasInput, finanzasProyeccion, finanzasBreakeven);

    await queryRunner.query(
      `INSERT INTO analisis_finanzas (
        id, producto_id, usuario_id, pais, inputs_data, proyeccion_data, breakeven_data, resumen_data, estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, 'MX', $4, $5, $6, $7, 'completado', $8)`,
      [
        uuidv4(), productoId, realUserId,
        JSON.stringify({
          precio_venta: finanzasInput.precio_venta,
          costo_variable_unitario: finanzasInput.costo_variable_unitario,
          costos_fijos_mensuales: finanzasInput.costos_fijos_mensuales,
          unidades_mes_inicial: finanzasInput.unidades_mes_inicial,
          tasa_crecimiento_mensual: finanzasInput.tasa_crecimiento_mensual,
        }),
        JSON.stringify(finanzasProyeccion),
        JSON.stringify(finanzasBreakeven),
        JSON.stringify(finanzasResumen),
        fourWeeksAgo
      ]
    );

    // 4.4 Análisis Ventas
    await queryRunner.query(
      `INSERT INTO analisis_ventas (
        id, producto_id, usuario_id, pais, tipo_venta, canal_principal, ticket_promedio,
        nombre_producto, categoria, precio, tips_data, historia_data, perfil_cliente_data,
        estado_analisis, fecha_creacion, fecha_completado
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completado', $14, $14)`,
      [
        uuidv4(), productoId, realUserId, 'MX', 'B2C_directo', 'tienda-online', 380,
        'Café de Especialidad', 'Alimentos', 380,
        JSON.stringify({
          score_ventas: 7.9,
          canales_prioritarios: [
            { nombre: 'Tienda online propia', margen_estimado: 0.42, ticket_promedio: 380 },
            { nombre: 'Cafeterías de especialidad', margen_estimado: 0.28, ticket_promedio: 2400 },
            { nombre: 'Mercados locales', margen_estimado: 0.35, ticket_promedio: 290 }
          ],
          mejor_opcion: 'Tienda online propia — mejor margen y control de marca',
          acciones: ['Abrir suscripción mensual de grano', 'Cerrar 3 cafeterías piloto en Oaxaca']
        }),
        JSON.stringify({
          historia: 'Ventas directas a través de canales digitales y cafeterías aliadas.',
          lecciones: ['Priorizar margen directo frente a intermediarios']
        }),
        JSON.stringify({
          icp: 'Consumidores de café de especialidad y baristas en México'
        }),
        fourWeeksAgo
      ]
    );

    // 4.5 Análisis Brief
    await queryRunner.query(
      `INSERT INTO analisis_brief (
        id, producto_id, usuario_id, percepcion, emocion, anti_valores, estilo_visual, paleta_elegida, tipo_logo, simbolo_representativo, resultado_cliente, tono_comunicacion, posicionamiento, nivel_diferenciacion, estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, $4, 'Paz y vitalidad', $5, 'Artesanal Moderno', 'A', 'Isotipo + Tipografía', 'Grano de café minimalista y hojas', 'Disfrutar de un café gourmet de especialidad en casa sin complicaciones', 'Humano y educador', 'El café premium más accesible para amantes del buen grano', 'Alto - Trazabilidad total de finca a taza', 'completado', $6)`,
      [
        uuidv4(), productoId, realUserId,
        JSON.stringify(['Auténtico', 'Premium']),
        JSON.stringify(['Industrial', 'Barato']),
        fourWeeksAgo
      ]
    );

    // 4.6 Análisis Legal
    await queryRunner.query(
      `INSERT INTO analisis_legal (
        id, producto_id, usuario_id, pais, forma_juridica, tiene_empleados, vende_en_linea, exporta_importa, giro_detectado, cumplimiento_global, puntaje_cumplimiento, resultado_data, estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, 'MX', 'Persona Física con Actividad Empresarial', true, true, false, 'Alimentos y Bebidas - Tostaduría', 'verde', 95, $4, 'completado', $5)`,
      [
        uuidv4(), productoId, realUserId,
        JSON.stringify({
          resumen_ejecutivo: 'El negocio cuenta con aviso de funcionamiento COFEPRIS y etiquetado NOM-051 al día.',
          permisos: ['Aviso COFEPRIS', 'Registro IMPI Marca', 'Licencia de Funcionamiento'],
          checklist: [{ texto: 'Revisar fechas de caducidad en empaque NOM-051', completado: true }]
        }),
        fourWeeksAgo
      ]
    );

    console.log(`📊 6 Análisis completados correctamente.`);

    // 5. Clientes y Proveedores
    const cliente1Id = uuidv4();
    const cliente2Id = uuidv4();
    const prov1Id = uuidv4();

    await queryRunner.query(
      `INSERT INTO clientes (id, usuario_id, negocio_id, producto_id, nombre, empresa, email, telefono, tipo_contacto, categoria, estado) VALUES
       ($1, $2, $3, $4, 'Restaurante Gourmet Bistro', 'Bistro MX', 'compras@bistromx.com', '525599887766', 'cliente', 'B2B Recurrente', 'cliente'),
       ($5, $2, $3, $4, 'Sofía Ramírez', NULL, 'sofia.ramirez@gmail.com', '525544332211', 'cliente', 'Consumidor Final', 'cliente'),
       ($6, $2, $3, $4, 'Cooperativa Agrícola Chiapas', 'Finca El Triunfo', 'contacto@fincatriunfo.org', '529611234567', 'proveedor', 'Materia Prima', 'cliente')`,
      [cliente1Id, realUserId, negocioId, productoId, cliente2Id, prov1Id]
    );

    // 6. Simulación de 4 semanas de Movimientos Contables y Ventas
    console.log(`🗓️ Generando 4 semanas de movimientos contables y ventas POS...`);

    const categoriasIngreso = ['Ventas POS', 'Ventas E-commerce', 'Ventas B2B'];
    const categoriasEgreso = ['Materia Prima', 'Empaques', 'Renta', 'Nómina', 'Servicios (Luz/Gas)', 'Marketing Ads'];

    // Movimientos fijos de las 4 semanas
    // Semana 1: Hace 28 días a 21 días
    // Semana 2: Hace 20 días a 14 días
    // Semana 3: Hace 13 días a 7 días
    // Semana 4: Hace 6 días a hoy

    let numVenta = 101;
    let totalIngresos = 0;
    let totalEgresos = 0;

    for (let semana = 1; semana <= 4; semana++) {
      const diasAtrasInicio = 28 - (semana - 1) * 7;
      
      // Gastos fijos semanales / mensuales
      const fechaSemana = new Date(now.getTime() - diasAtrasInicio * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Gasto 1: Materia prima verde (semanas 1 y 3)
      if (semana === 1 || semana === 3) {
        const montoCompra = 18500.00;
        await queryRunner.query(
          `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
           VALUES ($1, $2, $3, 'egreso', 'Compra de 200kg café verde pergamino', 'Materia Prima', $4, $5, 'manual')`,
          [uuidv4(), realUserId, productoId, montoCompra, fechaSemana]
        );
        totalEgresos += montoCompra;
      }

      // Gasto 2: Nómina semanal
      const montoNomina = 6500.00;
      await queryRunner.query(
        `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
         VALUES ($1, $2, $3, 'egreso', 'Pago de nómina semanal barista y tostador', 'Nómina', $4, $5, 'nomina')`,
        [uuidv4(), realUserId, productoId, montoNomina, fechaSemana]
      );
      totalEgresos += montoNomina;

      // Gasto 3: Renta y Servicios (Semana 1)
      if (semana === 1) {
        await queryRunner.query(
          `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
           VALUES ($1, $2, $3, 'egreso', 'Renta mensual local comercial Polanco', 'Renta', 15000.00, $4, 'manual')`,
          [uuidv4(), realUserId, productoId, fechaSemana]
        );
        await queryRunner.query(
          `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
           VALUES ($1, $2, $3, 'egreso', 'Servicios de luz comercial y gas tueste', 'Servicios (Luz/Gas)', 3200.00, $4, 'manual')`,
          [uuidv4(), realUserId, productoId, fechaSemana]
        );
        totalEgresos += 18200.00;
      }

      // Gasto 4: Ads Marketing semanal
      await queryRunner.query(
        `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
         VALUES ($1, $2, $3, 'egreso', 'Campaña Meta Ads & Google Ads semana ${semana}', 'Marketing Ads', 3500.00, $4, 'manual')`,
        [uuidv4(), realUserId, productoId, fechaSemana]
      );
      totalEgresos += 3500.00;

      // Ventas diarias de la semana (5 días por semana)
      for (let d = 0; d < 5; d++) {
        const diaExacto = new Date(now.getTime() - (diasAtrasInicio - d) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Ventas POS del día
        const cantKg = Math.floor(Math.random() * 5) + 3; // 3 a 7 bolsas por día
        const subtotal = cantKg * 327.59;
        const iva = subtotal * 0.16;
        const totalVenta = subtotal + iva;

        const movId = uuidv4();
        const ventaId = uuidv4();
        const ticket = `POS-${numVenta++}`;

        // Movimiento de ingreso
        await queryRunner.query(
          `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente, referencia_tipo, referencia_id)
           VALUES ($1, $2, $3, 'ingreso', $4, 'Ventas POS', $5, $6, 'pos', 'venta', $7)`,
          [movId, realUserId, productoId, `Venta en mostrador Ticket #${ticket}`, totalVenta.toFixed(2), diaExacto, ventaId]
        );

        // Registro de Venta POS
        await queryRunner.query(
          `INSERT INTO ventas (id, usuario_id, producto_id, negocio_id, numero_ticket, fecha, subtotal, impuesto_monto, impuesto_tasa, impuesto_nombre, moneda, total, metodo_pago, cliente_nombre, estado, movimiento_contable_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.16, 'IVA', 'MXN', $9, 'tarjeta', 'Cliente Mostrador', 'completada', $10)`,
          [ventaId, realUserId, productoId, negocioId, ticket, diaExacto, subtotal.toFixed(2), iva.toFixed(2), totalVenta.toFixed(2), movId]
        );

        totalIngresos += totalVenta;
      }

      // Venta B2B mayoreo (1 por semana)
      const montoB2B = 15200.00;
      const movB2BId = uuidv4();
      await queryRunner.query(
        `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
         VALUES ($1, $2, $3, 'ingreso', 'Pedido mayoreo Restaurante Bistro MX (40kg)', 'Ventas B2B', $4, $5, 'manual')`,
        [movB2BId, realUserId, productoId, montoB2B, fechaSemana]
      );
      totalIngresos += montoB2B;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SEGUNDO NEGOCIO: Agencia PixelPerfect (marketing digital / SaaS)
    // ─────────────────────────────────────────────────────────────────────────

    // N1. Negocio
    const mktNegocioId = uuidv4();
    await queryRunner.query(
      `INSERT INTO negocios (id, usuario_id, nombre, emoji, descripcion)
       VALUES ($1, $2, $3, $4, $5)`,
      [mktNegocioId, realUserId, 'Agencia PixelPerfect', '📈',
       'Agencia boutique de marketing digital especializada en e‑commerce y lanzamientos.']
    );

    // N2. Producto (SSOT del segundo negocio)
    // Usa exactamente las columnas reales de `productos` (mismas que el primer negocio).
    const mktProductoId = uuidv4();
    await queryRunner.query(
      `INSERT INTO productos (
        id, usuario_id, negocio_id, nombre, descripcion, categoria,
        precio, stock, pais, nse, status, fecha_creacion
       ) VALUES (
        $1, $2, $3, 'PixelROI — Panel de marketing para e‑commerce',
        'SaaS que centraliza datos de campañas, ROAS y embudos para tiendas en línea.',
        'Software / SaaS',
        390.00, 50, 'MX', 'C+/B/A', 'activo', NOW()
       )`,
      [mktProductoId, realUserId, mktNegocioId]
    );

    // N3. Análisis Finanzas (mismos servicios puros que el primer negocio)
    const mktFinanzasInput: FinanzasInput = {
      productoId: mktProductoId,
      usuarioId: realUserId,
      precio_venta: 390,
      costo_variable_unitario: 90,
      costos_fijos_mensuales: 60000,
      unidades_mes_inicial: 15,
      tasa_crecimiento_mensual: 12,
    };
    const mktProyeccion  = generarProyeccion(mktFinanzasInput);
    const mktBreakeven   = calcularBreakeven(mktFinanzasInput, mktProyeccion.meses);
    const mktResumen     = generarResumen(mktFinanzasInput, mktProyeccion, mktBreakeven);

    await queryRunner.query(
      `INSERT INTO analisis_finanzas (
         id, producto_id, usuario_id, pais, inputs_data,
         proyeccion_data, breakeven_data, resumen_data,
         estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, 'MX', $4, $5, $6, $7, 'completado', $8)`,
      [
        uuidv4(), mktProductoId, realUserId,
        JSON.stringify({
          precio_venta:              mktFinanzasInput.precio_venta,
          costo_variable_unitario:   mktFinanzasInput.costo_variable_unitario,
          costos_fijos_mensuales:    mktFinanzasInput.costos_fijos_mensuales,
          unidades_mes_inicial:      mktFinanzasInput.unidades_mes_inicial,
          tasa_crecimiento_mensual:  mktFinanzasInput.tasa_crecimiento_mensual,
        }),
        JSON.stringify(mktProyeccion),
        JSON.stringify(mktBreakeven),
        JSON.stringify(mktResumen),
        fourWeeksAgo,
      ]
    );

    // N3.b Resto de análisis del segundo negocio (Mercado, Marketing, Proveedores, Legal)
    // Mismas columnas que los análisis del primer negocio.

    // Mercado
    await queryRunner.query(
      `INSERT INTO analisis_mercado (
        id, producto_id, usuario_id, pais, scope, viabilidad_score, viabilidad_estado,
        volumen_busquedas_mensual, tendencia_porcentaje, total_competidores,
        tendencias_data, competencia_data, dafo_data, tam_data, alertas, estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, 'MX', 'nacional', 87, 'Alta Viabilidad', 9200, 22.30, 6, $4, $5, $6, $7, $8, 'completado', $9)`,
      [
        uuidv4(), mktProductoId, realUserId,
        JSON.stringify({
          interes_busqueda: 'Creciente',
          palabras_clave: ['dashboard marketing ecommerce', 'medir roas', 'atribucion multicanal', 'analitica de campañas'],
        }),
        JSON.stringify({
          competidores_principales: [
            { nombre: 'Triple Whale', cuota: '18%' },
            { nombre: 'Northbeam', cuota: '12%' },
            { nombre: 'Looker Studio (gratuito)', cuota: '30%' },
          ],
        }),
        JSON.stringify({
          fortalezas: ['Onboarding asistido en español', 'Precio accesible para pymes'],
          debilidades: ['Marca nueva sin reputación', 'Dependencia de APIs de terceros'],
          oportunidades: ['Pymes de e‑commerce LATAM sin analítica', 'Venta cruzada con servicios de agencia'],
          amenazas: ['Cambios en las APIs de plataformas de ads', 'Herramientas gratuitas “suficientemente buenas”'],
        }),
        JSON.stringify({ tam: 85000000, sam: 22000000, som: 2600000 }),
        JSON.stringify([
          { nivel: 'verde', titulo: 'Demanda creciente', descripcion: 'La búsqueda de herramientas de atribución crece 22% anual en LATAM.' },
          { nivel: 'amarillo', titulo: 'Competencia con opciones gratuitas', descripcion: 'Hay que justificar el precio frente a dashboards gratuitos.' },
        ]),
        fourWeeksAgo,
      ]
    );

    // Marketing
    await queryRunner.query(
      `INSERT INTO analisis_marketing (
        id, producto_id, usuario_id, voz_marca, presupuesto_mensual, meta_campana,
        estrategias_data, copies_data, calendario_data, estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, 'Analítica, directa y cercana', 25000, 'Generar 40 demos calificadas al mes', $4, $5, $6, 'completado', $7)`,
      [
        uuidv4(), mktProductoId, realUserId,
        JSON.stringify({
          canales: ['LinkedIn Ads', 'Google Search', 'Contenido SEO', 'Mkt por correo'],
          presupuesto_desglose: { linkedin: 10000, google: 8000, contenido: 5000, email: 2000 },
        }),
        JSON.stringify({
          ad1: 'Inviertes en anuncios cada mes… ¿sabes cuál campaña te deja utilidad?',
          ad2: 'ROAS real, por campaña y por producto. Sin hojas de cálculo.',
          ad3: 'Conecta tus campañas y ve tu embudo completo en 10 minutos.',
        }),
        JSON.stringify({
          semana1: 'Lanzamiento de campaña LinkedIn + landing de demo',
          semana2: 'Publicación de caso de éxito y retargeting',
          semana3: 'Webinar “Cómo leer tu ROAS sin engañarte”',
          semana4: 'Secuencia de correo a leads del webinar con prueba gratis',
        }),
        fourWeeksAgo,
      ]
    );

    // Ventas
    await queryRunner.query(
      `INSERT INTO analisis_ventas (
        id, producto_id, usuario_id, pais, tipo_venta, canal_principal, ticket_promedio,
        nombre_producto, categoria, precio, tips_data, historia_data, perfil_cliente_data,
        estado_analisis, fecha_creacion, fecha_completado
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completado', $14, $14)`,
      [
        uuidv4(), mktProductoId, realUserId, 'MX', 'B2B_directo', 'online', 390,
        'PixelROI — Panel de marketing para e‑commerce', 'Software / SaaS', 390,
        JSON.stringify({
          score_ventas: 8.4,
          canales_prioritarios: [
            { nombre: 'Inbound / SEO & Contenido', margen_estimado: 0.75, ticket_promedio: 390 },
            { nombre: 'Outbound LinkedIn', margen_estimado: 0.65, ticket_promedio: 390 },
          ],
          recomendacion: 'Impulsar demostraciones guiadas y prueba gratuita de 14 días.',
        }),
        JSON.stringify({
          historia: 'Captación de clientes e-commerce mediante pruebas gratuitas.',
          lecciones: ['Reducir el tiempo de activación en onboarding']
        }),
        JSON.stringify({
          icp: 'Dueños de tiendas Shopify y WooCommerce en México'
        }),
        fourWeeksAgo,
      ]
    );

    // Brief
    await queryRunner.query(
      `INSERT INTO analisis_brief (
        id, producto_id, usuario_id, percepcion, emocion, anti_valores, estilo_visual, paleta_elegida, tipo_logo, simbolo_representativo, resultado_cliente, tono_comunicacion, posicionamiento, nivel_diferenciacion, estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, $4, 'Confianza y control', $5, 'Tech Minimalista', 'B', 'Isotipo + Tipografía', 'Píxel que se transforma en gráfica ascendente', 'Saber con certeza qué campaña genera utilidad y cuál está quemando presupuesto', 'Directo y basado en datos', 'El panel de analítica de marketing más claro para e‑commerce en LATAM', 'Alto - Atribución multicanal explicada en lenguaje de negocio', 'completado', $6)`,
      [
        uuidv4(), mktProductoId, realUserId,
        JSON.stringify(['Confiable', 'Preciso', 'Accesible']),
        JSON.stringify(['Humo', 'Métricas de vanidad', 'Complejidad innecesaria']),
        fourWeeksAgo,
      ]
    );

    // Legal
    await queryRunner.query(
      `INSERT INTO analisis_legal (
        id, producto_id, usuario_id, pais, forma_juridica, tiene_empleados, vende_en_linea, exporta_importa, giro_detectado, cumplimiento_global, puntaje_cumplimiento, resultado_data, estado_analisis, fecha_completado
       ) VALUES ($1, $2, $3, 'MX', 'Sociedad por Acciones Simplificada (SAS)', true, true, false, 'Servicios de tecnología - SaaS B2B', 'amarillo', 82, $4, 'completado', $5)`,
      [
        uuidv4(), mktProductoId, realUserId,
        JSON.stringify({
          resumen_ejecutivo: 'Cumplimiento correcto en materia fiscal y contractual. Pendiente el aviso de privacidad completo y el registro de la marca ante el IMPI.',
          permisos: ['Alta en SAT con actividad de servicios digitales', 'Contrato de términos y condiciones del servicio', 'Aviso de privacidad LFPDPPP'],
          riesgos: [
            { titulo: 'Tratamiento de datos de campañas de clientes', nivel: 'medio', descripcion: 'Requiere convenio de encargado de datos personales con cada cliente.' },
          ],
          checklist: [
            { texto: 'Publicar aviso de privacidad integral en el sitio', completado: false },
            { texto: 'Registrar la marca PixelROI ante el IMPI', completado: false },
            { texto: 'Firmar contrato de prestación de servicios con cada cliente', completado: true },
          ],
        }),
        fourWeeksAgo,
      ]
    );

    console.log('📊 6 Análisis completados para PixelROI (segundo negocio).');

    // N4. Catálogo POS (2 servicios empaquetados)
    const mktItemSetupId = uuidv4();
    await queryRunner.query(
      `INSERT INTO items_pos (id, usuario_id, negocio_id, nombre, descripcion, precio, categoria, emoji, activo, orden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)`,
      [mktItemSetupId, realUserId, mktNegocioId,
       'Setup de tracking avanzado',
       'Implementación de píxeles, conversion API y eventos para campañas pagadas.',
       9500, 'Servicios', '🎯', 1]
    );

    const mktItemSuscId = uuidv4();
    await queryRunner.query(
      `INSERT INTO items_pos (id, usuario_id, negocio_id, nombre, descripcion, precio, categoria, emoji, activo, orden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)`,
      [mktItemSuscId, realUserId, mktNegocioId,
       'Consultoría mensual PixelROI',
       'Sesiones mensuales para revisar campañas, funnel y experimentos.',
       390, 'Suscripción', '💡', 2]
    );

    // N5. Clientes y proveedor del segundo negocio
    const mktClienteId   = uuidv4();
    const mktProveedorId = uuidv4();
    await queryRunner.query(
      `INSERT INTO clientes
         (id, usuario_id, negocio_id, producto_id, nombre, empresa, email, telefono, tipo_contacto, categoria, estado)
       VALUES
         ($1, $2, $3, $4, 'Tienda Aurora', 'Tienda Aurora S.A. de C.V.', 'contacto@tiendaaurora.com', '525512341234', 'cliente', 'VIP', 'cliente'),
         ($5, $2, $3, $4, 'Suite AdsManager Pro', 'Suite AdsManager Pro', 'soporte@adsmanagerpro.com', NULL, 'proveedor', 'Herramientas', 'cliente')`,
      [mktClienteId, realUserId, mktNegocioId, mktProductoId, mktProveedorId]
    );

    // N6. Insumo de inventario (licencias/seats del SaaS)
    const mktInsumoId = uuidv4();
    await queryRunner.query(
      `INSERT INTO insumos_inventario
         (id, usuario_id, negocio_id, nombre, categoria, unidad, stock_actual, stock_minimo, costo_promedio, proveedor_default, emoji, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)`,
      [mktInsumoId, realUserId, mktNegocioId,
       'Licencias PixelROI', 'Software', 'pieza',
       40, 10, 90, 'Suite AdsManager Pro', '🧾']
    );

    // N7. Movimientos contables + ventas POS (4 semanas, misma estructura que el primer negocio)
    let mktNumVenta = 201;
    for (let semana = 1; semana <= 4; semana++) {
      const diasAtrasInicio = 28 - (semana - 1) * 7;
      const fechaSemana = new Date(now.getTime() - diasAtrasInicio * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      // Egreso fijo: nómina semanal de la agencia
      await queryRunner.query(
        `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
         VALUES ($1, $2, $3, 'egreso', 'Nómina semanal agencia PixelPerfect', 'Nómina', 15000.00, $4, 'nomina')`,
        [uuidv4(), realUserId, mktProductoId, fechaSemana]
      );

      // Egreso fijo semana 1: herramientas SaaS + renta coworking
      if (semana === 1) {
        await queryRunner.query(
          `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
           VALUES ($1, $2, $3, 'egreso', 'Suscripciones de herramientas SaaS mensuales', 'Servicios (Luz/Gas)', 8500.00, $4, 'manual')`,
          [uuidv4(), realUserId, mktProductoId, fechaSemana]
        );
        await queryRunner.query(
          `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
           VALUES ($1, $2, $3, 'egreso', 'Renta coworking mensual', 'Renta', 12000.00, $4, 'manual')`,
          [uuidv4(), realUserId, mktProductoId, fechaSemana]
        );
      }

      // Egreso: Meta Ads semanal
      await queryRunner.query(
        `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
         VALUES ($1, $2, $3, 'egreso', 'Campaña Meta Ads & Google Ads semana ${semana}', 'Marketing Ads', 4500.00, $4, 'manual')`,
        [uuidv4(), realUserId, mktProductoId, fechaSemana]
      );

      // Ventas diarias (5 días por semana) — suscripciones y setups
      for (let d = 0; d < 5; d++) {
        const diaExacto = new Date(now.getTime() - (diasAtrasInicio - d) * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0];

        const cantSusc = Math.floor(Math.random() * 3) + 1; // 1–3 suscripciones/día
        const subtotal = cantSusc * 390;
        const iva      = subtotal * 0.16;
        const totalVenta = subtotal + iva;

        const mktMovId   = uuidv4();
        const mktVentaId = uuidv4();
        const mktTicket  = `POS-${mktNumVenta++}`;

        await queryRunner.query(
          `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente, referencia_tipo, referencia_id)
           VALUES ($1, $2, $3, 'ingreso', $4, 'Ventas POS', $5, $6, 'pos', 'venta', $7)`,
          [mktMovId, realUserId, mktProductoId,
           `Suscripción PixelROI Ticket #${mktTicket}`,
           totalVenta.toFixed(2), diaExacto, mktVentaId]
        );

        await queryRunner.query(
          `INSERT INTO ventas (id, usuario_id, producto_id, negocio_id, numero_ticket, fecha, subtotal, impuesto_monto, impuesto_tasa, impuesto_nombre, moneda, total, metodo_pago, cliente_nombre, estado, movimiento_contable_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0.16, 'IVA', 'MXN', $9, 'transferencia', 'Cliente Suscripción', 'completada', $10)`,
          [mktVentaId, realUserId, mktProductoId, mktNegocioId,
           mktTicket, diaExacto,
           subtotal.toFixed(2), iva.toFixed(2), totalVenta.toFixed(2), mktMovId]
        );
      }

      // Ingreso B2B: proyecto de setup por semana
      await queryRunner.query(
        `INSERT INTO movimientos_contables (id, usuario_id, producto_id, tipo, descripcion, categoria, monto, fecha, fuente)
         VALUES ($1, $2, $3, 'ingreso', 'Proyecto setup tracking — cliente e‑commerce', 'Ventas B2B', 9500.00, $4, 'manual')`,
        [uuidv4(), realUserId, mktProductoId, fechaSemana]
      );
    }

    console.log('✅ Segundo negocio (Agencia PixelPerfect + PixelROI) creado con 4 semanas de movimientos.');

    // ─────────────────────────────────────────────────────────────────────────

    await queryRunner.commitTransaction();

    console.log('\n🎉 ¡SEED EXITOSO DE 4 SEMANAS!');
    console.log('──────────────────────────────────────────────────────');
    console.log(`👤 Usuario:        ${userEmail}`);
    console.log(`🔑 Contraseña:     ${rawPass}`);
    console.log(`💼 Plan:           Business`);
    console.log(`☕ Negocio:        Café DeLaFinca`);
    console.log(`📦 Producto:       Café de Especialidad 1kg`);
    console.log(`✅ Análisis:       5 Completados (Mercado, Marketing, Finanzas, Proveedores, Legal)`);
    console.log(`📈 Ingresos 4 sem: $${totalIngresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`);
    console.log(`📉 Egresos 4 sem:  $${totalEgresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`);
    console.log(`💰 Balance Neto:   $${(totalIngresos - totalEgresos).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`);
    console.log('──────────────────────────────────────────────────────');

  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Error ejecutando seed:', err);
    throw err;
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

seedFull4Weeks().catch(console.error);
