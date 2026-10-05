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
 * Secretos de firma solo para la suite, si el entorno no trae los suyos. Sin
 * ellos el alta respondía 500 y fallaban ~280 tests de integración que no
 * tenían nada roto (dependían de que el shell exportara las variables).
 */
process.env.JWT_SECRET ??= 'secreto-solo-para-tests-jwt-0000000000000000';
process.env.JWT_REFRESH_SECRET ??= 'secreto-solo-para-tests-refresh-000000000000';

/**
 * La suite corre SIEMPRE contra el esquema de las migraciones, como en CI.
 *
 * `config/database.ts` activaba synchronize fuera de producción salvo que
 * llegara TYPEORM_SYNCHRONIZE=false. Un `npm test` local sin esa variable
 * sincronizaba la base de test con las entidades: borraba las CHECK y rehacía
 * las FK de las migraciones, y los tests que las comprueban (roles de admin,
 * purga de la papelera) fallaban sin que el código hubiera cambiado. Desde el
 * 2026-09-27 `synchronize` es `false` siempre; la variable se deja por si
 * alguien reintroduce un interruptor.
 */
process.env.TYPEORM_SYNCHRONIZE = 'false';
