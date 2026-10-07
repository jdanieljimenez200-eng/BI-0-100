# Imagen del trabajo de respaldo (y de restauración) de BI 0 A 100.
#
# PG_MAJOR debe ser IGUAL O MAYOR que la versión de Postgres de producción:
# pg_dump se niega a volcar un servidor más nuevo que él. Para restaurar,
# usa la misma versión que la base destino.
#   docker build --build-arg PG_MAJOR=17 -t bi0a100-respaldo scripts/respaldo
ARG PG_MAJOR=17
FROM postgres:${PG_MAJOR}-alpine

# age: cifrado con llave pública (el servidor no puede descifrar sus respaldos).
# aws-cli: subida a S3. curl: aviso de fallo por webhook.
RUN apk add --no-cache age aws-cli curl ca-certificates

# Con sslmode=verify-full (Neon, RDS…) libpq necesita los certificados raíz.
ENV PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt

COPY respaldar.sh restaurar.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/respaldar.sh /usr/local/bin/restaurar.sh

# Sin privilegios: el usuario «postgres» de la imagen basta para pg_dump.
USER postgres
WORKDIR /tmp

# Sin entrypoint de servidor: el contenedor respalda y termina.
ENTRYPOINT []
CMD ["respaldar.sh"]
