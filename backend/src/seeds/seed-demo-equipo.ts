/**
 * Seed: Owner con 2 productos y 2 trabajadores (uno por producto).
 *
 * Crea:
 *   - 1 dueño (account_role='owner', owner_id=null), plan business.
 *   - 2 productos (Producto A y Producto B) del dueño.
 *   - 2 trabajadores (account_role='trabajador', owner_id=dueño).
 *   - 2 asignaciones_trabajador: trabajador A -> Producto A, trabajador B -> Producto B.
 *
 * Ejecutar: npx ts-node src/seeds/seed-demo-equipo.ts
 */

import '../scripts/guardiaSeeds';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { randomUUID as uuidv4 } from 'crypto';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'bi0a100',
  synchronize: false,
  logging: false,
});

// Permisos que el dueño concede al trabajador para SU producto.
// Las capacidades sensibles (finanzas, nomina, contabilidad) quedan apagadas.
const PERMISOS_TRABAJADOR = {
  mercado: true,
  marketing: true,
  proveedores: true,
  brief: true,
  finanzas: false,
  pos: true,
  inventario: true,
  citas: true,
  clientes: true,
  cotizaciones: true,
  nomina: false,
  contabilidad: false,
};

async function seed() {
  await AppDataSource.initialize();
  console.log('✅ Conectado a la base de datos');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // ─── 1. Dueño (owner) ─────────────────────────────────────────────────────
    const ownerEmail = 'owner.demo@bi0a100.com';
    const ownerPasswordHash = await bcrypt.hash('Owner2024!', 12);

    await queryRunner.query(
      `INSERT INTO usuarios
         (id, email, password_hash, nombre, plan,
          owner_id, account_role, analisis_disponibles, creditos_marketing, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (email) DO NOTHING`,
      [
        uuidv4(),
        ownerEmail,
        ownerPasswordHash,
        'Dueño Demo',
        'business',     // business permite hasta 10 trabajadores
        null,           // owner_id = null -> es el dueño
        'owner',
        50,
        200,
        true,
      ]
    );

    const ownerRow = await queryRunner.query(
      `SELECT id FROM usuarios WHERE email = $1`,
      [ownerEmail]
    );
    const ownerId: string = ownerRow[0].id;
    console.log(`👤 Owner ID: ${ownerId}`);

    // ─── 2. Productos del dueño (A y B) ───────────────────────────────────────
    const productos = [
      {
        nombre: 'Producto A — Café de Especialidad',
        descripcion: 'Café de especialidad de origen único, tostado artesanal, molienda a pedido.',
        tipo: 'producto',
        categoria: 'Alimentos y Bebidas',
        precio_esperado: 320,
        pais: 'MX',
        canal_venta: 'mixto', // tienda física y e-commerce
        puv: 'Café trazable de pequeños productores con tueste fresco semanal.',
        cliente_ideal: 'Amantes del café de 25-45 años, NSE B/C+, urbanos',
        nse: 'B/C+',
        cobertura: 'Nacional',
        radio_km: null as number | null,
        inversion_inicial: 250000,
        costos_fijos: 45000,
        tamano_equipo: 4,
        status: 'activo',
      },
      {
        nombre: 'Producto B — Suscripción de Bienestar',
        descripcion: 'Membresía mensual con clases de yoga online, planes de nutrición y seguimiento personalizado.',
        tipo: 'servicio',
        categoria: 'Salud y Bienestar',
        precio_esperado: 499,
        pais: 'MX',
        canal_venta: 'online', // app móvil y web
        puv: 'Bienestar integral guiado por expertos, accesible desde casa.',
        cliente_ideal: 'Profesionistas de 28-50 años que buscan equilibrio y rutina saludable',
        nse: 'A/B',
        cobertura: 'Nacional',
        radio_km: null as number | null,
        inversion_inicial: 180000,
        costos_fijos: 30000,
        tamano_equipo: 3,
        status: 'activo',
      },
    ];

    const productoIds: string[] = [];
    for (const p of productos) {
      const productoId = uuidv4();
      await queryRunner.query(
        `INSERT INTO productos
           (id, usuario_id, nombre, descripcion, tipo_actividad, categoria,
            precio, pais, canal_venta, puv, cliente_ideal, nse,
            cobertura, radio_km, inversion_inicial, costos_fijos, tamano_equipo, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          productoId, ownerId, p.nombre, p.descripcion, p.tipo, p.categoria,
          p.precio_esperado, p.pais, p.canal_venta, p.puv, p.cliente_ideal, p.nse,
          p.cobertura, p.radio_km ?? null, p.inversion_inicial, p.costos_fijos,
          p.tamano_equipo, p.status,
        ]
      );
      productoIds.push(productoId);
      console.log(`  📦 Producto: ${p.nombre} (${productoId})`);
    }

    const [productoAId, productoBId] = productoIds;

    // ─── 3. Trabajadores (uno por producto) ───────────────────────────────────
    const trabajadores = [
      { email: 'trabajador.a@bi0a100.com', nombre: 'Trabajador A', productoId: productoAId },
      { email: 'trabajador.b@bi0a100.com', nombre: 'Trabajador B', productoId: productoBId },
    ];

    // Misma contraseña para ambos (sólo para pruebas).
    const trabajadorPasswordHash = await bcrypt.hash('Trabajador2024!', 12);

    for (const t of trabajadores) {
      await queryRunner.query(
        `INSERT INTO usuarios
           (id, email, password_hash, nombre, plan,
            owner_id, account_role, analisis_disponibles, creditos_marketing, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (email) DO NOTHING`,
        [
          uuidv4(),
          t.email,
          trabajadorPasswordHash,
          t.nombre,
          'business',        // hereda el contexto de la cuenta; el gate real usa la cuenta efectiva
          ownerId,           // apunta al dueño
          'trabajador',
          0,
          0,
          true,
        ]
      );

      const trabajadorRow = await queryRunner.query(
        `SELECT id FROM usuarios WHERE email = $1`,
        [t.email]
      );
      const trabajadorId: string = trabajadorRow[0].id;

      // Asignación trabajador -> producto (única por (trabajador_id, producto_id)).
      await queryRunner.query(
        `INSERT INTO asignaciones_trabajador
           (id, trabajador_id, cuenta_id, producto_id, permisos, activo)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (trabajador_id, producto_id) DO NOTHING`,
        [
          uuidv4(),
          trabajadorId,
          ownerId,
          t.productoId,
          JSON.stringify(PERMISOS_TRABAJADOR),
          true,
        ]
      );

      console.log(`  🧑‍💼 ${t.nombre} (${trabajadorId}) -> producto ${t.productoId}`);
    }

    await queryRunner.commitTransaction();
    console.log('\n🎉 Seed de equipo completado exitosamente');
    console.log('─────────────────────────────────────');
    console.log('👤 Owner:        owner.demo@bi0a100.com / Owner2024!  (plan business)');
    console.log('🧑‍💼 Trabajador A: trabajador.a@bi0a100.com / Trabajador2024!  -> Producto A');
    console.log('🧑‍💼 Trabajador B: trabajador.b@bi0a100.com / Trabajador2024!  -> Producto B');
    console.log('🔒 Permisos:     finanzas/nomina/contabilidad OFF; resto ON');
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Error en seed:', err);
    throw err;
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

// Código de salida 1 si falla: antes el error se imprimía pero el proceso salía con 0.
seed().catch((err) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});