import './ui/styles.css';
import { sfx } from './audio/sfx';
import { game } from './game/game';
import { registerTitleActions, renderTitle, showTitle } from './ui/title';
import { resetOverlay } from './ui/overlay';
import { applyHero } from './game/hero';
import { flushPending, registerOnlineActions } from './ui/online';
import { registerPresenterActions } from './ui/presenter';

function boot(): void {
  if (game.save.hero) applyHero(game.save.hero);
  game.init();
  if (game.save.settings.reduceMotion) game.scene.lowFx = true;
  registerTitleActions(game);
  registerOnlineActions(game);
  registerPresenterActions(game);
  // ?apresentar abre direto a tela do QR Code (para o projetor)
  if (new URLSearchParams(location.search).has('apresentar')) setTimeout(() => game.actions['title-present'](document.body), 50);
  window.addEventListener('pocao:hero', () => {
    if (document.body.dataset.screen === 'title') renderTitle(game);
  });
  window.addEventListener('online', () => void flushPending(game));
  setTimeout(() => void flushPending(game), 3000);
  document.body.classList.toggle('reduce-motion', game.save.settings.reduceMotion);
  document.body.dataset.screen = 'title';
  showTitle(game);
  window.addEventListener('pocao:menu', () => {
    resetOverlay();
    showTitle(game);
  });
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
  // ganchos para testes automatizados (não usados pelo jogo)
  (window as unknown as { __pocao: unknown }).__pocao = { game };
}

boot();

// Instalação como app (PWA): só quando servido por http(s) no build de produção.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
