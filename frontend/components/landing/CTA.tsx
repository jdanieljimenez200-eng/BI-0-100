'use client';

import { ArrowRight, Sparkles, Zap } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useRef } from 'react';

export default function CTA() {
  const ctaRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const buttonRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (titleRef.current) titleRef.current.classList.add('animate-in');
            if (descRef.current) {
              descRef.current.style.animationDelay = '0.2s';
              descRef.current.classList.add('animate-in');
            }
            if (buttonRef.current) {
              buttonRef.current.style.animationDelay = '0.4s';
              buttonRef.current.classList.add('animate-in');
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    if (ctaRef.current) observer.observe(ctaRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="relative py-24 px-4 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-900/20 via-pink-900/20 to-purple-900/20 animate-pulse"></div>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 right-20 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
      </div>

      <div ref={ctaRef} className="max-w-4xl mx-auto text-center relative z-10">
        <div className="inline-block mb-6 px-4 py-2 bg-purple-500/20 border border-purple-400/40 rounded-full">
          <p className="text-sm font-semibold text-purple-300 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Lanzamiento Especial
          </p>
        </div>

        <h2 ref={titleRef} className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 opacity-0 leading-tight">
          Transforma tu Idea en{' '}
          <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent">
            Realidad Validada
          </span>
        </h2>

        <p ref={descRef} className="text-xl text-gray-300 mb-12 opacity-0 max-w-2xl mx-auto leading-relaxed">
          No pierdas tiempo ni dinero en ideas que no funcionan. Valida tu concepto en minutos con análisis independientes respaldados por datos reales del mercado.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8 opacity-0" style={{ animationDelay: '0.4s' }}>
          <Link
            href="/auth/login?mode=signup"
            className="group px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-bold text-lg hover:shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 transform hover:scale-105 active:scale-95 inline-flex items-center justify-center gap-2"
          >
            <span>Valida tu primera idea</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <p className="text-gray-400 text-sm opacity-0 animate-in inline-flex items-center justify-center gap-2" style={{ animationDelay: '0.6s' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Acceso inmediato • Sin tarjeta de crédito • Análisis en menos de 3 minutos
        </p>
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

        @keyframes blob {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        .animate-in {
          animation: fadeInUp 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
        }

        .animate-blob {
          animation: blob 7s infinite;
        }

        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </section>
  );
}