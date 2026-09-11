'use client';

import React from 'react';
import Hero from './Hero';
import Modules from './Modules';
import HowItWorks from './HowItWorks';
import Pricing from './Pricing';
import CTA from './CTA';
import Footer from './Footer';

export default function Landing() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-900 to-slate-950 overflow-hidden">
      <Hero />
      <Modules />
      <HowItWorks />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}