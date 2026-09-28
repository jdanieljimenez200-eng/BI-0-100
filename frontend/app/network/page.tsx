'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NetworkRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/net0');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#070E17] flex items-center justify-center text-zinc-400">
      <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
    </div>
  );
}
