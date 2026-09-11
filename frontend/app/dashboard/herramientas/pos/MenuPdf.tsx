'use client';

import type { TaxConfig } from '@/lib/taxConfig';

export interface MenuItem {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number | string;
  categoria: string | null;
  emoji: string | null;
  activo: boolean;
}

export interface MenuPdfProps {
  items: MenuItem[];
  negocioNombre: string;
  negocioEmoji?: string | null;
  slogan?: string | null;
  productoNombre?: string | null;
  telefonoContacto?: string | null;
  paletaColores?: {
    primario?: string;
    secundario?: string;
    acento?: string;
  } | null;
  taxCfg: Pick<TaxConfig, 'simbolo' | 'moneda' | 'locale' | 'nombre'> & {
    consumo: { nombre: string; tasa: number };
  };
  fechaGeneracion?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  return s.trim().split(/\s+/).map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w).join(' ');
}

function formatPrecio(precio: number, locale: string, simbolo: string): string {
  return `${simbolo}${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(precio)}`;
}

/** Escapa texto controlado por el usuario antes de inyectarlo en el HTML del menú (previene XSS). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&';
      case '<': return '<';
      case '>': return '>';
      case '"': return '"';
      default:  return '&#39;';
    }
  });
}

function groupByCategoria(items: MenuItem[]): Array<{ categoria: string; items: MenuItem[] }> {
  const sinCategoria = 'Otros';
  const map = new Map<string, { display: string; items: MenuItem[] }>();
  for (const it of items) {
    const raw = (it.categoria ?? '').trim();
    const key = raw ? raw.toLowerCase() : '__sin_cat__';
    const display = raw ? toTitleCase(raw) : sinCategoria;
    const existing = map.get(key);
    if (existing) existing.items.push(it);
    else map.set(key, { display, items: [it] });
  }
  return Array.from(map.values())
    .sort((a, b) => {
      if (a.display === sinCategoria) return 1;
      if (b.display === sinCategoria) return -1;
      return a.display.localeCompare(b.display);
    })
    .map(({ display, items }) => ({ categoria: display, items }));
}

// ─── HTML generator ───────────────────────────────────────────────────────────

export function abrirMenuPdf(props: MenuPdfProps): void {
  const primario   = props.paletaColores?.primario   || '#0EA5E9';
  const acento     = props.paletaColores?.acento     || '#10B981';
  const secundario = props.paletaColores?.secundario || '#0F172A';

  const grupos = groupByCategoria(props.items.filter(i => i.activo));
  const fecha = props.fechaGeneracion ?? new Date().toLocaleDateString(props.taxCfg.locale, {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const gruposHtml = grupos.length === 0
    ? `<p style="text-align:center;color:#94a3b8;padding:40px 0;">Aún no hay items activos en el catálogo</p>`
    : grupos.map(g => `
      <div class="cat-section">
        <div class="cat-header">
          <span class="cat-dot" style="background:${acento}"></span>
          <span class="cat-name">${escapeHtml(g.categoria)}</span>
        </div>
        ${g.items.map(item => `
          <div class="item-row">
            <span class="item-emoji">${item.emoji ? escapeHtml(item.emoji) : '•'}</span>
            <div class="item-center">
              <div class="item-name">${escapeHtml(item.nombre)}</div>
              ${item.descripcion ? `<div class="item-desc">${escapeHtml(item.descripcion)}</div>` : ''}
            </div>
            <div class="item-price-block">
              <div class="item-price" style="color:${acento}">${formatPrecio(Number(item.precio), props.taxCfg.locale, props.taxCfg.simbolo)}</div>
              <div class="item-moneda">${props.taxCfg.moneda}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

  const html = `<!DOCTYPE html><html lang="es"><head>
    <meta charset="utf-8"/>
    <title>Menú · ${escapeHtml(props.negocioNombre)}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #0f172a; background: #fff; padding: 48px; max-width: 780px; margin: 0 auto; }
      .header { border-bottom: 2px solid ${primario}; padding-bottom: 16px; margin-bottom: 28px; }
      .eyebrow { font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: ${primario}; font-weight: 700; margin-bottom: 6px; }
      .brand-name { font-size: 28px; font-weight: 700; color: ${secundario}; letter-spacing: -0.5px; }
      .slogan { font-size: 11px; color: #64748b; margin-top: 4px; font-style: italic; }
      .cat-section { margin-bottom: 20px; }
      .cat-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
      .cat-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
      .cat-name { font-size: 12px; font-weight: 700; color: ${secundario}; letter-spacing: 0.5px; text-transform: uppercase; }
      .item-row { display: flex; align-items: flex-start; gap: 8px; padding: 9px 0; border-bottom: 0.5px solid #e2e8f0; }
      .item-emoji { font-size: 16px; width: 24px; flex-shrink: 0; margin-top: 1px; }
      .item-center { flex: 1; }
      .item-name { font-size: 12px; font-weight: 700; color: ${secundario}; margin-bottom: 2px; }
      .item-desc { font-size: 9.5px; color: #64748b; line-height: 1.4; }
      .item-price-block { text-align: right; flex-shrink: 0; min-width: 90px; }
      .item-price { font-size: 13px; font-weight: 700; }
      .item-moneda { font-size: 8px; color: #94a3b8; margin-top: 1px; }
      .footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
      .contact { font-size: 9.5px; font-weight: 700; color: ${secundario}; }
      .powered { font-size: 7.5px; color: #94a3b8; letter-spacing: 1px; text-transform: uppercase; }
      @media print { body { padding: 24px; } }
    </style>
  </head><body>
    <div class="header">
      <div class="eyebrow">Catálogo · ${fecha}</div>
      <div class="brand-name">${props.negocioEmoji ? escapeHtml(props.negocioEmoji) + '  ' : ''}${escapeHtml(props.negocioNombre)}</div>
      ${props.slogan ? `<div class="slogan">${escapeHtml(props.slogan)}</div>` : props.productoNombre ? `<div class="slogan">${escapeHtml(props.productoNombre)}</div>` : ''}
    </div>
    ${gruposHtml}
    <div class="footer">
      <div class="contact">
        ${props.telefonoContacto ? `Tel. ${escapeHtml(props.telefonoContacto)} · ` : ''}
        Precios incluyen ${props.taxCfg.consumo.nombre} ${Math.round(props.taxCfg.consumo.tasa * 100)}% · ${props.taxCfg.nombre}
      </div>
      <div class="powered">BI 0 A 100</div>
    </div>
  </body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}
