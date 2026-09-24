/**
 * Entorno común de la suite (se carga antes de cada archivo de test).
 *
 * Los límites por IP (altas, login, API) protegen producción, pero en la suite
 * todas las peticiones salen de la misma IP: con `--runInBand` las ~60 altas de
 * los tests de red y admin agotaban el límite de 10 altas por hora y fallaban
 * suites que no tenían nada roto. Los bloqueos por cuenta (intentos de login,
 * códigos TOTP) no dependen de esto y sus tests siguen comprobándolos.
 */
process.env.RATE_LIMIT_DISABLED = 'true';

/**
 * La suite corre SIEMPRE contra el esquema de las migraciones, como en CI.
 *
 * `config/database.ts` activa synchronize fuera de producción salvo que llegue
 * TYPEORM_SYNCHRONIZE=false. Un `npm test` local sin esa variable sincronizaba
 * la base de test con las entidades: borraba las CHECK y rehacía las FK de las
 * migraciones, y los tests que las comprueban (roles de admin, purga de la
 * papelera) empezaban a fallar sin que el código hubiera cambiado.
 */
process.env.TYPEORM_SYNCHRONIZE = 'false';
