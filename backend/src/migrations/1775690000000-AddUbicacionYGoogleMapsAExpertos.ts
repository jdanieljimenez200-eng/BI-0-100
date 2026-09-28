import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Añade campos de ubicación física y conexión con Google Maps a la tabla `expertos`:
 *  - direccion: dirección física, calle, número, colonia, taller u oficina
 *  - google_maps_url: enlace directo de Google Maps o enlace de compartir ubicación
 *  - latitud / longitud: coordenadas geográficas para geolocalización y mapas
 */
export class AddUbicacionYGoogleMapsAExpertos1775690000000 implements MigrationInterface {
  name = 'AddUbicacionYGoogleMapsAExpertos1775690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expertos"
        ADD COLUMN IF NOT EXISTS "direccion" varchar(255),
        ADD COLUMN IF NOT EXISTS "google_maps_url" varchar(500),
        ADD COLUMN IF NOT EXISTS "latitud" numeric(10, 7),
        ADD COLUMN IF NOT EXISTS "longitud" numeric(10, 7);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "expertos"
        DROP COLUMN IF EXISTS "longitud",
        DROP COLUMN IF EXISTS "latitud",
        DROP COLUMN IF EXISTS "google_maps_url",
        DROP COLUMN IF EXISTS "direccion";
    `);
  }
}
