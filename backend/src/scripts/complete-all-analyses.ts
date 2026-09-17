import './guardiaSeeds';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

const USUARIO_ID = '80b339a3-5176-4b92-9786-9e95f26f64c9'; // Demo user
const PRODUCTO_ID = 'e91ba309-3a99-43e6-90db-2485fe8ad835'; // Saas Platform

async function completeAllAnalyses() {
  try {
    await AppDataSource.initialize();
    console.log('✅ Base de datos conectada');

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    const userRes = await queryRunner.query(
      `SELECT id FROM usuarios WHERE id = $1 OR email = 'demo@bi0a100.com' OR email = 'jorge@bi0a100.com' LIMIT 1`,
      [USUARIO_ID]
    );
    const targetUserId = userRes[0]?.id || USUARIO_ID;

    const prodRes = await queryRunner.query(
      `SELECT id FROM productos WHERE id = $1 OR usuario_id = $2 LIMIT 1`,
      [PRODUCTO_ID, targetUserId]
    );
    const targetProductoId = prodRes[0]?.id || PRODUCTO_ID;

    // Ventas
    await queryRunner.query(
      `INSERT INTO analisis_ventas (
         id, usuario_id, producto_id, pais, tipo_venta, canal_principal, ticket_promedio,
         nombre_producto, categoria, precio, tips_data, historia_data, perfil_cliente_data,
         estado_analisis, fecha_creacion, fecha_completado
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'completado', NOW(), NOW())`,
      [
        uuidv4(), targetUserId, targetProductoId, 'MX', 'B2C_directo', 'directo', 100000,
        'SaaS Platform', 'Software', 100000,
        JSON.stringify({
          score_ventas: 8.1,
          canales_prioritarios: ['Self-service', 'Outbound B2B', 'Partners'],
          riesgos: ['Ciclo de venta enterprise largo', 'Alta dependencia de un solo canal'],
          acciones: ['Definir playbook outbound', 'Instrumentar funnel self-service', 'Programa de reseller'],
          recomendacion: 'Diversificar canales antes de escalar el equipo comercial'
        }),
        JSON.stringify({
          historia: 'El reto de escalar ventas B2B en etapas tempranas.',
          lecciones: ['Validar playbook antes de contratar']
        }),
        JSON.stringify({
          icp: 'Directores de Tecnología y Fundadores en LATAM'
        })
      ]
    );
    console.log('✅ Análisis Ventas creado');

    // Legal - usa resultado_data, no resumen_data
    await queryRunner.query(
      `INSERT INTO analisis_legal (id, usuario_id, producto_id, pais, resultado_data, estado_analisis, fecha_creacion, fecha_completado)
       VALUES ($1, $2, $3, $4, $5, 'completado', NOW(), NOW())`,
      [uuidv4(), targetUserId, targetProductoId, 'MX', JSON.stringify({
        score_legal: 7.5,
        regulaciones: ['GDPR', 'CCPA', 'SOC2'],
        propiedad_intelectual: 'Patentes registradas',
        riesgos_legales: ['Compliance en múltiples jurisdicciones'],
        recomendacion: 'Implementar SOC2 Type II antes de B2B enterprise'
      })]
    );
    console.log('✅ Análisis Legal creado');

    // Brief - usa resultado_data, no resumen_data
    await queryRunner.query(
      `INSERT INTO analisis_brief (id, usuario_id, producto_id, resultado_data, estado_analisis, fecha_creacion, fecha_completado)
       VALUES ($1, $2, $3, $4, 'completado', NOW(), NOW())`,
      [uuidv4(), targetUserId, targetProductoId, JSON.stringify({
        score_viabilidad: 8.1,
        resumen_ejecutivo: 'SaaS Platform es un negocio altamente viable con fuerte demanda de mercado, márgenes atractivos y equipo capacitado.',
        oportunidades: ['Expansión internacional (Europa, LATAM)', 'Verticalizaciones específicas', 'Marketplace de integraciones', 'Programas de partner reseller'],
        riesgos: ['Competencia de players establecidos', 'Requisitos de compliance crecientes', 'Dependencia de talento técnico'],
        proximos_pasos: ['Validar product-market fit con 100 users', 'Alcanzar ARR $100K', 'Implementar SOC2 compliance', 'Levantar serie A']
      })]
    );
    console.log('✅ Análisis Brief creado');

    await queryRunner.release();
    console.log('\n✅ TODOS LOS 6 ANÁLISIS COMPLETADOS\n');
    await AppDataSource.destroy();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

completeAllAnalyses();