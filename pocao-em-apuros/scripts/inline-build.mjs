// Pós-build: (1) carimba a versão do service worker; (2) gera uma versão em arquivo
// único (dist/pocao-em-apuros.html) que abre direto no navegador, sem servidor.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const swPath = join(dist, 'sw.js');
if (existsSync(swPath)) writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('__BUILD__', stamp));

let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_m, href) => `<style>${readFileSync(join(dist, href), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g, (_m, src) => {
  const js = readFileSync(join(dist, src), 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
// no arquivo único não há manifesto nem service worker
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, '').replace(/<link rel="apple-touch-icon"[^>]*>\s*/g, '');
writeFileSync(join(dist, 'pocao-em-apuros.html'), html);
console.log(`build ${stamp}: dist/index.html (PWA) e dist/pocao-em-apuros.html (arquivo único, ${(html.length / 1024).toFixed(0)} KB)`);
