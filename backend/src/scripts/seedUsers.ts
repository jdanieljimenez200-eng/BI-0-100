/**
 * Seed de usuarios de prueba — SOLO para entorno de desarrollo local.
 *
 * Crea (o actualiza) un conjunto de cuentas con contraseñas conocidas, ya
 * hasheadas con el mismo cost factor que usa el backend (bcrypt, rounds = 12,
 * ver routes/auth.ts:90). Es idempotente: se puede ejecutar varias veces sin
 * duplicar filas — busca por email y, si existe, refresca los campos.
 *
 * Uso:
 *   npm run seed            (desde backend/)
 *
 * NUNCA ejecutar esto contra una base de datos de producción ni subir estas
 * credenciales a un entorno real: son contraseñas fijas y conocidas.
 */
import './guardiaSeeds';
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

import { AppDataSource } from '../config/database';
import { Usuario, Plan, Role } from '../models/Usuario';

// Mismo cost factor que el signup real (routes/auth.ts:90).
const BCRYPT_ROUNDS = 12;

interface SeedUser {
  email: string;
  password: string;
  nombre: string;
  plan: Plan;
  role: Role;
  analisis_disponibles: number;
  creditos_marketing: number;
}

// Credenciales de prueba. La contraseña cumple la política de fuerza del
// backend (8+ chars, mayúscula, número, carácter especial).
const SEED_USERS: SeedUser[] = [
  {
    email: 'admin@bi0a100.test',
    password: 'Admin123!',
    nombre: 'Admin Demo',
    plan: 'business',
    role: 'admin',
    analisis_disponibles: 999,
    creditos_marketing: 999,
  },
  {
    email: 'pro@bi0a100.test',
    password: 'ProUser123!',
    nombre: 'Pro Demo',
    plan: 'pro',
    role: 'user',
    analisis_disponibles: 999,
    creditos_marketing: 50,
  },
  {
    email: 'free@bi0a100.test',
    password: 'FreeUser123!',
    nombre: 'Free Demo',
    plan: 'freemium',
    role: 'user',
    analisis_disponibles: 1,
    creditos_marketing: 0,
  },
];

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'seedUsers.ts abortado: NODE_ENV=production. Este script es solo para desarrollo local.'
    );
  }

  await AppDataSource.initialize();
  console.log('✅ Database connected');

  const repo = AppDataSource.getRepository(Usuario);

  for (const u of SEED_USERS) {
    const password_hash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
    const existing = await repo.findOne({ where: { email: u.email } });

    if (existing) {
      existing.password_hash = password_hash;
      existing.nombre = u.nombre;
      existing.plan = u.plan;
      existing.role = u.role;
      existing.account_role = 'owner';
      existing.owner_id = null;
      existing.analisis_disponibles = u.analisis_disponibles;
      existing.creditos_marketing = u.creditos_marketing;
      existing.activo = true;
      existing.intentos_login = 0;
      existing.bloqueado_hasta = null as unknown as Date;
      await repo.save(existing);
      console.log(`↻ actualizado: ${u.email} (${u.plan}/${u.role})`);
    } else {
      const usuario = repo.create({
        email: u.email,
        password_hash,
        nombre: u.nombre,
        plan: u.plan,
        role: u.role,
        account_role: 'owner',
        owner_id: null,
        analisis_disponibles: u.analisis_disponibles,
        creditos_marketing: u.creditos_marketing,
        activo: true,
        intentos_login: 0,
      });
      await repo.save(usuario);
      console.log(`＋ creado: ${u.email} (${u.plan}/${u.role})`);
    }
  }

  console.log('\n✅ Seed completado. Credenciales de prueba:');
  for (const u of SEED_USERS) {
    console.log(`   ${u.email}  /  ${u.password}   [${u.plan}, ${u.role}]`);
  }

  await AppDataSource.destroy();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed falló:', err);
    process.exit(1);
  });