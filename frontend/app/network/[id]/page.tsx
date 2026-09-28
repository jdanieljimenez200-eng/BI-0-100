'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function NetworkDetailRedirect() {
  const router = useRouter();
  const params = useParams();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  useEffect(() => {
    if (id) {
      router.replace(`/dashboard/net0/${id}`);
    } else {
      router.replace('/dashboard/net0');
    }
  }, [router, id]);

  return (
    <div className="min-h-screen bg-[#070E17] flex items-center justify-center text-zinc-400">
      <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
    </div>
  );
}
