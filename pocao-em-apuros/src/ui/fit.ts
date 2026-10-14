// Celular com "Site para computador" ligado (Chrome/Android): o navegador ignora a meta viewport,
// desenha a página com ~980 px de largura e a encolhe para caber na tela. Tudo fica minúsculo
// e as regras de celular do CSS não se aplicam.
//
// Quando isso é detectado, a página é ampliada (zoom) para a largura real da tela e as regras do CSS
// que dependem do tamanho da janela (media queries e unidades vw/vh) passam a usar esse tamanho
// "virtual". Fora desse caso nada muda: o navegador decide tudo sozinho.

let zoom = 1;
let vw = 0;
let vh = 0;
const mediaOrig = new Map<CSSMediaRule, string>();
const declOrig: { style: CSSStyleDeclaration; prop: string; value: string; prio: string }[] = [];
let collected = false;

/** Tamanho da janela em px de CSS como o jogo deve considerar (já descontado o zoom). */
export function viewport(): { w: number; h: number } {
  return zoom === 1 ? { w: innerWidth, h: innerHeight } : { w: vw, h: vh };
}

export function fitZoom(): number {
  return zoom;
}

/** matchMedia que respeita o tamanho virtual quando a página está ampliada. */
export function mq(query: string): boolean {
  return zoom === 1 ? window.matchMedia(query).matches : evalMedia(query);
}

/** Fator de ampliação necessário (1 quando a página já está na largura da tela). */
function neededZoom(): number {
  const touch = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
  if (!touch || !screen.width || !screen.height) return 1;
  const portrait = innerHeight >= innerWidth;
  const phys = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
  const z = innerWidth / phys;
  return z > 1.4 ? z : 1;
}

export function initFit(): void {
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 250));
}

function apply(): void {
  const z = neededZoom();
  if (z === 1 && zoom === 1) return;
  const root = document.documentElement;
  if (z === 1) {
    zoom = 1;
    root.style.removeProperty('zoom');
    root.classList.remove('fit-zoom');
    restore();
    window.dispatchEvent(new Event('pocao:fit'));
    return;
  }
  zoom = z;
  vw = innerWidth / z;
  vh = innerHeight / z;
  root.style.setProperty('zoom', String(z));
  root.style.setProperty('--fit-vw', vw / 100 + 'px');
  root.style.setProperty('--fit-vh', vh / 100 + 'px');
  root.style.setProperty('--fit-vmin', Math.min(vw, vh) / 100 + 'px');
  root.style.setProperty('--fit-vmax', Math.max(vw, vh) / 100 + 'px');
  root.classList.add('fit-zoom');
  collect();
  for (const [rule, text] of mediaOrig) {
    const want = evalMedia(text) ? 'all' : 'not all';
    if (rule.media.mediaText !== want) rule.media.mediaText = want;
  }
  window.dispatchEvent(new Event('pocao:fit'));
}

function restore(): void {
  for (const [rule, text] of mediaOrig) rule.media.mediaText = text;
  for (const d of declOrig) d.style.setProperty(d.prop, d.value, d.prio);
  mediaOrig.clear();
  declOrig.length = 0;
  collected = false;
}

const UNIT = /(-?\d*\.?\d+)(dvh|svh|lvh|vh|dvw|svw|lvw|vw|vmin|vmax)\b/g;

/** Guarda as media queries originais e troca vw/vh por variáveis (uma vez). */
function collect(): void {
  if (collected) return;
  collected = true;
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSMediaRule) {
        const t = r.media.mediaText;
        if (/width|height|orientation|aspect-ratio/.test(t)) mediaOrig.set(r, t);
        walk(r.cssRules);
      } else if (r instanceof CSSStyleRule) {
        const st = r.style;
        for (let i = 0; i < st.length; i++) {
          const prop = st[i];
          const value = st.getPropertyValue(prop);
          if (!value || !UNIT.test(value)) continue;
          UNIT.lastIndex = 0;
          const prio = st.getPropertyPriority(prop);
          declOrig.push({ style: st, prop, value, prio });
        }
      } else if ('cssRules' in r) {
        walk((r as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      // folha de outro domínio (fontes): não tem regras de layout
    }
  }
  for (const d of declOrig) {
    const v = d.value.replace(UNIT, (_m, n: string, u: string) => {
      const k = u.endsWith('vh') ? 'vh' : u.endsWith('vw') ? 'vw' : u;
      return `calc(${n} * var(--fit-${k}))`;
    });
    d.style.setProperty(d.prop, v, d.prio);
  }
}

/** Avalia uma media query simples com o tamanho virtual da janela. */
function evalMedia(text: string): boolean {
  return text.split(',').some((q) => evalQuery(q.trim()));
}

function evalQuery(q: string): boolean {
  let neg = false;
  if (q.startsWith('not ')) {
    neg = true;
    q = q.slice(4);
  } else if (q.startsWith('only ')) q = q.slice(5);
  const ok = q.split(/\s+and\s+/i).every((part) => {
    part = part.trim();
    if (part === 'all' || part === 'screen') return true;
    if (part === 'print' || part === '') return part === '';
    // sintaxe de intervalo, como o minificador escreve: (width<=600px)
    const rg = /^\(\s*(width|height)\s*(<=|>=|<|>)\s*([\d.]+)(px|em)?\s*\)$/i.exec(part);
    if (rg) {
      const a = rg[1] === 'width' ? vw : vh;
      const b = parseFloat(rg[3]) * (rg[4] === 'em' ? 16 : 1);
      return rg[2] === '<=' ? a <= b : rg[2] === '>=' ? a >= b : rg[2] === '<' ? a < b : a > b;
    }
    const m = /^\(\s*([a-z-]+)\s*(?::\s*([^)]+))?\)$/i.exec(part);
    if (!m) return window.matchMedia(part).matches;
    const [, feat, raw] = m;
    const val = (raw || '').trim();
    const w = vw;
    const h = vh;
    const px = () => {
      const n = parseFloat(val);
      return val.endsWith('em') ? n * 16 : n;
    };
    const ratio = () => {
      const [a, b] = val.split('/').map((x) => parseFloat(x));
      return b ? a / b : a;
    };
    switch (feat) {
      case 'orientation':
        return val === 'portrait' ? h >= w : w > h;
      case 'min-width':
        return w >= px();
      case 'max-width':
        return w <= px();
      case 'min-height':
        return h >= px();
      case 'max-height':
        return h <= px();
      case 'min-aspect-ratio':
        return w / h >= ratio();
      case 'max-aspect-ratio':
        return w / h <= ratio();
      default:
        return window.matchMedia(part).matches;
    }
  });
  return neg ? !ok : ok;
}
