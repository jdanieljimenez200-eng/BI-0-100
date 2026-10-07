# Respaldos de la base de datos

Los negocios guardan aquí sus ventas, inventario, contabilidad y clientes. Si la
base se pierde (error humano, migración mala, cuenta del proveedor bloqueada o
borrada), sin respaldo se pierde todo. Este documento dice qué se respalda, cómo
se configura una vez, cómo se restaura y cómo se comprueba cada mes que se puede
restaurar.

## Resumen

| Qué | Cómo |
|---|---|
| Qué se respalda | La base PostgreSQL completa (`pg_dump`, formato custom): datos, índices, llaves foráneas, checks y triggers. |
| Cuándo | Diario a las 03:00 de Ciudad de México (09:00 UTC). |
| Dónde | Bucket S3 **separado** del de la app, en `bi0a100/diario/` y, el día 1 de cada mes, también en `bi0a100/mensual/`. |
| Cuánto tiempo | Diarios 35 días; mensuales 13 meses (regla de ciclo de vida del bucket). |
| Cifrado | Con [age](https://age-encryption.org) y una llave **pública**. La llave privada no está en ningún servidor: aunque alguien entre al servidor o al bucket, no puede leer los respaldos. Además, cifrado de S3 (`AES256`). |
| Verificación | Cada respaldo se lee de vuelta, debe traer las tablas clave (`usuarios`, `productos`, `ventas`, `venta_items`, `movimientos_contables`, `insumos_inventario`, `migrations`) y pesar más de 20 KB; si no, el trabajo falla y avisa. |
| Integridad | Junto a cada archivo va su suma SHA-256; la restauración se niega si no coincide. |
| Aviso de fallo | Opcional, a un webhook (Slack, Discord…) con `RESPALDO_AVISO_URL`. |
| Monitoreo | `bi0a100/ultimo-respaldo.json` guarda la fecha del último respaldo bueno: si tiene más de 26 horas, algo falló. |

Código: `scripts/respaldo/` (`respaldar.sh`, `restaurar.sh`, `Dockerfile`, `railway.toml`).

Esto es **adicional** a los respaldos propios del proveedor de la base (Neon:
historial de restauración; Railway: copias del volumen). Actívalos también. El
respaldo propio existe porque sirve aunque se pierda la cuenta del proveedor o
alguien borre el proyecto.

## Configuración inicial (una vez)

### 1. Llave de cifrado (en tu computadora, no en el servidor)

```bash
winget install FiloSottile.age          # Windows; en macOS: brew install age
age-keygen -o bi0a100-respaldos.key
```

- La línea `# public key: age1…` es la llave **pública**: va en la variable
  `RESPALDO_AGE_DESTINATARIO` del servicio de respaldo.
- El archivo `bi0a100-respaldos.key` es la llave **privada**. Guárdalo en dos
  lugares (gestor de contraseñas y una memoria USB guardada aparte). **Si se
  pierde, ningún respaldo se puede abrir.** Nunca lo subas al servidor, al
  repositorio ni al chat.

### 2. Bucket de S3 solo para respaldos

- Nombre sugerido: `bi0a100-respaldos`, en la misma región que la app.
- *Block Public Access*: todo activado. *Versioning*: activado. Cifrado por
  defecto: SSE-S3.
- Regla de ciclo de vida (Management → Lifecycle rules), o con la CLI:

```json
{
  "Rules": [
    { "ID": "diarios-35-dias", "Status": "Enabled",
      "Filter": { "Prefix": "bi0a100/diario/" },
      "Expiration": { "Days": 35 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 7 } },
    { "ID": "mensuales-13-meses", "Status": "Enabled",
      "Filter": { "Prefix": "bi0a100/mensual/" },
      "Expiration": { "Days": 400 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 7 } }
  ]
}
```

### 3. Usuario de AWS que solo puede escribir

Crea un usuario IAM para el respaldo con **solo** esta política. No puede leer
ni borrar: si sus llaves se filtran, nadie puede descargar ni destruir los
respaldos con ellas.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:PutObject",
    "Resource": "arn:aws:s3:::bi0a100-respaldos/bi0a100/*"
  }]
}
```

Para restaurar se usa otro usuario (o tu cuenta) con `s3:GetObject` sobre el
mismo prefijo, solo cuando hace falta.

### 4a. En Railway

Nuevo servicio desde este repositorio:

- **Root Directory**: `scripts/respaldo` (usa su `railway.toml`: corre a diario y termina).
- **Build argument** `PG_MAJOR`: la versión de Postgres de producción o una mayor
  (por defecto 17). `pg_dump` se niega a volcar un servidor más nuevo que él.
- **Variables**:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la de producción (referencia a la variable de la base) |
| `RESPALDO_BUCKET` | `bi0a100-respaldos` |
| `RESPALDO_AGE_DESTINATARIO` | la llave pública `age1…` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | las del usuario que solo escribe |
| `AWS_REGION` | la región del bucket |
| `RESPALDO_AVISO_URL` | opcional: webhook para avisar si falla |

Después del primer despliegue, ejecútalo a mano una vez («Run now») y revisa
que aparezcan el archivo y `ultimo-respaldo.json` en el bucket.

### 4b. En un servidor propio (docker-compose.prod.yml)

```bash
docker build --build-arg PG_MAJOR=17 -t bi0a100-respaldo scripts/respaldo
# /etc/cron.d/bi0a100-respaldo  (03:00 de CDMX = 09:00 UTC)
0 9 * * * root docker run --rm --env-file /opt/bi0a100/respaldo.env bi0a100-respaldo
```

`respaldo.env` lleva las mismas variables de la tabla de arriba, con permisos `600`.

## Restaurar

Nunca se restaura encima de una base con datos: el script se niega. Se
restaura en una base **nueva y vacía**, se revisa y luego se cambia la app a ella.

1. **Crea una base vacía** con la misma versión de Postgres que producción (en
   Neon, una rama nueva vacía o una base nueva; en Railway, un servicio
   Postgres nuevo).
2. **Restaura** (desde tu computadora, con la llave privada y credenciales de lectura):

```bash
docker build --build-arg PG_MAJOR=<versión de la base nueva> -t bi0a100-respaldo scripts/respaldo
docker run --rm \
  -e RESTAURAR_EN='postgresql://…/base_nueva' \
  -e DATABASE_URL='postgresql://…/base_actual' \
  -e RESPALDO_AGE_IDENTIDAD=/llaves/bi0a100-respaldos.key \
  -e AWS_ACCESS_KEY_ID=… -e AWS_SECRET_ACCESS_KEY=… -e AWS_REGION=… \
  -v /ruta/a/tus/llaves:/llaves:ro \
  bi0a100-respaldo restaurar.sh s3://bi0a100-respaldos/bi0a100/diario/bi0a100-AAAAMMDDTHHMMSSZ.dump.age
```

   El script verifica la suma SHA-256, descifra, restaura todo o nada
   (`--single-transaction`) e imprime cuántos usuarios, productos, ventas y
   movimientos quedaron, y la última migración.
3. **Revisa** los conteos y entra con una cuenta de prueba apuntando una copia
   de la app a la base nueva.
4. **Cambia** `DATABASE_URL` de la API y del worker a la base nueva y
   redespliega. Lo que se registró entre el respaldo y el cambio no está en la
   base nueva: avisa a los negocios afectados.

## Simulacro mensual

Un respaldo que nunca se restauró no es un respaldo. El primer lunes de cada mes:

1. Restaura el último respaldo diario en una base temporal vacía (pasos 1 y 2).
2. Compara los conteos con producción: deben coincidir hasta la hora del respaldo.
3. Anota aquí la fecha y el resultado, y borra la base temporal.

| Fecha | Respaldo | Resultado |
|---|---|---|
| 2026-10-07 | `bi0a100_db` local (desarrollo), Postgres 15 | Restaurado en una base vacía: las 53 tablas con las mismas filas, 212 índices, 108 llaves foráneas, 27 checks y 4 triggers. Se negó a: restaurar encima de una base con datos, restaurar en la base de `DATABASE_URL`, un archivo alterado (SHA-256), una llave equivocada, respaldar sin llave de cifrado y respaldar una base sin las tablas clave. |

## Qué no cubre

- **Archivos subidos** (logos, fotos, grabaciones) viven en el bucket de la app,
  no en la base: activa *Versioning* en ese bucket para poder recuperar un
  archivo borrado o sobrescrito.
- **Redis** no se respalda: guarda cachés, colas de trabajos y la lista de
  sesiones cerradas. Si se pierde, los análisis que estaban en cola hay que
  lanzarlos de nuevo y una sesión cerrada vuelve a valer hasta que caduca su
  token (15 minutos); no se pierden ventas, inventario ni contabilidad.
