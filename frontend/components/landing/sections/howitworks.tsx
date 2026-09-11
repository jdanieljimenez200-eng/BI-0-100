'use client';

import React, { useEffect, useRef } from 'react';
import { Upload, Zap, FileText } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    title: 'Sube tu producto',
    description: 'Describe tu idea, mercado y modelo de negocio en 2 minutos',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Zap,
    title: 'Recibe análisis',
    description: 'Nuestro sistema genera 5 análisis independientes al instante',
    color: 'from-yellow-500 to-orange-500',
  },
  {
    icon: FileText,
    title: 'Toma decisiones',
    description: 'Exporta reportes y ajusta tu estrategia con datos reales',
    color: 'from-purple-500 to-pink-500',
  },
];

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const stepsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (titleRef.current) {
              titleRef.current.classList.add('animate-in');
            }

            stepsRef.current.forEach((step, index) => {
              if (step) {
                const delay = index * 0.15;
                step.style.animationDelay = `${delay}s`;
                step.classList.add('animate-in');
              }
            });
          }
        });
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-20 px-4 relative bg-gradient-to-b from-black/20 to-transparent">
      <div className="max-w-6xl mx-auto">
        <h2 
          ref={titleRef}
          className="text-4xl sm:text-5xl font-bold text-center mb-16 opacity-0"
        >
          3 Pasos Simples
        </h2>

        <div ref={sectionRef} className="grid md:grid-cols-3 gap-8 relative">
          {/* Connection lines */}
          <div className="absolute hidden md:block top-24 left-1/4 right-1/4 h-1 bg-gradient-to-r from-transparent via-purple-500/30 to-transparent"></div>

          {STEPS.map((step, i) => (
            <div
              key={i}
              ref={(el) => {
                if (el) stepsRef.current[i] = el;
              }}
              className="relative opacity-0 group"
            >
              {/* Step card */}
              <div className="relative z-10 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-400/20 rounded-2xl p-8 hover:border-purple-400/60 transition-all duration-300 hover:shadow-xl hover:shadow-purple-500/20">
                {/* Step number circle */}
                <div className={`absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center font-bold text-xl shadow-lg group-hover:scale-125 transition-transform duration-300`}>
                  {i + 1}
                </div>

                <div className={`mb-6 p-4 bg-gradient-to-br ${step.color} rounded-xl w-fit group-hover:scale-110 transition-transform duration-300 mx-auto shadow-lg`}>
                  <step.icon className="w-6 h-6 text-white" />
                </div>

                <h3 className="text-xl font-bold mb-3 text-center">{step.title}</h3>
                <p className="text-gray-400 text-center text-sm group-hover:text-gray-200 transition-colors duration-300">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-in {
          animation: fadeInUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>
    </section>
  );
}