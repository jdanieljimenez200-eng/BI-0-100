import './guardiaSeeds';
import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { Usuario } from '../models/Usuario';
import { Producto } from '../models/Producto';
import { AnalisisMercado } from '../models/AnalisisMercado';
import bcrypt from 'bcryptjs';

async function createDemoUser() {
  try {
    await AppDataSource.initialize();
    console.log('✅ Base de datos conectada');

    const usuarioRepo = AppDataSource.getRepository(Usuario);
    const productoRepo = AppDataSource.getRepository(Producto);
    const mercadoRepo = AppDataSource.getRepository(AnalisisMercado);

    // 1. Crear usuario
    const passwordHash = await bcrypt.hash('password123', 10);
    
    const usuario = usuarioRepo.create({
      email: 'demo@bi0a100.com',
      nombre: 'Demo User',
      password_hash: passwordHash,
      plan: 'pro',
      role: 'user',
    });

    const savedUser = await usuarioRepo.save(usuario);
    console.log(`✅ Usuario creado: ${savedUser.email} (ID: ${savedUser.id})`);

    // 2. Crear producto
    const producto = productoRepo.create({
      usuario_id: savedUser.id,
      nombre: 'Saas Platform',
      descripcion: 'Platform de análisis de negocios',
      categoria: 'Software',
    });

    const savedProducto = await productoRepo.save(producto);
    console.log(`✅ Producto creado: ${savedProducto.nombre} (ID: ${savedProducto.id})`);

    // 3. Crear análisis completado
    const analisis = mercadoRepo.create({
      usuario_id: savedUser.id,
      producto_id: savedProducto.id,
      estado_analisis: 'completado',
      resultado_json: {
        score_mercado: 8.5,
        tamano_mercado: 'Mercado de $5B con crecimiento del 25% anual',
        competencia: 'Mercado fragmentado con oportunidades de consolidación',
        tendencias: [
          'Adopción de IA en decisiones empresariales',
          'Demanda por análisis en tiempo real',
          'Integración con herramientas existentes'
        ],
        recomendaciones: [
          'Enfocarse en pequeñas y medianas empresas',
          'Diferenciar con IA predictiva',
          'Desarrollar integraciones con ERPs populares'
        ]
      },
      fecha_creacion: new Date(),
    });

    await mercadoRepo.save(analisis);
    console.log(`✅ Análisis Mercado completado`);

    console.log('\n✅ DEMO USER CREADO EXITOSAMENTE\n');
    console.log('Credenciales:');
    console.log(`  Email: ${savedUser.email}`);
    console.log(`  Password: password123`);
    console.log(`  Plan: ${savedUser.plan}`);
    console.log('\n');

    await AppDataSource.destroy();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createDemoUser();