/**
 * Sanitiza inputs de usuario antes de interpolarlos en un prompt enviado a un LLM.
 *
 * Mitiga tres clases de ataque:
 *   1. Prompt injection directa  (frases tipo "ignore previous instructions").
 *   2. Jailbreaks con delimitadores  (</user_input>, <system>, triple backticks).
 *   3. Template injection  (expansión accidental de {{...}} o ${...} en backends
 *      que después pasen el string por otro motor de plantillas).
 *
 * No sustituye a una validación Zod previa: es una segunda capa de defensa.
 */

// Patrones conocidos de prompt injection. Se sustituyen por [REDACTED].
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions|prompts|rules)/gi,
  /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|system|prompt)/gi,
  /you\s+are\s+now\s+(a|an|the)\s+/gi,
  /forget\s+(everything|all|your)\s+(above|previous|prior|instructions)/gi,
  /new\s+(instructions|system\s+prompt|rules)\s*:/gi,
  /system\s*:\s*override/gi,
  /\bact\s+as\s+(if|though|a)\b/gi,
  /\bprompt\s*:\s*["'[]/gi,
  /\bassistant\s*:\s*["'[]/gi,
];

// Delimitadores peligrosos: se escapan para que Claude no los confunda con la
// estructura real del prompt.
const DANGEROUS_TOKENS: Array<[RegExp, string]> = [
  [/<\/?\s*(user_input|system|assistant|human|tool_use|instructions?)[^>]*>/gi, ''],
  [/```+/g, "'''"],
  [/\{\{\s*[^}]+\s*\}\}/g, '[...]'],
  [/\$\{[^}]+\}/g, '[...]'],
];

// Rango de caracteres de control no imprimibles (C0 + DEL), preserva \t (\x09)
// y \n (\x0A) para mantener formato útil.
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export interface SanitizeOptions {
  /** Máximo de caracteres permitidos. Default 500. */
  maxLen?: number;
  /** Si true, colapsa 3+ saltos de línea a dos. Default true. */
  collapseNewlines?: boolean;
  /** Si true, reemplaza tokens peligrosos por marcadores. Default true. */
  stripDangerous?: boolean;
}

export function sanitizeForLLM(input: unknown, opts: SanitizeOptions = {}): string {
  if (input === null || input === undefined) return '';
  const raw = typeof input === 'string' ? input : String(input);

  const maxLen = opts.maxLen ?? 500;
  const collapseNewlines = opts.collapseNewlines ?? true;
  const stripDangerous = opts.stripDangerous ?? true;

  let s = raw.slice(0, maxLen);
  s = s.replace(CONTROL_CHARS_RE, '');

  if (stripDangerous) {
    for (const pattern of INJECTION_PATTERNS) s = s.replace(pattern, '[REDACTED]');
    for (const [pattern, replacement] of DANGEROUS_TOKENS) s = s.replace(pattern, replacement);
  }

  if (collapseNewlines) s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

/**
 * Sanitiza un array de strings y filtra vacíos después del saneamiento.
 */
export function sanitizeArrayForLLM(
  input: unknown,
  opts: SanitizeOptions & { maxItems?: number } = {}
): string[] {
  if (!Array.isArray(input)) return [];
  const maxItems = opts.maxItems ?? 20;
  return input
    .slice(0, maxItems)
    .map((item) => sanitizeForLLM(item, opts))
    .filter((s) => s.length > 0);
}
