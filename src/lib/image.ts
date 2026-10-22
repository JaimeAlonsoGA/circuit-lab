/** Snapshot the live canvas as a standalone SVG / PNG (styles inlined, UI chrome removed). */
const STYLE_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'] as const;

function canvasSvg(): SVGSVGElement {
  const svg = document.querySelector<SVGSVGElement>('svg[data-testid="canvas"]');
  if (!svg) throw new Error('canvas not found');
  return svg;
}

export function exportSvg(pad = 30): string {
  const svg = canvasSvg();
  const world = svg.querySelector<SVGGElement>('g[data-world]');
  if (!world) throw new Error('nothing to export');
  const box = world.getBBox();
  if (!box.width) throw new Error('the canvas is empty');
  const clone = svg.cloneNode(true) as SVGSVGElement;
  // inline computed styles so CSS-module classes survive outside the app
  const src = svg.querySelectorAll<SVGElement>('*');
  const dst = clone.querySelectorAll<SVGElement>('*');
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const d = dst[i];
    for (const p of STYLE_PROPS) { const v = cs.getPropertyValue(p); if (v) d.style.setProperty(p, v); }
    if (cs.filter && cs.filter !== 'none' && !cs.filter.startsWith('url')) d.style.removeProperty('filter');
    d.removeAttribute('class');
  });
  clone.querySelectorAll('[data-noexport]').forEach((n) => n.remove());
  const cw = clone.querySelector('g[data-world]')!;
  cw.removeAttribute('transform');
  const vb = [box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2];
  clone.setAttribute('viewBox', vb.join(' '));
  clone.setAttribute('width', String(Math.round(vb[2])));
  clone.setAttribute('height', String(Math.round(vb[3])));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  for (const a of ['class', 'role', 'aria-label', 'data-testid', 'data-dragging', 'style']) clone.removeAttribute(a);
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  Object.entries({ x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: '#0b0e1a' }).forEach(([k, v]) => bg.setAttribute(k, String(v)));
  clone.insertBefore(bg, cw);
  return new XMLSerializer().serializeToString(clone).replace(/var\(--[\w-]+\)/g, '#4cc9f0');
}

export async function exportPng(scale = 2): Promise<Blob> {
  const text = exportSvg();
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('render failed')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width * scale; c.height = img.height * scale;
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    g.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
