#!/bin/sh
# Respaldo de la base de BI 0 A 100: pg_dump → verificación → cifrado → S3.
#
# Corre como trabajo programado (servicio aparte en Railway con cronSchedule, o
# `docker run --rm` desde el cron del servidor) y termina. Ver
# docs/deployment/RESPALDOS.md.
#
# Variables:
#   DATABASE_URL                 base a respaldar (obligatoria)
#   RESPALDO_AGE_DESTINATARIO    llave PÚBLICA de age (age1…) con la que se cifra.
#                                La privada NO vive en el servidor: aunque alguien
#                                entre al servidor, no puede leer los respaldos.
#   RESPALDO_SIN_CIFRAR=1        solo para pruebas locales: sube sin cifrar.
#   RESPALDO_BUCKET              bucket de S3 (con AWS_ACCESS_KEY_ID,
#                                AWS_SECRET_ACCESS_KEY y AWS_REGION)
#   RESPALDO_PREFIJO             carpeta dentro del bucket (por defecto bi0a100)
#   RESPALDO_DESTINO_LOCAL       carpeta local en lugar de S3 (pruebas o servidor propio)
#   RESPALDO_MIN_BYTES           tamaño mínimo aceptable (por defecto 20000):
#                                un respaldo casi vacío es señal de base equivocada
#   RESPALDO_AVISO_URL           opcional: POST JSON {"text": …} si algo falla
#                                (webhook de Slack, Discord, etc.)
set -eu

registrar() { printf '%s [respaldo] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

AVISADO=0
avisar_fallo() {
  [ "$AVISADO" = 1 ] && return 0
  AVISADO=1
  [ -n "${RESPALDO_AVISO_URL:-}" ] || return 0
  curl -fsS -m 15 -X POST -H 'Content-Type: application/json' \
    -d "{\"text\":\"Respaldo de BI 0 A 100 FALLÓ: $1\"}" "$RESPALDO_AVISO_URL" >/dev/null 2>&1 || true
}

fallar() {
  registrar "ERROR: $*"
  avisar_fallo "$*"
  exit 1
}

: "${DATABASE_URL:?Falta DATABASE_URL}"
PREFIJO="${RESPALDO_PREFIJO:-bi0a100}"
MIN_BYTES="${RESPALDO_MIN_BYTES:-20000}"

if [ -z "${RESPALDO_DESTINO_LOCAL:-}" ] && [ -z "${RESPALDO_BUCKET:-}" ]; then
  fallar "define RESPALDO_BUCKET (S3) o RESPALDO_DESTINO_LOCAL"
fi
if [ -z "${RESPALDO_AGE_DESTINATARIO:-}" ] && [ "${RESPALDO_SIN_CIFRAR:-}" != "1" ]; then
  fallar "define RESPALDO_AGE_DESTINATARIO (llave pública de age): la base tiene datos personales y de dinero de los negocios"
fi

TMP="$(mktemp -d)"
# Cualquier comando que falle de aquí en adelante avisa (una sola vez) antes de salir.
al_salir() {
  codigo=$?
  [ "$codigo" -eq 0 ] || avisar_fallo "salió con código $codigo"
  rm -rf "$TMP"
}
trap al_salir EXIT

MARCA="$(date -u +%Y%m%dT%H%M%SZ)"
NOMBRE="bi0a100-$MARCA.dump"
DUMP="$TMP/$NOMBRE"
inicio=$(date +%s)

registrar "volcando la base (pg_dump $(pg_dump --version | awk '{print $3}'))"
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
  --dbname="$DATABASE_URL" --file="$DUMP" || fallar "pg_dump no terminó"

# El archivo se lee de vuelta y tiene las tablas sin las que el negocio no
# existe. Un volcado que no se puede leer no es un respaldo.
pg_restore --list "$DUMP" > "$TMP/indice.txt" || fallar "el volcado no se puede leer (pg_restore --list)"
for tabla in usuarios productos ventas venta_items movimientos_contables insumos_inventario migrations; do
  grep -Eq "TABLE DATA public $tabla( |$)" "$TMP/indice.txt" || fallar "el volcado no trae la tabla $tabla"
done
bytes=$(wc -c < "$DUMP" | tr -d ' ')
[ "$bytes" -ge "$MIN_BYTES" ] || fallar "el volcado pesa $bytes bytes (mínimo $MIN_BYTES): ¿base equivocada o vacía?"
registrar "volcado verificado: $bytes bytes, $(grep -c 'TABLE DATA' "$TMP/indice.txt") tablas"

FINAL="$DUMP"
if [ -n "${RESPALDO_AGE_DESTINATARIO:-}" ]; then
  age -r "$RESPALDO_AGE_DESTINATARIO" -o "$DUMP.age" "$DUMP" || fallar "no se pudo cifrar con age"
  rm -f "$DUMP"
  FINAL="$DUMP.age"
  NOMBRE="$NOMBRE.age"
else
  registrar "AVISO: respaldo SIN CIFRAR (RESPALDO_SIN_CIFRAR=1); úsalo solo en pruebas"
fi
SHA=$(sha256sum "$FINAL" | awk '{print $1}')
printf '%s  %s\n' "$SHA" "$NOMBRE" > "$FINAL.sha256"

# El día 1 la copia también va a «mensual/», que se conserva más tiempo
# (la caducidad la pone la regla de ciclo de vida del bucket, no este script).
CARPETAS="diario"
[ "$(date -u +%d)" = "01" ] && CARPETAS="diario mensual"

for carpeta in $CARPETAS; do
  if [ -n "${RESPALDO_DESTINO_LOCAL:-}" ]; then
    mkdir -p "$RESPALDO_DESTINO_LOCAL/$PREFIJO/$carpeta"
    cp "$FINAL" "$FINAL.sha256" "$RESPALDO_DESTINO_LOCAL/$PREFIJO/$carpeta/"
    registrar "guardado en $RESPALDO_DESTINO_LOCAL/$PREFIJO/$carpeta/$NOMBRE"
  else
    destino="s3://$RESPALDO_BUCKET/$PREFIJO/$carpeta/$NOMBRE"
    aws s3 cp "$FINAL" "$destino" --sse AES256 --only-show-errors \
      --metadata "sha256=$SHA" || fallar "no se pudo subir a $destino"
    aws s3 cp "$FINAL.sha256" "$destino.sha256" --sse AES256 --only-show-errors \
      || fallar "no se pudo subir la suma de verificación"
    registrar "subido a $destino"
  fi
done

# Marca del último respaldo bueno: el monitoreo mira su fecha.
printf '{"archivo":"%s","bytes":%s,"sha256":"%s","fecha":"%s","segundos":%s}\n' \
  "$NOMBRE" "$(wc -c < "$FINAL" | tr -d ' ')" "$SHA" "$MARCA" "$(( $(date +%s) - inicio ))" > "$TMP/ultimo-respaldo.json"
if [ -n "${RESPALDO_DESTINO_LOCAL:-}" ]; then
  cp "$TMP/ultimo-respaldo.json" "$RESPALDO_DESTINO_LOCAL/$PREFIJO/"
else
  aws s3 cp "$TMP/ultimo-respaldo.json" "s3://$RESPALDO_BUCKET/$PREFIJO/ultimo-respaldo.json" \
    --sse AES256 --only-show-errors || fallar "no se pudo subir ultimo-respaldo.json"
fi

registrar "listo en $(( $(date +%s) - inicio )) s: $NOMBRE"
