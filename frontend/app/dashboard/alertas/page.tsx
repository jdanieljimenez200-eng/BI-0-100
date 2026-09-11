import { redirect } from 'next/navigation';

// El panel de Alertas se convirtió en "Progreso" (historial + contexto entre
// análisis, además del diagnóstico en vivo que ya tenía). Redirect permanente
// para no romper enlaces/marcadores guardados con la URL anterior.
export default function AlertasRedirectPage() {
  redirect('/dashboard/progreso');
}
