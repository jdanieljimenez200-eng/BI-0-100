import { AppDataSource } from '../config/database';
import { AnalisisBrief } from '../models/AnalisisBrief';
import { logger } from '../utils/logger';

const USUARIO_ID = 2; // Jorge
const BRIEF_DATA = {
  resumen_ejecutivo: 'La Pizza Margherita es un producto clásico y tradicional con demanda estable en el mercado. Posee márgenes de rentabilidad atractivos y bajo riesgo operativo.',
  oportunidades: [
    'Expandir a canales delivery (Uber Eats, Glovo)',
    'Crear variantes de sabor premium',
    'Establecer alianzas con restaurantes',
    'Implementar programa de fidelización',
  ],
  riesgos: [
    'Competencia intensa de marcas establecidas',
    'Variabilidad en precios de insumos',
    'Cambios en preferencias del consumidor',
    'Regulaciones sanitarias más estrictas',
  ],
  proximos_pasos: [
    'Validar demanda con encuestas de mercado',
    'Desarrollar plan de marketing digital',
    'Analizar financiero detallado',
    'Evaluar cadena de suministro',
  ],
  score_viabilidad: 7.8,
};

async function completeBrief() {
  try {
    await AppDataSource.initialize();
    console.log('✅ Database connected');

    const briefRepo = AppDataSource.getRepository(AnalisisBrief);

    // Crear análisis Brief
    const brief = briefRepo.create({
      usuario_id: USUARIO_ID,
      estado_analisis: 'completado',
      resultado_json: BRIEF_DATA,
      fecha_creacion: new Date(),
    });

    await briefRepo.save(brief);
    console.log(`✅ Brief creado con ID: ${brief.id}`);

    await AppDataSource.destroy();
    console.log('✅ Done');
  } catch (error) {
    logger.error('Error completing brief:', error);
    process.exit(1);
  }
}

completeBrief();