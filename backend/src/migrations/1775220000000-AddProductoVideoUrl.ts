import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductoVideoUrl1775220000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productos" ADD COLUMN IF NOT EXISTS "video_url" varchar(500) NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "productos" DROP COLUMN IF EXISTS "video_url"`);
  }
}