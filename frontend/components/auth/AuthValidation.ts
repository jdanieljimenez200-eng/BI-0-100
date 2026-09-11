// Alineado con el backend (`backend/src/routes/auth.ts`): mínimo 8
// caracteres, mayúscula, número y símbolo — antes el código solo exigía 6
// caracteres sin complejidad mientras el copy de signup/reset-password ya
// prometía la política completa.
export const MIN_PASSWORD_LENGTH = 8;

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const getPasswordStrength = (password: string): number => {
  if (!password) return 0;
  if (password.length < MIN_PASSWORD_LENGTH) return 1;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  if (hasUpperCase && hasNumber && hasSpecial) return 4;
  if (hasUpperCase || hasNumber) return 3;
  return 2;
};

export const getEmailError = (email: string, touched: boolean): string => {
  if (!touched) return '';
  if (!email) return 'El email es requerido';
  if (!validateEmail(email)) return 'Email inválido';
  return '';
};

export const getPasswordError = (password: string, touched: boolean): string => {
  if (!touched) return '';
  if (!password) return 'La contraseña es requerida';
  if (password.length < MIN_PASSWORD_LENGTH) return `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`;
  if (!/[A-Z]/.test(password)) return 'Debe incluir al menos una mayúscula';
  if (!/[0-9]/.test(password)) return 'Debe incluir al menos un número';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Debe incluir al menos un símbolo';
  return '';
};