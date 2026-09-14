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
