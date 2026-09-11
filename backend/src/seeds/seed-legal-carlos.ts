import 'reflect-metadata';
import { DataSource } from 'typeorm';
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
  console.log('✅ Conectado a la base de datos para sembrar Análisis Legal');

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Encontrar usuario Carlos Mendoza
    const userRow = await queryRunner.query(
      `SELECT id FROM usuarios WHERE email = $1`,
      ['carlos.mendoza@business.com']
    );

    if (userRow.length === 0) {
      console.log('❌ Usuario carlos.mendoza@business.com no encontrado. Asegúrate de correr primero el seed de negocios.');
      await queryRunner.rollbackTransaction();
      return;
    }

    const userId = userRow[0].id;
    console.log(`👤 Carlos Mendoza ID: ${userId}`);

    // Limpieza de análisis legales previos del usuario para evitar duplicados
    await queryRunner.query(
      `DELETE FROM analisis_legal WHERE usuario_id = $1`,
      [userId]
    );

    // Obtener los productos de Carlos Mendoza
    const productos = await queryRunner.query(
      `SELECT id, nombre, categoria, tipo, pais FROM productos WHERE usuario_id = $1`,
      [userId]
    );

    console.log(`📦 Encontrados ${productos.length} productos para sembrar análisis legal.`);

    for (const p of productos) {
      let giro_detectado = '';
      let cumplimiento_global = 'verde';
      let puntaje_cumplimiento = 85;
      let resultado_data = {};

      const nombreLower = p.nombre.toLowerCase();

      if (nombreLower.includes('bmw') || nombreLower.includes('toyota') || nombreLower.includes('detailing')) {
        // --- GIRO AUTOMOTRIZ ---
        giro_detectado = nombreLower.includes('detailing') ? 'Taller de Detallado y Estética Automotriz' : 'Compraventa de Vehículos Usados Certificados';
        cumplimiento_global = 'verde';
        puntaje_cumplimiento = 90;
        resultado_data = {
          giro_detectado,
          pais_analizado: 'México (MX)',
          entidad_fiscal: 'SAT — Servicio de Administración Tributaria',
          fecha_generacion: new Date().toISOString(),
          cumplimiento_global,
          puntaje_cumplimiento,
          resumen_ejecutivo: `Tu negocio de ${giro_detectado.toLowerCase()} cumple con la mayor parte de las obligaciones. Al tratarse de operaciones de alto valor (compraventa de autos), es crítico monitorear los límites de efectivo permitidos por la Ley Antilavado (LFPIORPI) y reportar transacciones vulnerables ante el SAT / UIF para evitar multas millonarias.`,
          permisos_licencias: [
            {
              nombre: 'Contrato de Adhesión PROFECO',
              autoridad: 'PROFECO (Procuraduría Federal del Consumidor)',
              descripcion: 'Registro obligatorio del contrato de adhesión para compraventa de vehículos usados para proteger al consumidor.',
              obligatorio: true,
              nivel_riesgo: 'alto',
              plazo_tramite: '15-20 días hábiles',
              costo_estimado: '$1,200 MXN',
              url_tramite: 'https://www.gob.mx/profeco',
            },
            {
              nombre: 'Registro de REPUVE',
              autoridad: 'Secretariado Ejecutivo del Sistema Nacional de Seguridad Pública',
              descripcion: 'Alta y validación en el Registro Público Vehicular para asegurar que las unidades comercializadas no tengan reporte de robo.',
              obligatorio: true,
              nivel_riesgo: 'alto',
              plazo_tramite: '1-3 días hábiles',
              costo_estimado: 'Gratuito',
              url_tramite: 'https://www.gob.mx/repuve',
            },
            {
              nombre: 'Licencia de Uso de Suelo y Funcionamiento',
              autoridad: 'Ayuntamiento / Alcaldía local',
              descripcion: 'Autorización municipal para operar un lote de venta de vehículos en el establecimiento comercial físico.',
              obligatorio: true,
              nivel_riesgo: 'medio',
              plazo_tramite: '30-45 días hábiles',
              costo_estimado: 'Variable ($3,000 - $8,000 MXN)',
              url_tramite: 'https://www.gob.mx/tramites',
            }
          ],
          obligaciones_fiscales: [
            {
              nombre: 'ISR por enajenación de vehículos',
              regimen_fiscal: 'Régimen General de Personas Morales',
              periodicidad: 'Mensual / Anual',
              descripcion: 'Cálculo y pago del Impuesto sobre la Renta sobre la ganancia real de la compraventa de cada unidad.',
              nivel_riesgo: 'alto',
              aplica_si: 'Siempre que haya ganancia en la venta',
            },
            {
              nombre: 'Avisos de Actividades Vulnerables (LFPIORPI)',
              regimen_fiscal: 'Ley Antilavado',
              periodicidad: 'Mensual (antes del día 17)',
              descripcion: 'Obligación de identificar a los clientes y dar avisos al SAT en operaciones que superen los umbrales de la Ley Antilavado (aprox $250k - $300k MXN).',
              nivel_riesgo: 'alto',
              aplica_si: 'Operaciones que superen los umbrales de ley',
            }
          ],
          obligaciones_laborales: [
            {
              nombre: 'Alta patronal IMSS e INFONAVIT',
              regimen_fiscal: 'Seguridad Social',
              periodicidad: 'Mensual',
              descripcion: 'Alta de mecánicos, asesores de venta y personal administrativo ante el IMSS para garantizar sus prestaciones y cobertura social.',
              nivel_riesgo: 'alto',
              aplica_si: 'Tener personal a tu cargo',
            }
          ],
          regulacion_digital: [],
          regulacion_comercio_exterior: [],
          alertas: [
            {
              nivel: 'rojo',
              titulo: 'Límite de cobro en efectivo',
              descripcion: 'La Ley Antilavado prohíbe el cobro en efectivo de vehículos usados por montos superiores a 3,210 UMA (aprox. $348,000 MXN en 2024).',
              accion_recomendada: 'Restringir cobros en efectivo y exigir transferencia bancaria o cheque de caja en transacciones que excedan el límite.',
            },
            {
              nivel: 'amarillo',
              titulo: 'Garantía obligatoria de ley',
              descripcion: 'PROFECO exige dar una garantía mínima por escrito de 90 días en motor y transmisión para autos usados comercializados.',
              accion_recomendada: 'Incluir la póliza de garantía en el contrato de adhesión PROFECO entregado al cliente.',
            }
          ],
          checklist: [
            { categoria: 'permiso', texto: 'Verificar estado del contrato de adhesión registrado en PROFECO', prioridad: 'alta' },
            { categoria: 'fiscal', texto: 'Verificar umbrales e identificar clientes según Ley Antilavado (LFPIORPI)', prioridad: 'alta' },
            { categoria: 'permiso', texto: 'Hacer consulta de REPUVE obligatoria para cada auto recibido', prioridad: 'alta' },
            { categoria: 'laboral', texto: 'Verificar contratos de confidencialidad para personal de ventas', prioridad: 'media' },
          ],
          disclaimer: '⚠️ Esta información es orientativa y fue generada por inteligencia artificial con fines informativos. No constituye asesoría legal ni fiscal profesional. Las leyes y reglamentos cambian con frecuencia; siempre verifica con un contador o abogado especializado.',
          fuentes_recomendadas: [
            { nombre: 'Portal de Prevención de Lavado de Dinero (SAT)', url: 'https://sppld.sat.gob.mx' },
            { nombre: 'Buró Comercial PROFECO', url: 'https://burocomercial.profeco.gob.mx' },
            { nombre: 'REPUVE Oficial', url: 'https://www.repuve.gob.mx' }
          ]
        };
      } else if (nombreLower.includes('degustación') || nombreLower.includes('brunch') || nombreLower.includes('catering')) {
        // --- GIRO ALIMENTOS Y BEBIDAS ---
        giro_detectado = nombreLower.includes('catering') ? 'Servicio de Catering y Banquetes' : 'Restaurante con Venta de Bebidas Alcohólicas';
        cumplimiento_global = 'verde';
        puntaje_cumplimiento = 94;
        resultado_data = {
          giro_detectado,
          pais_analizado: 'México (MX)',
          entidad_fiscal: 'SAT — Servicio de Administración Tributaria',
          fecha_generacion: new Date().toISOString(),
          cumplimiento_global,
          puntaje_cumplimiento,
          resumen_ejecutivo: `Tu negocio gastronómico cuenta con excelentes estándares de cumplimiento. Al expender alimentos y bebidas alcohólicas, tus prioridades normativas son el aviso sanitario (COFEPRIS) para asegurar higiene (NOM-251) y la licencia para venta de alcohol, cuya falta es motivo de clausura inmediata del local.`,
          permisos_licencias: [
            {
              nombre: 'Licencia para venta de bebidas alcohólicas',
              autoridad: 'Secretaría de Finanzas Estatal / Ayuntamiento Municipal',
              descripcion: 'Licencia comercial de alcoholes requerida para poder servir o vender bebidas embriagantes con alimentos.',
              obligatorio: true,
              nivel_riesgo: 'alto',
              plazo_tramite: '45-90 días hábiles',
              costo_estimado: 'Variable ($25,000 - $80,000 MXN)',
              url_tramite: 'https://www.gob.mx/tramites',
            },
            {
              nombre: 'Aviso de Funcionamiento Sanitario',
              autoridad: 'COFEPRIS (Comisión Federal para la Protección contra Riesgos Sanitarios)',
              descripcion: 'Aviso obligatorio que declara que el establecimiento cumple con las normas de higiene y preparación de alimentos del sector salud.',
              obligatorio: true,
              nivel_riesgo: 'alto',
              plazo_tramite: 'Inmediato (registro en línea)',
              costo_estimado: 'Gratuito',
              url_tramite: 'https://www.gob.mx/cofepris',
            },
            {
              nombre: 'Visto Bueno de Seguridad y Protección Civil',
              autoridad: 'Dirección de Protección Civil Municipal',
              descripcion: 'Acreditación de que el restaurante cuenta con extinguidores, salidas de emergencia, señalización y plan de evacuación.',
              obligatorio: true,
              nivel_riesgo: 'alto',
              plazo_tramite: '15-30 días hábiles',
              costo_estimado: '$2,500 MXN',
              url_tramite: 'https://www.gob.mx/tramites',
            }
          ],
          obligaciones_fiscales: [
            {
              nombre: 'Impuesto Especial sobre Producción y Servicios (IEPS)',
              regimen_fiscal: 'SAT',
              periodicidad: 'Mensual',
              descripcion: 'Desglose y retención de IEPS en la compra y posterior enajenación de bebidas con contenido alcohólico y alta densidad calórica.',
              nivel_riesgo: 'alto',
              aplica_si: 'Venta de alcohol y alimentos con alta densidad calórica',
            },
            {
              nombre: 'Declaración y Pago de IVA de Alimentos y Bebidas',
              regimen_fiscal: 'Régimen General de Ley',
              periodicidad: 'Mensual',
              descripcion: 'Declaración del Impuesto al Valor Agregado gravado al 16% sobre todo el consumo de los comensales.',
              nivel_riesgo: 'alto',
              aplica_si: 'Siempre que se ofrezcan consumos en restaurante',
            }
          ],
          obligaciones_laborales: [
            {
              nombre: 'Seguridad Social (IMSS) y Contratos Laborales',
              regimen_fiscal: 'Ley Federal del Trabajo',
              periodicidad: 'Mensual',
              descripcion: 'Registro de todo el equipo de cocina (chefs, cocineros, lavaplatos) y servicio (meseros, baristas) bajo contratos con prestaciones de ley.',
              nivel_riesgo: 'alto',
              aplica_si: 'Tener empleados (cocineros, meseros, etc.)',
            }
          ],
          regulacion_digital: [],
          regulacion_comercio_exterior: [],
          alertas: [
            {
              nivel: 'amarillo',
              titulo: 'Cumplimiento NOM-251-SSA1-2009',
              descripcion: 'Norma oficial obligatoria que regula las prácticas de higiene para el proceso de alimentos, bebidas o suplementos alimenticios.',
              accion_recomendada: 'Capacitar a todo el staff en manejo higiénico y mantener bitácoras de temperatura de refrigeradores.',
            },
            {
              nivel: 'rojo',
              titulo: 'Clausura por venta de alcohol sin licencia',
              descripcion: 'Operar o servir alcohol sin la licencia municipal vigente puede resultar en clausura definitiva y multas de hasta $150,000 MXN.',
              accion_recomendada: 'Asegurar el refrendo anual de la licencia de alcoholes y exhibirla en un lugar visible del restaurante.',
            }
          ],
          checklist: [
            { categoria: 'permiso', texto: 'Asegurar el refrendo anual de la licencia de alcoholes', prioridad: 'alta' },
            { categoria: 'permiso', texto: 'Mantener actualizadas las bitácoras higiénicas de la NOM-251', prioridad: 'alta' },
            { categoria: 'laboral', texto: 'Dar de alta en el IMSS a todo el personal de fines de semana y extras', prioridad: 'alta' },
            { categoria: 'otro', texto: 'Realizar simulacro anual obligatorio de Protección Civil', prioridad: 'media' },
          ],
          disclaimer: '⚠️ Esta información es orientativa y fue generada por inteligencia artificial con fines informativos. No constituye asesoría legal ni fiscal profesional. Las leyes y reglamentos cambian con frecuencia; siempre verifica con un contador o abogado especializado.',
          fuentes_recomendadas: [
            { nombre: 'Trámites COFEPRIS', url: 'https://www.gob.mx/cofepris' },
            { nombre: 'Asociación Mexicana de Restaurantes (AMR)', url: 'https://amr.org.mx' }
          ]
        };
      } else {
        // --- GIRO ROPA / E-COMMERCE ---
        giro_detectado = 'E-Commerce y Fabricación de Prendas de Vestir';
        cumplimiento_global = 'verde';
        puntaje_cumplimiento = 96;
        resultado_data = {
          giro_detectado,
          pais_analizado: 'México (MX)',
          entidad_fiscal: 'SAT — Servicio de Administración Tributaria',
          fecha_generacion: new Date().toISOString(),
          cumplimiento_global,
          puntaje_cumplimiento,
          resumen_ejecutivo: `Tu marca de streetwear y e-commerce opera bajo altos niveles de cumplimiento digital e industrial. Para mantener este estado, tus principales retos son el registro de marcas ante el IMPI (para proteger la propiedad intelectual de tus diseños) y el cumplimiento estricto del etiquetado comercial textil (NOM-004-SCFI) en cada prenda.`,
          permisos_licencias: [
            {
              nombre: 'Registro de Marca IMPI',
              autoridad: 'IMPI (Instituto Mexicano de la Propiedad Industrial)',
              descripcion: 'Registro de nombre y logotipo para proteger tu propiedad intelectual frente a copias e imitaciones comerciales.',
              obligatorio: false,
              nivel_riesgo: 'medio',
              plazo_tramite: '3-6 meses',
              costo_estimado: '$3,126 MXN por clase',
              url_tramite: 'https://www.gob.mx/impi',
            },
            {
              nombre: 'Aviso de Privacidad Integral',
              autoridad: 'INAI (Instituto Nacional de Transparencia, Acceso a la Información y Protección de Datos Personales)',
              descripcion: 'Documento obligatorio para publicar en tu e-commerce informando sobre el tratamiento de datos y pasarelas de pago de tus clientes.',
              obligatorio: true,
              nivel_riesgo: 'alto',
              plazo_tramite: 'Inmediato (redactar y subir)',
              costo_estimado: 'Gratuito / Costo de abogado',
              url_tramite: 'https://www.gob.mx/inai',
            }
          ],
          obligaciones_fiscales: [
            {
              nombre: 'Impuesto sobre la Renta (ISR) por ventas digitales',
              regimen_fiscal: 'Régimen General de Personas Morales / Actividad Empresarial',
              periodicidad: 'Mensual / Anual',
              descripcion: 'Cálculo de impuestos sobre las ganancias generadas a través de Shopify u otras pasarelas de pago digitales (Stripe/PayPal).',
              nivel_riesgo: 'alto',
              aplica_si: 'Siempre que se generen ingresos comerciales',
            },
            {
              nombre: 'Declaración mensual de IVA por e-commerce',
              regimen_fiscal: 'SAT',
              periodicidad: 'Mensual',
              descripcion: 'Declaración mensual del IVA cobrado en las ventas de prendas enviadas a toda la república.',
              nivel_riesgo: 'alto',
              aplica_si: 'Siempre que vendas ropa gravada al 16%',
            }
          ],
          obligaciones_laborales: [
            {
              nombre: 'Contratos Laborales de Maquila y Almacén',
              regimen_fiscal: 'Ley Federal del Trabajo',
              periodicidad: 'Mensual',
              descripcion: 'Alta patronal ante el IMSS del personal encargado del almacén, envíos y control de calidad, asegurando cumplimiento de jornada laboral.',
              nivel_riesgo: 'alto',
              aplica_si: 'Contar con staff para logística y operaciones',
            }
          ],
          regulacion_digital: [
            {
              nombre: 'Términos y Condiciones de Venta Digital',
              regimen_fiscal: 'PROFECO / Comercio Electrónico',
              periodicidad: 'Única',
              descripcion: 'Redacción obligatoria de las políticas de cambios, reembolsos, tiempos de entrega y métodos de pago permitidos en el portal.',
              nivel_riesgo: 'medio',
              aplica_si: 'Venta de productos en portal de internet propio',
            }
          ],
          regulacion_comercio_exterior: [],
          alertas: [
            {
              nivel: 'rojo',
              titulo: 'Cumplimiento NOM-004-SCFI-2006',
              descripcion: 'Norma oficial obligatoria que regula el etiquetado de productos textiles, prendas de vestir y sus accesorios.',
              accion_recomendada: 'Asegurar que todas las prendas tengan etiquetas cosidas con información en español: insumos, país de origen, instrucciones de lavado y RFC del importador/fabricante.',
            },
            {
              nivel: 'verde',
              titulo: 'Registro de marca en proceso',
              descripcion: 'El registro de marca otorga exclusividad nacional de uso y te protege de demandas de terceros.',
              accion_recomendada: 'Monitorear el estatus de tus solicitudes en el portal oficial del IMPI periódicamente.',
            }
          ],
          checklist: [
            { categoria: 'otro', texto: 'Comprobar que todas las prendas cosan la etiqueta con especificaciones de la NOM-004', prioridad: 'alta' },
            { categoria: 'otro', texto: 'Hacer solicitud de registro de marcas y diseños ante el IMPI', prioridad: 'alta' },
            { categoria: 'fiscal', texto: 'Vincular y declarar los reportes de Stripe/Shopify ante el SAT', prioridad: 'alta' },
            { categoria: 'otro', texto: 'Publicar el Aviso de Privacidad en el footer de la página de internet', prioridad: 'media' },
          ],
          disclaimer: '⚠️ Esta información es orientativa y fue generada por inteligencia artificial con fines informativos. No constituye asesoría legal ni fiscal profesional. Las leyes y reglamentos cambian con frecuencia; siempre verifica con un contador o abogado especializado.',
          fuentes_recomendadas: [
            { nombre: 'Instituto Mexicano de la Propiedad Industrial', url: 'https://www.gob.mx/impi' },
            { nombre: 'Guía de Comercio Electrónico de PROFECO', url: 'https://www.gob.mx/profeco' }
          ]
        };
      }

      // Insertar en analisis_legal
      const uuid = uuidv4();
      await queryRunner.query(
        `INSERT INTO analisis_legal
           (id, producto_id, usuario_id, pais, forma_juridica, tiene_empleados,
            vende_en_linea, exporta_importa, giro_detectado, cumplimiento_global,
            puntaje_cumplimiento, resultado_data, estado_analisis, fecha_creacion, fecha_completado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          uuid,
          p.id,
          userId,
          p.pais,
          p.nombre.toLowerCase().includes('servicio') ? 'Persona Física' : 'S.A. de C.V.',
          p.nombre.toLowerCase().includes('bmw') || p.nombre.toLowerCase().includes('degustación') ? true : false,
          p.nombre.toLowerCase().includes('hoodie') || p.nombre.toLowerCase().includes('pant') || p.nombre.toLowerCase().includes('camisetas') ? true : false,
          false,
          giro_detectado,
          cumplimiento_global,
          puntaje_cumplimiento,
          JSON.stringify(resultado_data),
          'completado',
          new Date(Date.now() - 3600000 * 2), // hace 2 horas
          new Date(Date.now() - 3600000 * 1.95),
        ]
      );

      console.log(`  ✅ Análisis Legal Sembrado: ${p.nombre} -> ${giro_detectado} (${cumplimiento_global})`);
    }

    await queryRunner.commitTransaction();
    console.log('\n🎉 Seed de Análisis Legales completado con éxito para Carlos Mendoza.');

  } catch (err) {
    console.error('❌ Error al sembrar análisis legales:', err);
    await queryRunner.rollbackTransaction();
  } finally {
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

seed().catch(console.error);
