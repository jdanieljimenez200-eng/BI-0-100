# Setup — Desarrollo Local

Guía completa para configurar el entorno de desarrollo de BI 0 A 100.

## Requisitos Previos

- Node.js 18+
- Docker + Docker Compose (recomendado)
- Git
- PostgreSQL 15 (solo si desarrollo sin Docker)
- Redis 7 (solo si desarrollo sin Docker)

## Setup Rápido con Docker (Recomendado)

### Paso 1: Clonar repositorio

bash
git clone <repo>
cd Bi0a100

### Paso 2: Configurar variables de entorno

bash
cp .env.example .env

Edita `.env` y establece: