'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const MODULE_DETAILS = {
  mercado: {
    name: 'Mercado',
    color: 'from-orange-500/20 to-orange-600/10',
    borderColor: 'border-orange-500/30',
    items: [
      'Tamaño total del mercado (TAM)',
      'Mercado direccionable (SAM)',
      'Porción realista alcanzable (SOM)',
      'Top 3 competidores directos',
      'Tendencias de crecimiento sectorial',
      'Análisis FODA competitivo',
      'Ventajas diferenciadoras clave',
      'Barreras de entrada y riesgos',
    ],
  },
  marketing: {
    name: 'Marketing',
    color: 'from-rose-500/20 to-rose-600/10',
    borderColor: 'border-rose-500/30',
    items: [
      '3 ángulos de posicionamiento',
      'Calendario de lanzamiento de 14 días',
      'Estrategia de comunicación multicanal',
      'Mensajes clave por audiencia',
      'Canales digitales recomendados',
      'Copy y titulares optimizados',
      'Plan de alianzas estratégicas',
      'Métricas y KPIs de adquisición',
    ],
  },
  ventas: {
    name: 'Ventas',
    color: 'from-cyan-500/20 to-cyan-600/10',
    borderColor: 'border-cyan-500/30',
    items: [
      'Segmentación de clientes (3 perfiles ICP)',
      'Estructura de precios dinámicos',
      'Proyección semestral de ingresos',
      'Canales de conversión óptimos',
      'Márgenes de contribución por canal',
      'Plan de escalamiento comercial',
      'Proyección de CAC y LTV',
      'Protocolos y tácticas de cierre',
    ],
  },
  finanzas: {
    name: 'Finanzas',
    color: 'from-emerald-500/20 to-emerald-600/10',
    borderColor: 'border-emerald-500/30',
    items: [
      'Proyección financiera a 12 meses',
      'Punto de equilibrio operativo (Break-even)',
      'Flujo de caja mensual',
      'Estado de resultados proyectado',
      'Simulador de 3 escenarios de tracción',
      'Estructura de capital inicial requerido',
      'Retorno de inversión proyectado (ROI)',
      'Matriz de riesgo financiero',
    ],
  },
  legal: {
    name: 'Legal',
    color: 'from-violet-500/20 to-violet-600/10',
    borderColor: 'border-violet-500/30',
    items: [
      'Estructura societaria recomendada',
      'Licencias y permisos normativos requeridos',
      'Marco regulatorio y tributario',
      'Protección de propiedad intelectual',
      'Modelos contractuales y términos clave',
      'Políticas de privacidad y datos personales',
      'Obligaciones fiscales aplicables',
      'Lista de verificación de cumplimiento',
    ],
  },
  brief: {
    name: 'Brief',
    color: 'from-indigo-500/20 to-indigo-600/10',
    borderColor: 'border-indigo-500/30',
    items: [
      'Resumen ejecutivo de una página',
      'Propuesta de valor diferencial',
      'Matriz Problema y Solución',
      'Casos de uso principales',
      'Perfil de usuario ideal (Buyer Persona)',
      'Síntesis del modelo de negocio',
      'Estrategia de entrada al mercado (GTM)',
      'Cronograma operativo de primeros 90 días',
    ],
  },
};

export const HeroModulesExpanded = () => {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggleExpand = (moduleId: string) => {
    setExpanded(expanded === moduleId ? null : moduleId);
  };

  return (
    <section className="relative w-full py-24 overflow-hidden bg-gradient-to-b from-transparent to-black/30">
      <div className="relative z-10 w-full px-4 md:px-8 max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-4 text-center tracking-tight">
          Explora qué incluye cada módulo
        </h2>
        <p className="text-center text-white/50 mb-12">
          Haz clic en cualquier tarjeta para ver el detalle completo de cada análisis
        </p>

        {/* Grid de módulos expandibles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(MODULE_DETAILS).map(([id, module]) => (
            <div
              key={id}
              onClick={() => toggleExpand(id)}
              className={`cursor-pointer transition-all duration-300 rounded-2xl border overflow-hidden ${
                expanded === id
                  ? `bg-gradient-to-br ${module.color} ${module.borderColor} border-opacity-100`
                  : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
              }`}
            >
              {/* Header */}
              <div className="p-5 flex items-center justify-between">
                <span className="text-lg font-bold text-white">{module.name}</span>
                <ChevronDown
                  size={20}
                  className={`transition-transform duration-300 ${
                    expanded === id ? 'rotate-180' : ''
                  }`}
                />
              </div>

              {/* Content expandible */}
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  expanded === id ? 'max-h-96' : 'max-h-0'
                }`}
              >
                <div className="px-5 pb-5 border-t border-white/10">
                  <ul className="space-y-2.5 pt-2">
                    {module.items.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2.5 text-sm text-white/70">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-accent/80 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};