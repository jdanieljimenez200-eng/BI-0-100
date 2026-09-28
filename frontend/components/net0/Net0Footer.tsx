import Link from 'next/link';

export default function Net0Footer() {
  return (
    <footer className="w-full bg-[#141416] border-t border-white/[0.08] py-8 text-xs font-sans text-zinc-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-zinc-300">Net0</span>
          <span>·</span>
          <span>Red abierta de especialistas, oficios y consultores</span>
        </div>

        <div className="flex items-center gap-6 text-zinc-400">
          <Link href="/terminos" className="hover:text-white transition-colors">
            Términos
          </Link>
          <Link href="/privacidad" className="hover:text-white transition-colors">
            Privacidad
          </Link>
          <Link href="/" className="hover:text-white transition-colors">
            Parte de BI 0 A 100
          </Link>
        </div>
      </div>
    </footer>
  );
}
