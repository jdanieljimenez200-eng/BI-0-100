#!/bin/sh
# Restaura un respaldo de BI 0 A 100 en una base NUEVA Y VACÍA y comprueba
# que llegó completo. Nunca escribe encima de una base con datos: para volver
# a un respaldo en producción se restaura en una base nueva, se revisa y se
# cambia DATABASE_URL de la app (ver docs/deployment/RESPALDOS.md).
#
# Uso:
#   restaurar.sh <archivo local | s3://bucket/ruta/bi0a100-….dump[.age]>
#
# Variables:
#   RESTAURAR_EN             base destino (obligatoria), vacía
#   RESPALDO_AGE_IDENTIDAD   archivo con la llave PRIVADA de age, si el respaldo
#                            está cifrado (.age). Se guarda fuera del servidor.
#   DATABASE_URL             si está definida y coincide con RESTAURAR_EN, se niega
#   AWS_*                    para descargar de S3
set -eu

registrar() { printf '%s [restaurar] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fallar() { registrar "ERROR: $*"; exit 1; }

ORIGEN="${1:-}"
[ -n "$ORIGEN" ] || fallar "uso: restaurar.sh <archivo local | s3://…/bi0a100-….dump[.age]>"
: "${RESTAURAR_EN:?Falta RESTAURAR_EN (una base nueva y vacía)}"

if [ -n "${DATABASE_URL:-}" ] && [ "$DATABASE_URL" = "$RESTAURAR_EN" ]; then
  fallar "RESTAURAR_EN es la misma base que DATABASE_URL: restaura en una base nueva y luego cambia DATABASE_URL"
fi

tablas=$(psql "$RESTAURAR_EN" -v ON_ERROR_STOP=1 -tAc \
  "select count(*) from information_schema.tables where table_schema = 'public'") \
  || fallar "no me puedo conectar a RESTAURAR_EN"
[ "$tablas" = "0" ] || fallar "la base destino ya tiene $tablas tablas: usa una base nueva y vacía"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
NOMBRE="$(basename "$ORIGEN")"
ARCHIVO="$TMP/$NOMBRE"

case "$ORIGEN" in
  s3://*)
    registrar "descargando $ORIGEN"
    aws s3 cp "$ORIGEN" "$ARCHIVO" --only-show-errors || fallar "no se pudo descargar $ORIGEN"
    aws s3 cp "$ORIGEN.sha256" "$ARCHIVO.sha256" --only-show-errors 2>/dev/null || true
    ;;
  *)
    [ -f "$ORIGEN" ] || fallar "no existe $ORIGEN"
    cp "$ORIGEN" "$ARCHIVO"
    [ -f "$ORIGEN.sha256" ] && cp "$ORIGEN.sha256" "$ARCHIVO.sha256"
    ;;
esac

# Integridad: el archivo es exactamente el que se subió.
if [ -f "$ARCHIVO.sha256" ]; then
  esperado=$(awk '{print $1}' "$ARCHIVO.sha256")
  real=$(sha256sum "$ARCHIVO" | awk '{print $1}')
  [ "$esperado" = "$real" ] || fallar "la suma SHA-256 no coincide: el archivo está dañado o no es el original"
  registrar "suma SHA-256 verificada"
else
  registrar "AVISO: sin archivo .sha256; no se pudo verificar la integridad"
fi

DUMP="$ARCHIVO"
case "$NOMBRE" in
  *.age)
    : "${RESPALDO_AGE_IDENTIDAD:?El respaldo está cifrado: define RESPALDO_AGE_IDENTIDAD (archivo de la llave privada)}"
    DUMP="$TMP/${NOMBRE%.age}"
    age -d -i "$RESPALDO_AGE_IDENTIDAD" -o "$DUMP" "$ARCHIVO" || fallar "no se pudo descifrar (¿llave equivocada?)"
    registrar "descifrado"
    ;;
esac

pg_restore --list "$DUMP" > /dev/null || fallar "el archivo no es un volcado válido"

registrar "restaurando (todo o nada)"
pg_restore --no-owner --no-privileges --single-transaction --exit-on-error \
  --dbname="$RESTAURAR_EN" "$DUMP" || fallar "pg_restore falló; la base destino quedó como estaba"

registrar "conteo de lo restaurado:"
psql "$RESTAURAR_EN" -v ON_ERROR_STOP=1 -tA -F ' ' -c "
  select 'usuarios', count(*) from usuarios
  union all select 'productos', count(*) from productos
  union all select 'ventas', count(*) from ventas
  union all select 'venta_items', count(*) from venta_items
  union all select 'movimientos_contables', count(*) from movimientos_contables
  union all select 'insumos_inventario', count(*) from insumos_inventario
  union all select 'migraciones', count(*) from migrations" | sed 's/^/  /'
ultima=$(psql "$RESTAURAR_EN" -tAc "select name from migrations order by timestamp desc limit 1")
registrar "última migración: $ultima"
registrar "listo. Revisa los conteos y, si todo está bien, apunta la app a esta base."
