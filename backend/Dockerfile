FROM node:24-alpine
WORKDIR /app

# dumb-init para propagar señales de apagado rápido en desarrollo.
# ffmpeg (incluye ffprobe) para extraer frames de vídeo en el Evaluador de Pitch.
RUN apk add --no-cache dumb-init ffmpeg

# Lockfile primero para aprovechar cache de capas y builds reproducibles.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Entorno de DESARROLLO. El esquema NO se sincroniza solo: docker-compose fija
# TYPEORM_SYNCHRONIZE=false a propósito (synchronize elimina los índices y
# renombra las FK creadas por migraciones). Los cambios de esquema se aplican
# únicamente con `npm run migration:run`.
EXPOSE 3001

# Permite que docker-compose espere a que el backend responda antes de arrancar
# el frontend (depends_on: condition: service_healthy).
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3001/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node_modules/.bin/ts-node", "--transpile-only", "src/app.ts"]
