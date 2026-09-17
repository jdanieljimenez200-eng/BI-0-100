/**
 * Seed: Usuario Business con 3 Negocios y 9 Productos
 * Ejecutar: npx ts-node src/seeds/seed-demo-business.ts
 */

import '../scripts/guardiaSeeds';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

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

async function seed() {
  await AppDataSource.initialize();
  console.log('✅ Conectado a la base de datos');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // ─── 1. Crear usuario ────────────────────────────────────────────────────
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash('Business2024!', 12);

    await queryRunner.query(
      `INSERT INTO usuarios
         (id, email, password_hash, nombre, plan, role,
          analisis_disponibles, creditos_marketing, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (email) DO NOTHING`,
      [
        userId,
        'carlos.mendoza@business.com',
        passwordHash,
        'Carlos Mendoza',
        'business',
        'user',
        50,
        200,
        true,
      ]
    );

    // Obtener el id real (por si ya existía)
    const userRow = await queryRunner.query(
      `SELECT id FROM usuarios WHERE email = $1`,
      ['carlos.mendoza@business.com']
    );
    const realUserId: string = userRow[0].id;
    console.log(`👤 Usuario ID: ${realUserId}`);

    // ─── 2. Negocios (carpetas) ──────────────────────────────────────────────
    const negocioAutos = uuidv4();
    const negocioResto = uuidv4();
    const negocioRopa  = uuidv4();

    await queryRunner.query(
      `INSERT INTO negocios (id, usuario_id, nombre, emoji, descripcion) VALUES
         ($1, $2, 'AutoElite MX',   '🚗', 'Agencia de autos de lujo y usados certificados en CDMX'),
         ($3, $2, 'La Hacienda',    '🍽️', 'Restaurante de cocina mexicana gourmet en Polanco'),
         ($4, $2, 'Moda Urbana',    '👗', 'Boutique de ropa urbana y streetwear para jóvenes')
       ON CONFLICT DO NOTHING`,
      [negocioAutos, realUserId, negocioResto, negocioRopa]
    );

    // Obtener ids reales de negocios por nombre
    const negocios = await queryRunner.query(
      `SELECT id, nombre FROM negocios WHERE usuario_id = $1`,
      [realUserId]
    );
    const negMap: Record<string, string> = {};
    for (const n of negocios) negMap[n.nombre] = n.id;

    const autoId  = negMap['AutoElite MX'];
    const restoId = negMap['La Hacienda'];
    const ropaId  = negMap['Moda Urbana'];

    console.log(`📁 Negocios: Autos(${autoId}) | Resto(${restoId}) | Ropa(${ropaId})`);

    // ─── 3. Productos ────────────────────────────────────────────────────────
    const productos = [
      // ── AUTOS ────────────────────────────────────────────
      {
        id: uuidv4(), usuario_id: realUserId, negocio_id: autoId,
        nombre: 'BMW Serie 3 2023',
        descripcion: 'Sedán premium con motor 2.0L turbo, pantalla iDrive 8, asientos de cuero y modo M Sport activo.',
        tipo: 'producto', categoria: 'Autos de Lujo',
        precio_esperado: 780000, pais: 'MX',
        canal_venta: 'Concesionario físico y web',
        puv: 'El sedán ejecutivo más vendido en su segmento con tecnología Driving Assistant Pro.',
        cliente_ideal: 'Ejecutivos de 35-55 años, NSE A/B, CDMX y área metropolitana',
        nse: 'A/B', cobertura: 'Local', radio_km: 50,
        inversion_inicial: 5000000, costos_fijos: 180000, tamano_equipo: 8,
        status: 'activo',
      },
      {
        id: uuidv4(), usuario_id: realUserId, negocio_id: autoId,
        nombre: 'Toyota Camry Hybrid 2024',
        descripcion: 'Sedán híbrido con autonomía extendida, 0-100 en 7.2s, pantalla 12.3" y 7 airbags de serie.',
        tipo: 'producto', categoria: 'Autos Híbridos',
        precio_esperado: 520000, pais: 'MX',
        canal_venta: 'Concesionario físico y marketplace',
        puv: 'Máximo ahorro en combustible sin sacrificar rendimiento ni confort.',
        cliente_ideal: 'Familias y profesionistas conscientes del medio ambiente, NSE B/C+',
        nse: 'B/C+', cobertura: 'Local', radio_km: 80,
        inversion_inicial: 3000000, costos_fijos: 140000, tamano_equipo: 8,
        status: 'activo',
      },
      {
        id: uuidv4(), usuario_id: realUserId, negocio_id: autoId,
        nombre: 'Servicio de Detailing Premium',
        descripcion: 'Lavado profundo, pulido, encerado cerámico y ozonización interior. Duración 6-8 horas.',
        tipo: 'servicio', categoria: 'Servicios Automotrices',
        precio_esperado: 4500, pais: 'MX',
        canal_venta: 'WhatsApp, Instagram y web',
        puv: 'Acabado showroom garantizado o segunda aplicación sin costo.',
        cliente_ideal: 'Dueños de autos de lujo y SUV premium que valoran la presentación de su vehículo',
        nse: 'A/B', cobertura: 'Local', radio_km: 30,
        inversion_inicial: 120000, costos_fijos: 25000, tamano_equipo: 4,
        status: 'activo',
      },
      // ── RESTAURANTE ──────────────────────────────────────
      {
        id: uuidv4(), usuario_id: realUserId, negocio_id: restoId,
        nombre: 'Menú Degustación 7 Tiempos',
        descripcion: 'Experiencia gastronómica de autor con insumos de temporada, maridaje de vinos nacionales y presentación de lujo.',
        tipo: 'servicio', categoria: 'Menú Especial',
        precio_esperado: 1850, pais: 'MX',
        canal_venta: 'Reservaciones web, OpenTable e Instagram',
        puv: 'La única degustación de cocina mexicana contemporánea en Polanco con ingredientes 100% locales.',
        cliente_ideal: 'Parejas y directivos de 30-60 años que buscan experiencias gastronómicas únicas',
        nse: 'A/B', cobertura: 'Local', radio_km: 15,
        inversion_inicial: 2500000, costos_fijos: 320000, tamano_equipo: 22,
        status: 'activo',
      },
      {
        id: uuidv4(), usuario_id: realUserId, negocio_id: restoId,
        nombre: 'Brunch Dominical Premium',
        descripcion: 'Buffet curado de platillos mexicanos e internacionales, cocteles de autor incluidos, DJ en vivo, 12-4pm.',
        tipo: 'servicio', categoria: 'Brunch',
        precio_esperado: 650, pais: 'MX',
        canal_venta: 'Instagram, Facebook y reservaciones telefónicas',
        puv: 'El brunch más instagrameable de Polanco, con barra de champagne y estación de tacos gourmet.',
        cliente_ideal: 'Millennials y Gen-Z NSE A/B que buscan experiencias sociales de alto valor',
        nse: 'A/B', cobertura: 'Local', radio_km: 20,
        inversion_inicial: 800000, costos_fijos: 180000, tamano_equipo: 22,
        status: 'activo',
      },
      {
        id: uuidv4(), usuario_id: realUserId, negocio_id: restoId,
        nombre: 'Catering Corporativo',
        descripcion: 'Servicio de alimentos para eventos de empresa: desayunos ejecutivos, comidas corporativas y cenas de gala.',
        tipo: 'servicio', categoria: 'Catering',
        precio_esperado: 350, pais: 'MX',
        canal_venta: 'LinkedIn, correo corporativo y referidos',
        puv: 'Cocina de restaurante 5 estrellas llevada a tu empresa sin costos de logística adicionales.',
        cliente_ideal: 'Directores de RH y asistentes ejecutivos de empresas medianas-grandes en CDMX',
        nse: 'B/C+', cobertura: 'Local', radio_km: 40,
        inversion_inicial: 350000, costos_fijos: 90000, tamano_equipo: 10,
        status: 'activo',
      },
      // ── ROPA ─────────────────────────────────────────────
      {
        id: uuidv4(), usuario_id: realUserId, negocio_id: ropaId,
        nombre: 'Hoodie Oversize "Urban Void"',
        descripcion: 'Sudadera oversize de algodón 380gsm, bordado frontal, tallas XS-3XL, colores: negro carbón, crema y sage.',
        tipo: 'producto', categoria: 'Hoodies & Sudaderas',
        precio_esperado: 1290, pais: 'MX',
        canal_venta: 'TikTok Shop, Instagram Shopping y tienda física Roma Norte',
        puv: 'La hoodie más pesada del mercado mexicano con diseño exclusivo de edición limitada.',
        cliente_ideal: 'Jóvenes de 16-28 años apasionados por la cultura streetwear, NSE C/C+',
        nse: 'C/C+', cobertura: 'Nacional', radio_km: null as any,
        inversion_inicial: 450000, costos_fijos: 65000, tamano_equipo: 6,
        status: 'activo',
      },
      {
        id: uuidv4(), usuario_id: realUserId, negocio_id: ropaId,
        nombre: 'Cargo Pant "Street Tactical"',
        descripcion: 'Pantalón cargo de ripstop premium con 8 bolsillos funcionales, corte relaxed fit, elástico en cintura.',
        tipo: 'producto', categoria: 'Pantalones',
        precio_esperado: 980, pais: 'MX',
        canal_venta: 'TikTok Shop, Instagram, tienda física',
        puv: 'Comodidad táctica con estética urbana — el pantalón que no necesita cinturón.',
        cliente_ideal: 'Skaters, grafiteros y jóvenes creativos que viven en la calle',
        nse: 'C/C+', cobertura: 'Nacional', radio_km: null as any,
        inversion_inicial: 280000, costos_fijos: 55000, tamano_equipo: 6,
        status: 'activo',
      },
      {
        id: uuidv4(), usuario_id: realUserId, negocio_id: ropaId,
        nombre: 'Pack Camisetas Básicas "Core 3-Pack"',
        descripcion: 'Set de 3 camisetas de algodón peinado 200gsm, cuello redondo reforzado, colores neutros coordinados.',
        tipo: 'producto', categoria: 'Camisetas',
        precio_esperado: 699, pais: 'MX',
        canal_venta: 'TikTok Shop, Mercado Libre y tienda física',
        puv: 'Básicos premium al precio de básicos normales — calidad que se siente al tocar.',
        cliente_ideal: 'Cualquier persona que quiera básicos de calidad a precio justo, 16-40 años',
        nse: 'C/C+/B', cobertura: 'Nacional', radio_km: null as any,
        inversion_inicial: 150000, costos_fijos: 40000, tamano_equipo: 6,
        status: 'activo',
      },
    ];

    for (const p of productos) {
      await queryRunner.query(
        `INSERT INTO productos
           (id, usuario_id, negocio_id, nombre, descripcion, tipo, categoria,
            precio_esperado, pais, canal_venta, puv, cliente_ideal, nse,
            cobertura, radio_km, inversion_inicial, costos_fijos, tamano_equipo, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          p.id, p.usuario_id, p.negocio_id, p.nombre, p.descripcion,
          p.tipo, p.categoria, p.precio_esperado, p.pais, p.canal_venta,
          p.puv, p.cliente_ideal, p.nse, p.cobertura, p.radio_km ?? null,
          p.inversion_inicial, p.costos_fijos, p.tamano_equipo, p.status,
        ]
      );
      console.log(`  ✅ Producto: ${p.nombre}`);
    }

    await queryRunner.commitTransaction();
    console.log('\n🎉 Seed completado exitosamente');
    console.log('─────────────────────────────────────');
    console.log('📧 Email:    carlos.mendoza@business.com');
    console.log('🔑 Password: Business2024!');
    console.log('💼 Plan:     Business');
    console.log('📁 Negocios: AutoElite MX | La Hacienda | Moda Urbana');
    console.log('📦 Productos: 9 en total (3 por negocio)');
  } catch (err) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Error en seed:', err);
    throw err;
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

seed().catch(console.error);
