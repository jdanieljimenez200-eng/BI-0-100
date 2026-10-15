# Imagen de DESARROLLO. La de producción es Dockerfile.prod (multi-stage +
# output: 'standalone' de next.config.js).
#
# Aquí NO se ejecuta `next build` a propósito: en docker-compose.yml este
# servicio monta ./frontend en /app, monta un volumen anónimo en /app/.next y
# arranca `npm run dev`. Cualquier artefacto compilado dentro de la imagen queda
# tapado por esos montajes, así que construirlo solo alarga el build sin que
# nada lo llegue a usar.
FROM node:24-alpine
WORKDIR /app

# dumb-init para propagar señales de apagado rápido en desarrollo
RUN apk add --no-cache dumb-init

# Lockfile primero para aprovechar la cache de capas
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NODE_ENV se fija DESPUÉS de npm ci: con development el dev server sirve el
# código montado, y al ir después no interfiere con la instalación de devDeps.
ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# Margen amplio a propósito: la primera petición al dev server dispara la
# compilación on-demand y puede tardar bastante más que en producción.
HEALTHCHECK --interval=30s --timeout=30s --start-period=90s --retries=10 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/', r => { if (r.statusCode >= 500) throw new Error(r.statusCode) }).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]