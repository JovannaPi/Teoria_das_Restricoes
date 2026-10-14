// Gráficos simples em canvas para o painel de análise. Marcas finas, eixos discretos,
// rótulos diretos e dica (tooltip) ao passar o mouse.

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

const INK = '#efe3cc';
const MUTED = '#a8977f';
const GRID = 'rgba(239,227,204,0.10)';
const SURFACE = '#1c1424';

function setup(canvas: HTMLCanvasElement, h: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 560;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, w, h);
  ctx.font = '11px system-ui, sans-serif';
  return { ctx, w, h };
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** Gráfico de linhas com eixo x de tempo (segundos de simulação → relógio). */
export function lineChart(
  canvas: HTMLCanvasElement,
  xs: number[],
  series: LineSeries[],
  opts: { height?: number; integer?: boolean; xFmt: (x: number) => string; yFmt?: (v: number) => string },
): void {
  const { ctx, w, h } = setup(canvas, opts.height ?? 200);
  const padL = 36;
  const padR = 92;
  const padT = 12;
  const padB = 22;
  const yFmt = opts.yFmt ?? ((v: number) => String(Math.round(v)));
  let max = 0;
  for (const s of series) for (const v of s.values) max = Math.max(max, v);
  max = opts.integer ? Math.max(4, Math.ceil(niceMax(max))) : niceMax(max);
  const x0 = xs[0] ?? 0;
  const x1 = xs[xs.length - 1] ?? 1;
  const X = (x: number) => padL + ((x - x0) / Math.max(1e-6, x1 - x0)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  ctx.strokeStyle = GRID;
  ctx.fillStyle = MUTED;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    if (opts.integer && Math.abs(v - Math.round(v)) > 1e-9) continue;
    const y = Math.round(Y(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(w - padR, y);
    ctx.stroke();
    ctx.fillText(yFmt(v), 4, y + 4);
  }
  for (let i = 0; i <= 4; i++) {
    const x = x0 + ((x1 - x0) * i) / 4;
    ctx.fillText(opts.xFmt(x), X(x) - 14, h - 6);
  }
  // linhas
  const ends: { y: number; s: LineSeries }[] = [];
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = X(xs[i]);
      const y = Y(v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    if (s.values.length) ends.push({ y: Y(s.values[s.values.length - 1]), s });
  }
  // rótulos diretos no fim de cada linha (evitando sobreposição)
  ends.sort((a, b) => a.y - b.y);
  const pos: number[] = [];
  let last = -100;
  for (const e of ends) {
    last = Math.max(e.y, last + 12);
    pos.push(last);
  }
  // se os rótulos passarem do fundo, empurra o grupo para cima
  let limit = h - padB;
  for (let i = pos.length - 1; i >= 0; i--) {
    if (pos[i] > limit) pos[i] = limit;
    limit = pos[i] - 12;
  }
  for (let i = 0; i < ends.length; i++) {
    const e = ends[i];
    const y = pos[i];
    ctx.fillStyle = e.s.color;
    ctx.fillRect(w - padR + 6, y - 4, 8, 2);
    ctx.fillStyle = INK;
    ctx.fillText(e.s.name, w - padR + 18, y);
  }
  // dica ao passar o mouse
  // dica por toque ou mouse (eventos de ponteiro cobrem os dois)
  canvas.style.touchAction = 'pan-y';
  canvas.onpointerdown = canvas.onpointermove = (ev) => {
    const r = canvas.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    let best = 0;
    let bd = Infinity;
    xs.forEach((x, i) => {
      const d = Math.abs(X(x) - mx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    const tip = canvas.parentElement?.querySelector('.chart-tip') as HTMLElement | null;
    if (!tip) return;
    tip.style.display = 'block';
    tip.style.left = Math.min(r.width - 150, Math.max(0, X(xs[best]) + 8)) + 'px';
    tip.innerHTML =
      `<b>${opts.xFmt(xs[best])}</b>` +
      series.map((s) => `<div><i style="background:${s.color}"></i>${s.name}: ${yFmt(s.values[best] ?? 0)}</div>`).join('');
  };
  canvas.onpointerleave = (ev) => {
    // no toque, o valor fica visível até o próximo toque
    if (ev.pointerType === 'touch') return;
    const tip = canvas.parentElement?.querySelector('.chart-tip') as HTMLElement | null;
    if (tip) tip.style.display = 'none';
  };
}

/** Barras horizontais (uma por categoria), com valor escrito ao lado. */
export function barChart(
  canvas: HTMLCanvasElement,
  items: { label: string; value: number; color: string; note?: string }[],
  opts: { max?: number; fmt: (v: number) => string; height?: number; marker?: number; markerLabel?: string },
): void {
  const rowH = 26;
  const { ctx, w, h } = setup(canvas, opts.height ?? items.length * rowH + 24);
  const padL = 100;
  const padR = 64;
  const max = opts.max ?? niceMax(Math.max(...items.map((i) => i.value), 0.0001));
  const X = (v: number) => padL + (Math.min(v, max) / max) * (w - padL - padR);
  items.forEach((it, i) => {
    const y = 8 + i * rowH;
    ctx.fillStyle = INK;
    ctx.fillText(it.label, 6, y + 13);
    ctx.fillStyle = 'rgba(239,227,204,0.06)';
    ctx.fillRect(padL, y + 4, w - padL - padR, 12);
    ctx.fillStyle = it.color;
    const bw = Math.max(2, X(it.value) - padL);
    ctx.beginPath();
    ctx.moveTo(padL, y + 4);
    ctx.lineTo(padL + bw - 3, y + 4);
    ctx.quadraticCurveTo(padL + bw, y + 4, padL + bw, y + 7);
    ctx.lineTo(padL + bw, y + 13);
    ctx.quadraticCurveTo(padL + bw, y + 16, padL + bw - 3, y + 16);
    ctx.lineTo(padL, y + 16);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillText(opts.fmt(it.value) + (it.note ? ' ' + it.note : ''), X(it.value) + 6, y + 14);
  });
  if (opts.marker != null) {
    const x = Math.round(X(opts.marker)) + 0.5;
    ctx.strokeStyle = MUTED;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, h - 14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = MUTED;
    if (opts.markerLabel) ctx.fillText(opts.markerLabel, x - 20, h - 2);
  }
}
