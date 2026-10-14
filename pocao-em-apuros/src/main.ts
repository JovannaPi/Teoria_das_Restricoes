import './ui/styles.css';
import { sfx } from './audio/sfx';
import { game } from './game/game';
import { registerTitleActions, renderTitle, showTitle } from './ui/title';
import { resetOverlay } from './ui/overlay';

function boot(): void {
  game.init();
  registerTitleActions(game);
  document.body.classList.toggle('reduce-motion', game.save.settings.reduceMotion);
  document.body.dataset.screen = 'title';
  showTitle(game);
  window.addEventListener('pocao:menu', () => {
    resetOverlay();
    renderTitle(game);
  });
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
  // ganchos para testes automatizados (não usados pelo jogo)
  (window as unknown as { __pocao: unknown }).__pocao = { game };
}

boot();
