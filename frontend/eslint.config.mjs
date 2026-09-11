import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Configuración de ESLint del frontend.
 *
 * Hasta ahora no existía: el script `lint` apuntaba a `next lint`, comando
 * eliminado en Next 16, así que 179 archivos no se analizaban. La pérdida más
 * cara era `react-hooks/exhaustive-deps`, la regla que detecta los efectos con
 * dependencias mal declaradas.
 *
 * `eslint-config-next` 16 ya exporta flat config, así que se importa directo
 * sin `FlatCompat` (que además falla con esta versión por una referencia
 * circular en el plugin de React).
 */
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts', 'public/**'],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // ── Avisos, no bloqueos ────────────────────────────────────────────
      //
      // Este lint se activa sobre 179 archivos que nunca se habían analizado.
      // Si saliera en rojo desde el primer día volveríamos al punto de partida:
      // un comando que nadie ejecuta. Lo que hoy es `warn` queda VISIBLE y se
      // sanea por tandas; después se sube a `error`.

      // Bugs reales (efectos con dependencias incompletas, setState en efecto).
      // Se corrigen en la fase siguiente y entonces pasan a "error".
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',

      // Diagnósticos del React Compiler. Al activar el lint aparecieron 9
      // casos reales —leer `ref.current` durante el render y una llamada impura—
      // que violan las reglas de React y pueden dar resultados inconsistentes
      // en modo concurrente. Cada uno necesita mirarse por separado, así que se
      // dejan visibles como aviso y se arreglan en la fase siguiente.
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',

      // Cosméticos: comillas sin escapar en JSX y <img> en vez de <Image>.
      // No rompen nada; el segundo es una optimización pendiente.
      'react/no-unescaped-entities': 'warn',
      '@next/next/no-img-element': 'warn',

      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // next.config.js es CommonJS por necesidad del propio Next.
    files: ['next.config.js', '*.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
