// Teste ponta a ponta no navegador (Chromium via playwright-core).
// Uso: npm run build && npm run test:e2e
// Sobe o "vite preview", joga pela interface e verifica regras, telas e console.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 4321;
const URL = `http://localhost:${PORT}/`;
const shotsDir = join(root, 'test-results');
mkdirSync(shotsDir, { recursive: true });

const candidates = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ executablePath });
const errors = [];
async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/gstatic|firestore|googleapis|net::ERR|Failed to load resource|Failed to fetch dynamically/i.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return page;
}

/** Avança o jogo pelo mesmo caminho dos quadros reais (Game.tick), sem esperar em tempo real. */
async function fastForward(page, gameSeconds) {
  await page.evaluate((secs) => {
    const g = window.__pocao.game;
    const per = 0.1 * g.speed;
    const n = Math.ceil(secs / per);
    for (let i = 0; i < n; i++) g.tick(0.1);
  }, gameSeconds);
}

async function skipDialogues(page) {
  for (let i = 0; i < 12; i++) {
    const b = await page.$('[data-action="dialogue-next"]');
    if (!b) break;
    await b.click();
    await page.waitForTimeout(40);
  }
}

/** Preenche a criação da bruxa (aparece antes da primeira partida). */
async function createHero(page, tap = false) {
  await page.waitForSelector('.creator');
  await page.fill('[data-hero-field="name"]', 'Morganinha');
  const act = (sel) => (tap ? page.tap(sel) : page.click(sel));
  await act('[data-action="hero-pick"][data-k="skin"][data-v="#7a4e32"]');
  await act('[data-action="hero-pick"][data-k="hairStyle"][data-v="coque"]');
  await act('[data-action="hero-random"]');
  await act('[data-action="hero-save"]');
}

async function clickStation(page, id) {
  await page.click(`#overlay [data-tag="${id}"]`);
}

/** Todo elemento com data-action / data-change precisa de um handler registrado. */
async function deadButtons(page) {
  return page.evaluate(() => {
    const g = window.__pocao.game;
    const bad = [];
    document.querySelectorAll('[data-action]').forEach((el) => {
      if (!g.actions[el.dataset.action]) bad.push(el.dataset.action);
    });
    document.querySelectorAll('[data-change]').forEach((el) => {
      if (!g.actions[el.dataset.change]) bad.push('change:' + el.dataset.change);
    });
    document.querySelectorAll('button').forEach((el) => {
      if (!el.dataset.action && !el.dataset.confirm && !('quizContinue' in el.dataset)) bad.push('sem ação: ' + el.textContent.trim().slice(0, 30));
    });
    return bad;
  });
}

try {
  // ---------------------------------------------------------------- tela inicial
  const page = await newPage({ width: 1440, height: 900 });
  await page.goto(URL);
  await page.waitForSelector('#title-menu .menu-list');
  check('jogo inicia e mostra o menu', true);
  check('menu sem botões mortos', (await deadButtons(page)).length === 0, (await deadButtons(page)).join(', '));
  for (const a of ['title-howto', 'title-toc', 'title-more', 'title-phases', 'title-glossary', 'title-settings', 'title-about']) {
    if (!(await page.isVisible(`[data-action="${a}"]`))) await page.click('[data-action="title-more"]');
    await page.click(`[data-action="${a}"]`);
    await page.waitForTimeout(80);
    const bad = await deadButtons(page);
    check(`painel ${a} abre sem botões mortos`, (await page.isVisible('#title-panel')) && bad.length === 0, bad.join(', '));
  }

  // ---------------------------------------------------------------- tutorial completo
  await page.click('[data-action="title-back"]');
  await page.click('[data-action="title-more"]');
  await page.click('#title-panel [data-action="title-start"][data-v="tutorial"]');
  check('criação da bruxa aparece antes da primeira partida', (await page.$('.creator')) != null);
  check('criação da bruxa sem botões mortos', (await deadButtons(page)).length === 0);
  await page.fill('[data-hero-field="name"]', '');
  await page.click('[data-action="hero-save"]');
  check('criação exige um nome para a bruxa', await page.isVisible('.creator'));
  await createHero(page);
  await page.waitForSelector('[data-action="dialogue-next"]');
  check('o nome da bruxa aparece nos diálogos', (await page.textContent('.dlg')).includes('Morganinha'));
  await skipDialogues(page);
  await page.waitForSelector('.coach');
  await clickStation(page, 'balcao');
  await page.waitForTimeout(100);
  await page.click('.hud-menu [data-action="side"][data-v="pedidos"]');
  await page.waitForSelector('[data-action="accept"]');
  await page.click('[data-action="accept"]');
  check('tutorial: aceitar pedido pela interface', (await page.textContent('.coach')).includes('lição 3'));
  await fastForward(page, 60);
  check('tutorial: poção atravessou todas as estações e foi entregue', (await page.evaluate(() => window.__pocao.game.sim.stats.delivered)) >= 1);
  await page.click('.hud-menu [data-action="side"][data-v="despensa"]');
  await page.click('[data-action="buy"][data-v="agua_lunar"][data-q="5"]');
  await page.click('[data-change="policy-check"][data-k="autoReorder"]');
  await clickStation(page, 'caldeirao');
  await page.click('[data-action="help-here"][data-v="caldeirao"]');
  await fastForward(page, 15);
  check('Lina anda até o caldeirão e passa a ajudar', (await page.evaluate(() => window.__pocao.game.sim.helper)) === 'caldeirao');
  await page.click('[data-action="speed"][data-v="2"]');
  await fastForward(page, 60);
  await page.waitForSelector('.quiz');
  await page.click('.quiz [data-action="quiz"]');
  await page.click('[data-quiz-continue]');
  await page.click('.hud-menu [data-action="open-analysis"]');
  await page.click('[data-action="modal-tab"][data-v="graficos"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(shotsDir, 'analise-graficos.png') });
  await page.click('.modal [data-action="modal-close"]');
  await page.click('[data-action="tutorial-next"]');
  await skipDialogues(page);
  await page.waitForSelector('.debrief');
  check('tutorial concluído e avaliação exibida', (await page.textContent('.debrief .result')).includes('concluída'));
  check('avaliação sem botões mortos', (await deadButtons(page)).length === 0);

  // ---------------------------------------------------------------- fase 1: identificar
  await page.click('[data-action="next-phase"]');
  await skipDialogues(page);
  if (await page.$('.modal [data-action="modal-close"]')) await page.click('.modal [data-action="modal-close"]');
  await page.click('[data-action="speed"][data-v="4"]');
  await fastForward(page, 50);
  // painéis laterais e modais: nenhum botão sem ação
  for (const v of ['pedidos', 'despensa', 'fluxo', 'melhorias']) {
    await page.click(`.hud-menu [data-action="side"][data-v="${v}"]`);
    const bad = await deadButtons(page);
    check(`painel ${v} sem botões mortos`, bad.length === 0, bad.join(', '));
  }
  for (const m of ['open-analysis', 'open-recipes', 'open-glossary', 'open-objectives', 'open-menu']) {
    await page.click(`#hud [data-action="${m}"]`);
    await page.waitForTimeout(60);
    const bad = await deadButtons(page);
    check(`janela ${m} abre sem botões mortos`, (await page.$('.modal')) != null && bad.length === 0, bad.join(', '));
    await page.keyboard.press('Escape');
  }
  // pausa congela relógio e prazos
  await page.click('[data-action="pause"]');
  const t0 = await page.evaluate(() => window.__pocao.game.sim.t);
  const due0 = await page.evaluate(() => JSON.stringify(Object.values(window.__pocao.game.sim.stations).map((s) => s.active.map((a) => a.remaining))));
  await fastForward(page, 30);
  const t1 = await page.evaluate(() => window.__pocao.game.sim.t);
  const due1 = await page.evaluate(() => JSON.stringify(Object.values(window.__pocao.game.sim.stations).map((s) => s.active.map((a) => a.remaining))));
  check('pausar congela relógio e tarefas', t0 === t1 && due0 === due1, `${t0} → ${t1}`);
  await page.click('[data-action="pause"]');
  // hipótese errada e depois a certa, pela interface
  await clickStation(page, 'embalagem');
  await page.click('#side [data-action="hypothesis"]');
  await page.click('[data-action="hypothesis-confirm"][data-v="embalagem"]');
  await fastForward(page, 25);
  await page.waitForSelector('.modal');
  check('hipótese errada é recusada com evidências', (await page.textContent('.modal')).includes('não confirmada'.slice(0, 3)) || (await page.textContent('.modal')).includes('Não é bem isso'));
  await page.click('.modal [data-action="modal-close"]');
  await clickStation(page, 'caldeirao');
  await page.click('#side [data-action="hypothesis"]');
  await page.click('[data-action="hypothesis-confirm"][data-v="caldeirao"]');
  await fastForward(page, 25);
  await page.waitForSelector('.modal');
  check('hipótese certa (caldeirão) é confirmada', (await page.textContent('.modal')).includes('Confirmado'));
  await page.click('.modal [data-action="modal-close"]');
  await page.screenshot({ path: join(shotsDir, 'fase1-jogo.png') });
  // salvar, sair e continuar
  await page.click('#hud [data-action="open-menu"]');
  const tSave = await page.evaluate(() => window.__pocao.game.sim.t); // o menu pausa o jogo
  await page.click('.modal [data-action="exit"]');
  await page.waitForSelector('[data-action="title-continue"]');
  await page.click('[data-action="title-continue"]');
  await page.waitForTimeout(200);
  const tLoad = await page.evaluate(() => window.__pocao.game.sim.t);
  check('salvar e continuar preserva a partida', Math.abs(tLoad - tSave) < 0.001, `${tSave} → ${tLoad}`);
  // recarregar a página e continuar (localStorage)
  await page.reload();
  await page.waitForSelector('[data-action="title-continue"]');
  await page.click('[data-action="title-continue"]');
  await page.waitForTimeout(200);
  check('progresso sobrevive a recarregar a página', (await page.evaluate(() => window.__pocao.game.sim.hypotheses.length)) === 2);
  await page.click('[data-action="speed"][data-v="4"]');
  await fastForward(page, 320);
  await skipDialogues(page);
  await page.waitForSelector('.debrief');
  check('fase 1 concluída ao fim do dia', (await page.textContent('.debrief .result')).includes('concluída'));
  await page.click('.debrief [data-action="quiz"][data-v="1"]');
  check('pergunta de reflexão mostra explicação', await page.isVisible('.quiz-exp'));
  await page.screenshot({ path: join(shotsDir, 'fase1-avaliacao.png'), fullPage: false });
  await page.waitForFunction(() => !/Enviando/.test(document.querySelector('[data-online-status]')?.textContent || ''), null, { timeout: 30000 });
  const st = await page.textContent('[data-online-status]');
  check('avaliação informa o envio ao placar (enviado ou guardado sem internet)', /placar|guardado/.test(st), st.trim().slice(0, 60));
  await page.click('.debrief [data-action="board-open"]');
  await page.waitForSelector('[data-board-body="modal"]');
  check('placar abre sem botões mortos', (await deadButtons(page)).length === 0);
  await page.click('[data-action="board-tab"][data-v="fase1"]');
  await page.click('[data-action="board-project"]');
  check('modo projeção do placar abre', await page.isVisible('.projection'));
  await page.click('[data-action="board-close-projection"]');
  check('modo projeção fecha', !(await page.isVisible('.projection')));
  await page.waitForSelector('.debrief');

  // ---------------------------------------------------------------- fase 4: investir altera capacidade
  await page.evaluate(() => {
    const g = window.__pocao.game;
    g.save.teacherMode = true;
  });
  await page.click('[data-action="exit"]');
  await page.click('[data-action="title-more"]');
  await page.click('[data-action="title-phases"]');
  await page.click('.phase-card[data-v="fase4"]');
  await skipDialogues(page);
  if (await page.$('.modal [data-action="modal-close"]')) await page.click('.modal [data-action="modal-close"]');
  await fastForward(page, 5);
  const cash0 = await page.evaluate(() => window.__pocao.game.sim.cash);
  await page.click('.hud-menu [data-action="side"][data-v="melhorias"]');
  await page.click('[data-action="upgrade"][data-v="caldeirao_extra"]');
  await page.click('[data-confirm="yes"]');
  const cash1 = await page.evaluate(() => window.__pocao.game.sim.cash);
  check('investimento debita o caixa (com confirmação)', Math.abs(cash0 - cash1 - 360) < 2, `${cash0.toFixed(0)} → ${cash1.toFixed(0)}`);
  await fastForward(page, 30);
  const slots = await page.evaluate(() => window.__pocao.game.sim.stations.caldeirao.slots);
  check('melhoria instalada aumenta a capacidade', slots === 2);
  await page.screenshot({ path: join(shotsDir, 'fase4-dois-caldeiroes.png') });

  // ---------------------------------------------------------------- resoluções diferentes
  for (const vp of [
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(250);
    const ok = await page.evaluate(() => {
      const c = document.querySelector('#shop').getBoundingClientRect();
      return document.documentElement.scrollWidth <= window.innerWidth + 1 && c.width > 200 && c.height > 100;
    });
    check(`layout ${vp.width}×${vp.height} sem rolagem horizontal e com a loja visível`, ok);
    await page.screenshot({ path: join(shotsDir, `layout-${vp.width}x${vp.height}.png`) });
  }
  if (await page.isVisible('.side-x')) await page.click('.side-x');
  await page.waitForTimeout(250);
  await clickStation(page, 'caldeirao');
  await page.waitForTimeout(250);
  check('no celular, o painel abre como gaveta', await page.evaluate(() => document.body.classList.contains('side-open')));
  await page.screenshot({ path: join(shotsDir, 'celular-painel.png') });
  await page.close();

  // ---------------------------------------------------------------- celular em pé (toque)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const m = await ctx.newPage();
    m.on('pageerror', (e) => errors.push('[celular] ' + String(e)));
    await m.goto(URL);
    await m.waitForSelector('#title-menu .menu-list');
    await m.tap('[data-action="title-more"]');
    await m.tap('#title-panel [data-action="title-start"][data-v="tutorial"]');
    await createHero(m, true);
    check('celular em pé: bruxa criada por toque', (await m.evaluate(() => window.__pocao.game.save.hero?.name)) === 'Morganinha');
    for (let i = 0; i < 8; i++) {
      const b = await m.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
    }
    check('celular em pé: barra de abas e faixa de estações visíveis', (await m.isVisible('#tabbar')) && (await m.isVisible('#station-strip')));
    const small = await m.evaluate(() =>
      [...document.querySelectorAll('#tabbar button, #station-strip button:not([hidden]), .hud-time button')]
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.height < 32 || r.width < 32).length,
    );
    check('celular em pé: alvos de toque com pelo menos 32 px', small === 0, `${small} pequenos`);
    await m.tap('#station-strip [data-strip="balcao"]');
    await m.tap('#tabbar [data-tab-id="pedidos"]');
    await m.waitForSelector('[data-action="accept"]');
    await m.tap('[data-action="accept"]');
    check('celular em pé: aceitar pedido tocando', (await m.evaluate(() => Object.values(window.__pocao.game.sim.orders)[0].status)) === 'aceito');
    await m.tap('#station-strip [data-strip="caldeirao"]');
    await m.tap('#side [data-action="help-here"][data-v="caldeirao"]');
    await m.evaluate(() => {
      const g = window.__pocao.game;
      for (let i = 0; i < 200; i++) g.tick(0.1);
    });
    check('celular em pé: Lina ajuda o caldeirão', (await m.evaluate(() => window.__pocao.game.sim.helper)) === 'caldeirao');
    // tocar na própria loja (canvas) seleciona a estação; a loja está ampliada, então a câmera vai até ela antes
    await m.evaluate(() => window.__pocao.game.camera.focusStation('embalagem'));
    await m.waitForTimeout(1200);
    await m.evaluate(() => (window.__pocao.game.selected = null));
    const box = await m.evaluate(() => {
      const r = document.querySelector('#shop').getBoundingClientRect();
      return { x: r.left + (r.width * 346) / 480, y: r.top + (r.height * 228) / 270 };
    });
    await m.touchscreen.tap(box.x, box.y);
    await m.waitForTimeout(100);
    check('celular em pé: tocar na loja seleciona a estação', (await m.evaluate(() => window.__pocao.game.selected)) === 'embalagem');
    await m.tap('#tabbar [data-action="open-analysis"]');
    check('celular em pé: análise abre', await m.isVisible('.modal'));
    await m.tap('.modal [data-action="modal-close"]');
    await m.tap('#tabbar [data-action="open-more"]');
    check('celular em pé: menu "Mais" sem botões mortos', (await deadButtons(m)).length === 0);
    await m.tap('.modal [data-action="modal-close"]');
    check('celular em pé: sem rolagem horizontal', await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await m.screenshot({ path: join(shotsDir, 'celular-em-pe.png') });
    await ctx.close();
  }

  // ---------------------------------------------------------------- celular deitado (toque)
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const m = await ctx.newPage();
    m.on('pageerror', (e) => errors.push('[deitado] ' + String(e)));
    await m.goto(URL);
    await m.waitForSelector('#title-menu .menu-list');
    await m.evaluate(() => {
      window.__pocao.game.save.teacherMode = true;
      void window.__pocao.game.startPhase('fase3');
    });
    await createHero(m, true);
    for (let i = 0; i < 8; i++) {
      const b = await m.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
    }
    if (await m.$('.modal [data-action="modal-close"]')) await m.tap('.modal [data-action="modal-close"]');
    const stage = await m.evaluate(() => document.querySelector('#shop').getBoundingClientRect().height);
    check('celular deitado: a loja ocupa a maior parte da altura', stage > 390 * 0.7, `${Math.round(stage)} px`);
    await m.tap('#tabbar [data-tab-id="fluxo"]');
    await m.waitForTimeout(250);
    check('celular deitado: painel desliza ao tocar na aba', await m.evaluate(() => document.body.classList.contains('side-open')));
    await m.tap('[data-action="policy"][data-k="release"][data-v="corda"]');
    check('celular deitado: decisão de fluxo aplicada por toque', (await m.evaluate(() => window.__pocao.game.sim.policies.release)) === 'corda');
    await m.tap('#tabbar [data-tab-id="fluxo"]');
    await m.waitForTimeout(250);
    check('celular deitado: tocar de novo fecha o painel', await m.evaluate(() => !document.body.classList.contains('side-open')));
    await m.screenshot({ path: join(shotsDir, 'celular-deitado.png') });
    await ctx.close();
  }


  // ---------------------------------------------------------------- MODO RÁPIDO no celular (toque), do Jogar ao resultado
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const m = await ctx.newPage();
    m.on('pageerror', (e) => errors.push('[rápido] ' + String(e)));
    await m.goto(URL);
    await m.waitForSelector('.play-btn');
    const pb = await m.evaluate(() => {
      const r = document.querySelector('.play-btn').getBoundingClientRect();
      return { h: r.height, bottom: r.bottom, vh: innerHeight };
    });
    check('rápido: botão do modo rápido grande e visível sem rolar', pb.h >= 56 && pb.bottom <= pb.vh, `${Math.round(pb.h)} px de altura`);
    {
      const t = await m.evaluate(() => [...document.querySelectorAll('.main-actions .play-btn')].map((b) => ({ txt: b.textContent, vis: b.getBoundingClientRect().bottom <= innerHeight })));
      check('início: duas opções claras — "Modo rápido — 6 a 10 minutos" e "Modo completo"', t.length === 2 && /Modo rápido — 6 a 10 minutos/.test(t[0].txt) && /Modo completo/.test(t[1].txt) && t.every((x) => x.vis), JSON.stringify(t));
    }
    await m.screenshot({ path: join(shotsDir, 'rapido-01-inicio.png') });
    await m.tap('.play-btn');
    for (let i = 0; i < 3; i++) {
      const b = await m.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
    }
    await m.waitForSelector('.turma-coach');
    check('rápido: começa sem tela de configuração (bruxa com nome sorteado)', (await m.$('.creator')) == null && (await m.evaluate(() => window.__pocao.game.save.hero?.name?.length ?? 0)) > 2);
    check('rápido: sem janela de objetivos em sequência', (await m.$('.modal')) == null);
    check('rápido: primeira tarefa apresenta o problema e pede para tocar em estações', /chegam mais rápido do que a loja entrega/.test(await m.textContent('.turma-coach')));
    {
      const ui = await m.evaluate(() => ({
        strip: [...document.querySelectorAll('#station-strip button')].filter((b) => !b.hidden && b.offsetParent).map((b) => b.dataset.strip),
        tabs: [...document.querySelectorAll('#tabbar button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim()),
        stats: [...document.querySelectorAll('.hud-stats .stat')].filter((b) => b.offsetParent).map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
        recipes: window.__pocao.game.sim.recipes,
      }));
      check('rápido: loja enxuta — 4 estações e 1 tipo de poção', ui.strip.length === 4 && ui.recipes.length === 1, JSON.stringify(ui.strip));
      check('rápido: só os indicadores essenciais (sem lucro e reputação)', !ui.stats.some((t) => /Lucro|Reputação/.test(t)) && ui.stats.some((t) => /Entregues/.test(t)), JSON.stringify(ui.stats));
      check('rápido: abas enxutas (sem Estoque e Fluxo)', !ui.tabs.some((t) => /Estoque|Fluxo/.test(t)) && ui.tabs.some((t) => /Pedidos/.test(t)), JSON.stringify(ui.tabs));
    }
    const ff = (secs) =>
      m.evaluate((x) => {
        const g = window.__pocao.game;
        const n = Math.ceil(x / (0.1 * g.speed));
        for (let i = 0; i < n; i++) g.tick(0.1);
      }, secs);
    const shot = (n) => m.screenshot({ path: join(shotsDir, `rapido-${n}.png`) });
    const choose = async (v) => {
      await m.tap(`.turma-coach [data-action="quick-choice"][data-v="${v}"]`);
      await m.waitForTimeout(60);
    };
    const coach = () => m.textContent('.turma-coach');
    const has = async (v) => !!(await m.$(`.turma-coach [data-action="quick-choice"][data-v="${v}"]`));
    const sheetOpen = () => m.evaluate(() => document.body.classList.contains('side-open'));
    await m.tap('#station-strip [data-strip="caldeirao"]');
    check('rápido: tocar numa estação abre o painel de baixo', await sheetOpen());
    await shot('02-painel');
    await m.tap('.sheet-x');
    check('rápido: o painel fecha e volta para a loja', !(await sheetOpen()));
    await m.tap('#station-strip [data-strip="destilacao"]');
    await m.tap('.sheet-x');
    await m.waitForTimeout(1100);
    await ff(30);
    check('rápido: pergunta onde está o acúmulo', (await coach()).includes('acumulando'));
    await choose('balcao');
    check('rápido: resposta errada explicada com os números e convite a conversar', /fila na frente da estação Balcão tem \d+/.test(await coach()) && /Converse/.test(await coach()));
    const top = await m.evaluate(() => {
      const s = window.__pocao.game.sim;
      return Object.values(s.stations).filter((x) => !x.locked).sort((a, b) => b.queue.length - a.queue.length)[0].id;
    });
    await choose(top);
    await m.waitForTimeout(1400);
    check('rápido: passo 1 (identificar) com opções de estação', (await coach()).includes('qual estação está limitando'));
    await shot('03-identificar');
    await choose('destilacao');
    check('rápido: escolha errada explicada com os dados da estação', /Destilação não é o que limita a loja agora/.test(await coach()));
    check('rápido: depois de um erro, a mentora acena com uma dica ("!")', (await m.evaluate(() => window.__pocao.game.talkAlert)) === 'mentora');
    await choose('caldeirao');
    check('rápido: restrição confirmada com evidências', /Isso! Caldeirão está ocupada \d+%/.test(await coach()));
    check('rápido: sem janela extra para o resultado da hipótese', (await m.$('.modal')) == null);
    await choose('ok');
    { const t = await coach(); check('rápido: passo 2 (explorar) com escolhas sem custo dentro do cartão', t.includes('melhoria sem custo') && (await has('helper-preparo')), t.slice(0, 160)); }
    await shot('04-explorar');
    // melhorar quem não é a restrição: medido, sem ganho, e dá para tentar outra
    await choose('helper-preparo');
    await ff(32);
    check('rápido: ajudar o Preparo (não é a restrição) não aumenta as entregas — e a etapa não avança', /nada mudou/.test(await coach()) && (await has('setupExternal')), (await coach()).slice(0, 220));
    await choose('setupExternal');
    await ff(30);
    check('rápido: explorar a restrição mostra o efeito medido', /ficava parado \d+% do tempo; agora \d+%/.test(await coach()));
    await choose('ok');
    check('rápido: passo 3 (subordinar) parte de "todo mundo ocupado"', (await coach()).includes('Como organizar o trabalho'));
    await choose('empurrar');
    await ff(42);
    check('rápido: manter todo mundo ocupado é medido e explicado, e a corda continua disponível', /Todo mundo ocupado não faz/.test(await coach()) && (await has('corda')));
    await choose('corda');
    await ff(42);
    {
      const t = await coach();
      const mm = /poções espalhadas pela loja: (\d+) → (\d+)/.exec(t);
      check('rápido: corda diminui as poções espalhadas pela loja', !!mm && Number(mm[2]) < Number(mm[1]), mm ? mm[0] : t.slice(0, 200));
    }
    await choose('ok');
    check('rápido: passo 4 (elevar) com preço das opções', /Segundo caldeirão/.test(await coach()));
    await shot('05-elevar');
    await choose('bancada_extra');
    check('rápido: compra pede confirmação (segundo toque)', /Toque de novo para confirmar/.test(await coach()));
    await choose('bancada_extra');
    await ff(40);
    check('rápido: investir fora da restrição mostra que nada melhorou e deixa tentar de novo', /não limitava a loja/.test(await coach()) && (await has('caldeirao_extra')), `caixa ${Math.round(await m.evaluate(() => window.__pocao.game.sim.cash))} | ${(await coach()).replace(/\s+/g, ' ').slice(0, 300)}`);
    await choose('caldeirao_extra');
    await choose('caldeirao_extra');
    await ff(40);
    check('rápido: investimento na restrição mostra o efeito', /Você elevou a restrição/.test(await coach()));
    await choose('ok');
    check('rápido: passo 5 (recomeçar)', (await coach()).includes('A loja mudou'));
    await choose('caldeirao');
    check('rápido: a restrição antiga não é mais a resposta', /não é o que limita a loja agora/.test(await coach()));
    await choose('destilacao');
    check('rápido: nova restrição (destilação) confirmada', /Isso! Destilação/.test(await coach()));
    await choose('ok');
    {
      const t = await coach();
      check('rápido: fim compara começo e agora (entregas e poções espalhadas)', /Entregas: [\d,]+ → [\d,]+ poções\/min\. Poções espalhadas pela loja: \d+ → \d+/.test(t), t.slice(0, 220));
    }
    const tSim = await m.evaluate(() => window.__pocao.game.sim.t);
    check('rápido: a partida guiada dura entre 4 e 10 minutos de jogo (a 1×)', tSim >= 240 && tSim <= 600, `${Math.round(tSim)} s de jogo`);
    await choose('fim');
    await ff(2);
    for (let i = 0; i < 3; i++) {
      const b = await m.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
    }
    await m.waitForSelector('.debrief .steps5');
    const statuses = await m.$$eval('.steps5 .step .chip', (els) => els.map((e) => e.textContent));
    check('rápido: resultado mostra os 5 passos com dados da partida', statuses.length === 5, statuses.join(' | '));
    check('rápido: passo 1 "em parte" (houve um palpite errado)', statuses[0] === 'Em parte', statuses.join(' | '));
    await m.tap('.debrief [data-action="quiz"][data-v="0"]');
    check('rápido: reflexão com resposta contextualizada pelos dados', /trabalhou \d+% do dia/.test(await m.textContent('.quiz-exp')));
    check('rápido: nada ultrapassa a largura da tela', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await shot('06-resultado');
    await m.tap('.debrief [data-action="retry"]');
    for (let i = 0; i < 3; i++) {
      const b = await m.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
    }
    await m.waitForSelector('.turma-coach');
    check('rápido: jogar de novo reinicia a partida', (await m.evaluate(() => window.__pocao.game.sim.t)) < 2);
    await ff(20);
    await m.tap('.turma-coach [data-action="quick-restart"]');
    await m.tap('.modal [data-confirm="yes"]');
    for (let i = 0; i < 3; i++) {
      const b = await m.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
    }
    await m.waitForSelector('.turma-coach');
    check('rápido: "Recomeçar" reinicia a demonstração na hora', (await m.evaluate(() => window.__pocao.game.sim.t)) < 2);
    // pular dicas: tudo liberado e a partida segue
    await m.tap('.turma-coach [data-action="quick-skip"]');
    check('rápido: pular dicas libera as decisões e mostra Fluxo', !(await m.evaluate(() => window.__pocao.game.policyLocked('release'))) && (await m.evaluate(() => !!document.querySelector('#tabbar [data-tab-id="fluxo"]').offsetParent)));
    await m.tap('.turma-coach [data-action="quick-unskip"]');
    check('rápido: dicas podem ser reabertas', /chegam mais rápido/.test(await coach()));
    await ctx.close();
  }

  // ---------------------------------------------------------------- celular em pé no modo completo: painéis, análise, gráficos por toque
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const m = await ctx.newPage();
    m.on('pageerror', (e) => errors.push('[completo] ' + String(e)));
    await m.goto(URL);
    await m.waitForSelector('.play-btn');
    await m.evaluate(() => {
      const g = window.__pocao.game;
      g.save.hero = { name: 'Teste', player: 'Teste', skin: '#f3cfa6', hair: '#8a4a22', hairStyle: 'longo', cloth: '#1f2c52', accent: '#46b06e', hat: 'bruxa', hatColor: '#121a33' };
      g.save.teacherMode = true;
      void g.startPhase('fase1');
    });
    for (let i = 0; i < 6; i++) {
      const b = await m.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
    }
    check('completo: barra "Agora" mostra o objetivo e a hipótese', (await m.textContent('#phase-bar')).includes('hipótese') && (await m.$('#phase-bar [data-action="hypothesis"]')) != null);
    await m.evaluate(() => {
      const g = window.__pocao.game;
      g.speed = 4;
      for (let i = 0; i < 300; i++) g.tick(0.1);
    });
    const tabs = await m.$$eval('#tabbar button span', (els) => els.map((e) => e.textContent));
    check('completo: barra inferior Loja, Pedidos, Estoque, Fluxo, Análise, Mais', tabs.join(',') === 'Loja,Pedidos,Estoque,Fluxo,Análise,Mais', tabs.join(','));
    const small = await m.evaluate(() =>
      [...document.querySelectorAll('#tabbar button, #station-strip button:not([hidden]), .hud-time button, #phase-bar button')]
        .map((b) => b.getBoundingClientRect())
        .filter((r) => r.height < 40 || r.width < 40).length,
    );
    check('completo: botões principais com pelo menos 40×40 px', small === 0, `${small} pequenos`);
    for (const t of ['pedidos', 'despensa', 'fluxo']) {
      await m.tap(`#tabbar [data-tab-id="${t}"]`);
      await m.waitForTimeout(250);
      const ok = await m.evaluate(() => {
        const r = document.querySelector('#side').getBoundingClientRect();
        return document.body.classList.contains('side-open') && r.top > 100 && r.bottom <= innerHeight + 1;
      });
      check(`completo: aba ${t} abre como painel de baixo, dentro da tela`, ok);
      await m.tap('.sheet-x');
    }
    await m.tap('#tabbar [data-tab-id="fluxo"]');
    await m.tap('.seg [data-v="melhorias"]');
    check('completo: Investimentos dentro de Fluxo', (await m.textContent('#side')).includes('Melhorias'));
    await m.tap('.sheet-x');
    await m.tap('.hud-stats');
    check('completo: tocar nos indicadores mostra todos (lucro, entregues)', await m.evaluate(() => getComputedStyle(document.querySelectorAll('.hud-stats .stat')[1]).display !== 'none'));
    await m.tap('.hud-stats');
    await m.tap('#tabbar [data-action="open-analysis"]');
    check('completo: análise em cartões, sem tabela larga', await m.evaluate(() => getComputedStyle(document.querySelector('.st-cards')).display !== 'none' && document.querySelector('.modal-body').scrollWidth <= document.querySelector('.modal-body').clientWidth + 1));
    await m.screenshot({ path: join(shotsDir, 'completo-analise.png') });
    await m.tap('[data-action="modal-tab"][data-v="graficos"]');
    await m.waitForTimeout(150);
    const c = await m.evaluate(() => {
      const r = document.querySelector('[data-chart="queues"]').getBoundingClientRect();
      return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
    });
    await m.touchscreen.tap(c.x, c.y);
    check('completo: gráfico mostra valores com toque', await m.evaluate(() => getComputedStyle(document.querySelector('[data-chart="queues"]').parentElement.querySelector('.chart-tip')).display !== 'none'));
    await m.tap('.modal [data-action="modal-close"]');
    await m.tap('#phase-bar [data-action="hypothesis"]');
    await m.tap('[data-action="hypothesis-confirm"][data-v="embalagem"]');
    await m.evaluate(() => {
      const g = window.__pocao.game;
      for (let i = 0; i < 80; i++) g.tick(0.1);
    });
    await m.waitForSelector('.modal');
    check('completo: hipótese errada explicada com dados', /Estar ocupada não é o mesmo|Parada não é o mesmo|sobra capacidade/.test(await m.textContent('.modal')));
    await m.screenshot({ path: join(shotsDir, 'completo-hipotese.png') });
    check('completo: nada ultrapassa a largura da tela', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await ctx.close();
  }

  // ---------------------------------------------------------------- larguras de tela: tela inicial
  for (const vp of [
    { width: 320, height: 568, mobile: true },
    { width: 414, height: 896, mobile: true },
    { width: 1280, height: 800, mobile: false },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile });
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.waitForSelector('.play-btn');
    const r = await p.evaluate(() => {
      const b = document.querySelector('.play-btn').getBoundingClientRect();
      return { ok: b.bottom <= innerHeight && b.height >= 48, over: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    check(`tela inicial ${vp.width}×${vp.height}: Jogar visível e tocável, sem rolagem lateral`, r.ok && !r.over);
    await p.screenshot({ path: join(shotsDir, `inicio-${vp.width}x${vp.height}.png`) });
    await ctx.close();
  }

  // ---------------------------------------------------------------- QR Code do apresentador
  {
    const p = await newPage({ width: 1366, height: 768 });
    await p.goto(URL + '?apresentar');
    await p.waitForSelector('.presenter');
    check('apresentador recusa gerar QR para endereço local', (await p.$('.slide-qr canvas')) == null && (await p.textContent('.slide-qr')).includes('só funciona neste computador'));
    const pub = 'https://jovannapi.github.io/Teoria_das_Restricoes/pocao/';
    await p.fill('[data-presenter-url]', pub);
    await p.press('[data-presenter-url]', 'Enter');
    await p.dispatchEvent('[data-presenter-url]', 'change');
    await p.waitForSelector('.slide-qr canvas');
    const px = await p.evaluate(() => {
      const c = document.querySelector('.slide-qr canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      return { w: c.width, h: c.height, data: Array.from(d.data) };
    });
    const { default: jsQR } = await import('jsqr');
    const read = jsQR(Uint8ClampedArray.from(px.data), px.w, px.h);
    check('QR do slide é lido e aponta para o endereço informado', read?.data === pub, read?.data || 'não lido');
    const slideText = await p.textContent('.slide');
    check('slide tem título, instrução, tempo e endereço alternativo', /Poção em Apuros/.test(slideText) && /Aponte a câmera e jogue/.test(slideText) && /6 a 10 minutos/.test(slideText) && /jovannapi\.github\.io/.test(slideText));
    await p.screenshot({ path: join(shotsDir, 'slide-qr.png') });
    await p.close();
  }


  // ---------------------------------------------------------------- desempenho com CPU 4× mais lenta (celular modesto)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await p.goto(URL);
    await p.waitForSelector('.play-btn');
    await p.evaluate(() => {
      const g = window.__pocao.game;
      g.save.hero = { name: 'Teste', player: 'Teste', skin: '#f3cfa6', hair: '#8a4a22', hairStyle: 'longo', cloth: '#1f2c52', accent: '#46b06e', hat: 'bruxa', hatColor: '#121a33' };
      g.save.teacherMode = true;
      void g.startPhase('mestra');
    });
    for (let i = 0; i < 4; i++) {
      const b = await p.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
    }
    if (await p.$('.modal [data-action="modal-close"]')) await p.tap('.modal [data-action="modal-close"]');
    const ms = await p.evaluate(() => {
      const g = window.__pocao.game;
      g.speed = 4;
      for (let i = 0; i < 1200; i++) g.tick(0.1); // loja cheia: 8 min de jogo
      const t0 = performance.now();
      const N = 120;
      for (let i = 0; i < N; i++) {
        g.tick(1 / 60);
        g.refreshUi(false);
      }
      return (performance.now() - t0) / N;
    });
    check('desempenho: quadro médio < 16 ms com CPU 4× mais lenta e loja cheia', ms < 16, `${ms.toFixed(1)} ms por quadro`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- andar pela loja e conversar
  {
    const heroStart = (ph) => {
      const g = window.__pocao.game;
      g.save.hero = { name: 'Teste', player: 'Teste', skin: '#f3cfa6', hair: '#8a4a22', hairStyle: 'longo', cloth: '#1f2c52', accent: '#46b06e', hat: 'bruxa', hatColor: '#121a33' };
      void g.startPhase(ph);
    };
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('[conversa] ' + String(e)));
    await p.goto(URL);
    await p.waitForSelector('.play-btn');
    await p.evaluate(heroStart, 'fase1');
    await p.waitForTimeout(250);
    for (let i = 0; i < 6; i++) {
      const b = await p.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
      await p.waitForTimeout(60);
    }
    await p.waitForTimeout(400);
    const scr = (lx, ly) =>
      p.evaluate(([x, y]) => {
        const c = document.getElementById('shop').getBoundingClientRect();
        return { x: c.left + (x / 480) * c.width, y: c.top + (y / 270) * c.height };
      }, [lx, ly]);
    const lina = () => p.evaluate(() => ({ x: window.__pocao.game.scene.lina.x, y: window.__pocao.game.scene.lina.y }));
    const cdp = await ctx.newCDPSession(p);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    // arrastar a bruxa: ela segue o dedo e nunca entra nos móveis
    const l0 = await lina();
    const a = await scr(l0.x, l0.y - 10);
    await touch('touchStart', [{ x: a.x, y: a.y }]);
    let inside = 0;
    for (let k = 1; k <= 30; k++) {
      await touch('touchMove', [{ x: a.x + k * 5, y: a.y - k * 4 }]);
      await p.waitForTimeout(25);
      if (!(await p.evaluate(() => { const l = window.__pocao.game.scene.lina; return window.__pocao.walk.free(l.x, l.y, false); }))) inside++;
    }
    await p.waitForTimeout(500);
    await touch('touchEnd', []);
    await p.waitForTimeout(200);
    const l1 = await lina();
    check('andar: arrastar a bruxa com o dedo a leva pela loja', Math.hypot(l1.x - l0.x, l1.y - l0.y) > 40, `(${Math.round(l0.x)},${Math.round(l0.y)}) → (${Math.round(l1.x)},${Math.round(l1.y)})`);
    check('andar: arrastar a bruxa não seleciona nada e ela nunca entra num móvel', (await p.evaluate(() => window.__pocao.game.selected)) == null && inside === 0, `${inside} quadros dentro de móveis`);
    // contra um móvel: arrastar por cima do caldeirão não a coloca dentro dele
    await p.evaluate(() => {
      const l = window.__pocao.game.scene.lina;
      l.x = l.tx = 150;
      l.y = l.ty = 150;
    });
    const b = await scr(150, 140);
    await touch('touchStart', [{ x: b.x, y: b.y }]);
    const samples = [];
    for (let k = 1; k <= 20; k++) {
      const c = await scr(150 + k * 5, 150);
      await touch('touchMove', [{ x: c.x, y: c.y }]);
      await p.waitForTimeout(30);
      samples.push(await p.evaluate(() => { const l = window.__pocao.game.scene.lina; return window.__pocao.walk.free(l.x, l.y, false); }));
    }
    await touch('touchEnd', []);
    check('andar: a bruxa não atravessa o caldeirão (colisão com móveis)', samples.every(Boolean), samples.map((x) => (x ? '.' : 'X')).join(''));
    // tocar no chão: ela vai até lá contornando os móveis
    // um ponto do chão do outro lado do caldeirão, fora da área de toque de qualquer estação
    const target = { x: 335, y: 162 };
    await p.evaluate(() => {
      const l = window.__pocao.game.scene.lina;
      l.x = l.tx = 150;
      l.y = l.ty = 150;
    });
    await p.evaluate(() => window.__pocao.game.camera.focus(245, 160));
    await p.waitForTimeout(900);
    const fl = await scr(target.x, target.y);
    await p.touchscreen.tap(fl.x, fl.y);
    const path = [];
    for (let k = 0; k < 40; k++) {
      await p.waitForTimeout(60);
      path.push(await p.evaluate(() => { const l = window.__pocao.game.scene.lina; return [l.x, l.y, window.__pocao.walk.free(l.x, l.y, false)]; }));
    }
    const end = path[path.length - 1];
    check('andar: tocar no chão leva a bruxa até lá, contornando o caldeirão', Math.hypot(end[0] - target.x, end[1] - target.y) < 6 && path.every((q) => q[2]), `fim (${Math.round(end[0])},${Math.round(end[1])})`);
    // conversar: tocar na mentora longe → a bruxa vai até ela e a conversa abre, sem pausar
    await p.evaluate(() => window.__pocao.game.camera.focus(282, 120));
    await p.waitForTimeout(900);
    const t0 = await p.evaluate(() => window.__pocao.game.sim.t);
    const mo = await scr(282, 88);
    await p.touchscreen.tap(mo.x, mo.y);
    await p.waitForSelector('.talk', { timeout: 8000 });
    const talk1 = await p.textContent('.talk');
    check('conversa: tocar na Vó Morgana leva a bruxa até ela e abre a conversa', /Vó Morgana/.test(talk1) && /elo mais fraco/.test(talk1), talk1.slice(0, 120));
    const box = await p.evaluate(() => {
      const t = document.querySelector('.talk').getBoundingClientRect();
      const w = document.getElementById('stage-wrap').getBoundingClientRect();
      const btns = [...document.querySelectorAll('.talk-btns button')].map((x) => x.getBoundingClientRect().height);
      return { frac: t.height / w.height, minBtn: Math.min(...btns), inside: t.bottom <= w.bottom + 1 && t.top >= w.top };
    });
    check('conversa: caixa legível, sem cobrir a loja inteira, botões grandes', box.frac <= 0.75 && box.minBtn >= 44 && box.inside, JSON.stringify(box));
    await p.waitForTimeout(600);
    check('conversa: o jogo continua rodando durante a conversa', (await p.evaluate(() => window.__pocao.game.sim.t)) > t0 && (await p.evaluate(() => window.__pocao.game.running)));
    await p.tap('.talk [data-action="talk-more"]');
    const talk2 = await p.textContent('.talk p');
    check('conversa: "Me explica melhor" aprofunda a dica (sinais antes da resposta)', /dois sinais/.test(talk2), talk2.slice(0, 120));
    await p.tap('.talk [data-action="talk-more"]');
    const talk3 = await p.textContent('.talk p');
    check('conversa: no terceiro nível, a orientação direta com os números da partida', /Caldeirão faz só [\d,]+\/min/.test(talk3), talk3.slice(0, 160));
    await p.tap('.talk [data-action="talk-close"]');
    check('conversa: fechar volta ao jogo', (await p.$('.talk')) == null);
    // aprendiz da estação: fala do que vive ali
    await p.evaluate(() => window.__pocao.game.camera.focus(236, 150));
    await p.waitForTimeout(900);
    const wk = await scr(236, 150);
    await p.touchscreen.tap(wk.x, wk.y);
    await p.waitForSelector('.talk', { timeout: 8000 });
    let crew = await p.textContent('.talk');
    if (await p.$('.talk [data-action="talk-next"]')) {
      await p.tap('.talk [data-action="talk-next"]');
      crew = await p.textContent('.talk');
    }
    check('conversa: a aprendiz do Caldeirão (Brasa) fala da própria estação', /Brasa/.test(crew) && /poções esperando|dou conta|fila/.test(crew) && !/0 poções esperando/.test(crew), crew.replace(/\s+/g, ' ').slice(0, 160));
    await p.tap('.talk [data-action="talk-close"]');
    // tocar na própria bruxa: ela "pensa alto" o objetivo atual
    const lb = await p.evaluate(() => window.__pocao.game.scene.lina);
    const lp = await scr(lb.x, lb.y - 10);
    await p.touchscreen.tap(lp.x, lp.y);
    await p.waitForSelector('.talk');
    check('conversa: tocar na própria bruxa lembra o objetivo atual', /O que eu preciso fazer agora/.test(await p.textContent('.talk')));
    await p.tap('.talk [data-action="talk-close"]');
    // tocar no móvel continua selecionando a estação
    await p.evaluate(() => (window.__pocao.game.selected = null));
    await p.waitForFunction(() => window.__pocao.game.scene.lina.arrived && !window.__pocao.game.scene.lina.steering);
    await p.evaluate(() => window.__pocao.game.camera.focus(204, 150));
    await p.waitForTimeout(1200);
    const cal = await scr(204, 140);
    const dbg = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const g = window.__pocao.game; return (e?.id || e?.className) + ' ' + JSON.stringify(g.scene.pick(204, 140, g.sim, 8)); }, [cal.x, cal.y]);
    await p.touchscreen.tap(cal.x, cal.y);
    await p.waitForTimeout(200);
    check('andar/conversar não atrapalham: tocar no caldeirão ainda seleciona a estação', (await p.evaluate(() => window.__pocao.game.selected)) === 'caldeirao', dbg);
    await ctx.close();

    // computador: setas movem a bruxa; E conversa com quem estiver perto; mouse arrasta
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const d = await c2.newPage();
    d.on('pageerror', (e) => errors.push('[conversa pc] ' + String(e)));
    await d.goto(URL);
    await d.waitForSelector('.play-btn');
    await d.evaluate(heroStart, 'fase1');
    await d.waitForTimeout(250);
    for (let i = 0; i < 6; i++) {
      const b2 = await d.$('[data-action="dialogue-next"]');
      if (!b2) break;
      await b2.click();
      await d.waitForTimeout(60);
    }
    await d.evaluate(() => {
      const l = window.__pocao.game.scene.lina;
      l.x = l.tx = 260;
      l.y = l.ty = 200;
    });
    const p0 = await d.evaluate(() => ({ ...window.__pocao.game.scene.lina }));
    await d.keyboard.down('ArrowUp');
    await d.waitForTimeout(700);
    await d.keyboard.up('ArrowUp');
    await d.keyboard.down('ArrowRight');
    await d.waitForTimeout(700);
    await d.keyboard.up('ArrowRight');
    const p1 = await d.evaluate(() => ({ ...window.__pocao.game.scene.lina }));
    check('computador: as setas movem a bruxa', p1.y < p0.y - 10 && p1.x > p0.x + 10, `(${Math.round(p0.x)},${Math.round(p0.y)}) → (${Math.round(p1.x)},${Math.round(p1.y)})`);
    await d.evaluate(() => {
      const l = window.__pocao.game.scene.lina;
      l.x = l.tx = 270;
      l.y = l.ty = 110;
    });
    await d.keyboard.press('e');
    await d.waitForSelector('.talk', { timeout: 3000 }).catch(() => null);
    check('computador: tecla E conversa com quem está perto', /Vó Morgana/.test((await d.textContent('.talk').catch(() => '')) || ''));
    await d.keyboard.press('Escape');
    check('computador: Esc fecha a conversa', (await d.$('.talk')) == null);
    await c2.close();
  }

  // ---------------------------------------------------------------- loja ampliada no celular (câmera)
  {
    const start = (phase) => (ph) => {
      const g = window.__pocao.game;
      g.save.hero = { name: 'Teste', player: 'Teste', skin: '#f3cfa6', hair: '#8a4a22', hairStyle: 'longo', cloth: '#1f2c52', accent: '#46b06e', hat: 'bruxa', hatColor: '#121a33' };
      void g.startPhase(ph);
    };
    const geo = () => {
      const r = (q) => {
        const e = document.querySelector(q);
        if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
        const b = e.getBoundingClientRect();
        return { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height, w: b.width };
      };
      const g = window.__pocao.game;
      return {
        cam: document.body.classList.contains('cam'),
        s: g.camera.s,
        iw: innerWidth,
        ih: innerHeight,
        sw: document.documentElement.scrollWidth,
        wrap: r('#stage-wrap'),
        strip: r('#station-strip'),
        tab: r('#tabbar'),
        side: document.body.classList.contains('side-open') ? r('#side') : null,
        coach: r('#game-screen > .coach'),
        transform: document.getElementById('stage').style.transform,
        selected: g.selected,
      };
    };
    const open = async (vp, opts = {}) => {
      const ctx = await browser.newContext({ viewport: vp, isMobile: opts.mobile ?? true, hasTouch: true, deviceScaleFactor: opts.dpr ?? 2, ...(opts.screen ? { screen: opts.screen } : {}) });
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errors.push(String(e)));
      await p.goto(URL);
      await p.waitForSelector('.play-btn');
      return { ctx, p };
    };
    const skipDialogue = async (p) => {
      for (let i = 0; i < 6; i++) {
        const b = await p.$('[data-action="dialogue-next"]');
        if (!b) break;
        await b.click();
        await p.waitForTimeout(80);
      }
    };
    // escala antiga (loja inteira encolhida) = largura útil / 480; a nova precisa ser bem maior
    const sizes = [
      { name: '320×568', vp: { width: 320, height: 568 }, min: 1.4 },
      { name: '360×740', vp: { width: 360, height: 740 }, min: 1.6 },
      { name: '375×667', vp: { width: 375, height: 667 }, min: 1.5 },
      { name: '390×844', vp: { width: 390, height: 844 }, min: 1.7 },
      { name: '412×915', vp: { width: 412, height: 915 }, min: 1.8 },
      { name: '844×390 deitado', vp: { width: 844, height: 390 }, min: 1.6 },
    ];
    for (const sz of sizes) {
      for (const ph of ['turma', 'fase1']) {
        const { ctx, p } = await open(sz.vp);
        await p.evaluate(start(ph), ph);
        await p.waitForTimeout(250);
        await skipDialogue(p);
        await p.waitForTimeout(250);
        const m = await p.evaluate(geo);
        // antes: a loja inteira cabia na área (deitado: largura sem o trilho de abas, altura sem a barra superior)
        const old = sz.vp.width > sz.vp.height ? Math.min((sz.vp.width - 64) / 480, (sz.vp.height - 57) / 270) : sz.vp.width / 480;
        const portrait = sz.vp.height > sz.vp.width;
        const noOverlap = portrait
          ? m.wrap.b <= m.strip.t + 1 && (!m.coach || m.coach.t >= m.wrap.b - 1) && m.tab.t >= m.wrap.b
          : !m.coach || m.coach.l >= m.wrap.r - 1;
        check(
          `loja ampliada ${sz.name} (${ph === 'turma' ? 'modo rápido' : 'fase 1'}): escala ${m.s.toFixed(2)} (antes ${old.toFixed(2)}), loja ocupa a área, nada por cima`,
          m.cam && m.s >= sz.min && m.s >= old * 1.25 && m.wrap.w >= sz.vp.width * (portrait ? 0.99 : 0.55) && (portrait ? m.wrap.h >= sz.vp.height * 0.4 : true) && noOverlap && m.sw <= m.iw,
          JSON.stringify({ s: m.s, wrap: m.wrap, coach: m.coach, strip: m.strip }),
        );
        await ctx.close();
      }
    }

    // interações no celular comprido (390×844, fase 1)
    const { ctx, p } = await open({ width: 390, height: 844 });
    await p.evaluate(start('fase1'), 'fase1');
    await p.waitForTimeout(250);
    await skipDialogue(p);
    await p.waitForTimeout(300);
    let m = await p.evaluate(geo);
    // arrastar a loja move a câmera e não seleciona nada
    const before = m.transform;
    const sel0 = m.selected;
    const cx = m.wrap.l + m.wrap.w / 2;
    const cy = m.wrap.t + m.wrap.h / 2;
    const cdp = await ctx.newCDPSession(p);
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await touch('touchStart', cx, cy);
    for (let k = 1; k <= 8; k++) await touch('touchMove', cx - k * 20, cy);
    await touch('touchEnd', 0, 0);
    await p.waitForTimeout(200);
    m = await p.evaluate(geo);
    check('celular: arrastar a loja com o dedo mostra outra parte dela', m.transform !== before, `${before} → ${m.transform}`);
    check('celular: arrastar não seleciona nada por engano', m.selected === sel0, String(m.selected));
    // tocar numa estação da faixa leva a câmera até ela
    for (const id of ['preparo', 'resfriamento', 'balcao']) {
      await p.tap(`#station-strip [data-strip="${id}"]`);
      await p.waitForTimeout(1200);
      const vis = await p.evaluate((sid) => {
        const t = document.querySelector(`#overlay [data-tag="${sid}"]`).getBoundingClientRect();
        const w = document.getElementById('stage-wrap').getBoundingClientRect();
        const x = t.left + t.width / 2;
        return { inside: x > w.left && x < w.right && t.top >= w.top - 2 && t.bottom < w.bottom, sel: window.__pocao.game.selected };
      }, id);
      check(`celular: tocar em "${id}" na faixa seleciona e mostra a estação na loja`, vis.inside && vis.sel === id, JSON.stringify(vis));
    }
    // painel aberto fica abaixo da loja, que continua visível
    m = await p.evaluate(geo);
    check('celular: painel da estação abre abaixo da loja, sem cobri-la', !!m.side && m.side.t >= m.wrap.b - 1 && m.wrap.h >= 140, JSON.stringify({ wrap: m.wrap, side: m.side }));
    await p.tap('#side .sheet-x');
    await p.waitForTimeout(200);
    // toque um pouco fora do desenho da estação ainda acerta a estação mais próxima
    const near = await p.evaluate(() => {
      const g = window.__pocao.game;
      const c = document.getElementById('shop').getBoundingClientRect();
      const w = document.getElementById('stage-wrap').getBoundingClientRect();
      // procura um ponto à vista que, sem tolerância, é chão, mas fica a até ~8 px de tela de uma estação
      const k = c.width / 480;
      for (let y = w.top + 20; y < w.bottom - 20; y += 4)
        for (let x = w.left + 20; x < w.right - 20; x += 4) {
          const lx = (x - c.left) / k;
          const ly = (y - c.top) / k;
          if (g.scene.pick(lx, ly, g.sim, 0).kind !== 'floor') continue;
          const pk = g.scene.pick(lx, ly, g.sim, 8 / k);
          if (pk.kind === 'station' && g.scene.pick(lx, ly, g.sim, 14 / k).kind === 'station') return { x, y, id: pk.id };
        }
      return null;
    });
    if (near) {
      await p.evaluate(() => (window.__pocao.game.selected = null));
      await p.touchscreen.tap(near.x, near.y);
      await p.waitForTimeout(200);
    }
    check('celular: toque perto (não exatamente em cima) da estação a seleciona', !!near && (await p.evaluate(() => window.__pocao.game.selected)) === near.id, JSON.stringify(near));
    // "Ver tudo" mostra a loja inteira e "Aproximar" volta
    if (await p.$('#side .sheet-x')) await p.tap('#side .sheet-x');
    await p.waitForTimeout(200);
    await p.tap('.cam-btn');
    await p.waitForTimeout(200);
    m = await p.evaluate(geo);
    const fitAll = await p.evaluate(() => {
      const c = document.getElementById('shop').getBoundingClientRect();
      const w = document.getElementById('stage-wrap').getBoundingClientRect();
      return c.left >= w.left - 1 && c.right <= w.right + 1 && c.top >= w.top - 1 && c.bottom <= w.bottom + 1;
    });
    check('celular: "Ver tudo" mostra a loja inteira', fitAll, `escala ${m.s.toFixed(2)}`);
    await p.waitForTimeout(350);
    await p.tap('.cam-btn');
    await p.waitForTimeout(200);
    const s2 = await p.evaluate(() => window.__pocao.game.camera.s);
    check('celular: "Aproximar" volta à loja ampliada', s2 > m.s * 1.3, `${m.s.toFixed(2)} → ${s2.toFixed(2)}`);
    await ctx.close();

    // computador: sem câmera, loja inteira como antes
    {
      const { ctx, p } = await open({ width: 1280, height: 800 }, { mobile: false, dpr: 1 });
      await p.evaluate(start('fase1'), 'fase1');
      await p.waitForTimeout(250);
      await skipDialogue(p);
      const d = await p.evaluate(() => {
        const c = document.getElementById('shop').getBoundingClientRect();
        const w = document.getElementById('stage-wrap').getBoundingClientRect();
        return { c: [c.left, c.top, c.right, c.bottom], w: [w.left, w.top, w.right, w.bottom], cam: document.body.classList.contains('cam'), inside: c.left >= w.left && c.right <= w.right && c.top >= w.top && c.bottom <= w.bottom, ratio: c.width / c.height, t: document.getElementById('stage').style.transform };
      });
      check('computador: sem câmera, a loja inteira aparece como antes', !d.cam && d.inside && Math.abs(d.ratio - 16 / 9) < 0.02 && !d.t, JSON.stringify(d));
      await ctx.close();
    }

    // Chrome com "Site para computador": janela de 980 px numa tela de 412 px
    {
      const { ctx, p } = await open({ width: 980, height: 2000 }, { mobile: false, dpr: 1, screen: { width: 412, height: 915 } });
      await p.evaluate(start('fase1'), 'fase1');
      await p.waitForTimeout(250);
      await skipDialogue(p);
      await p.waitForTimeout(250);
      const d = await p.evaluate(() => ({
        zoom: Number(getComputedStyle(document.documentElement).zoom) || 1,
        cols: getComputedStyle(document.querySelector('#station-strip')).gridTemplateColumns.split(' ').length,
        cam: document.body.classList.contains('cam'),
        s: window.__pocao.game.camera.s,
        sw: document.documentElement.scrollWidth,
        iw: innerWidth,
      }));
      check('site para computador: página ampliada para a tela, layout de celular e loja ampliada', d.zoom > 2 && d.cols === 6 && d.cam && d.s > 1.6 && d.sw <= d.iw + 1, JSON.stringify(d));
      await p.click('#station-strip [data-strip="caldeirao"]');
      await p.waitForTimeout(1000);
      // ponto da loja que o próprio jogo considera o caldeirão, convertido para coordenadas da tela
      const tap = await p.evaluate(() => {
        const g = window.__pocao.game;
        g.selected = null;
        const c = document.querySelector('#shop').getBoundingClientRect();
        const pts = [];
        for (let y = 60; y < 240; y += 3)
          for (let x = 60; x < 420; x += 3) {
            const pk = g.scene.pick(x, y, g.sim);
            if (pk.kind === 'station' && pk.id === 'caldeirao') pts.push([x, y]);
          }
        if (!pts.length) return null;
        const [x, y] = pts[Math.floor(pts.length / 2)];
        return { x: c.left + (x / 480) * c.width, y: c.top + (y / 270) * c.height };
      });
      if (tap) await p.mouse.click(tap.x, tap.y);
      await p.waitForTimeout(200);
      check('site para computador: toque na loja acerta a estação certa', !!tap && (await p.evaluate(() => window.__pocao.game.selected)) === 'caldeirao', JSON.stringify(tap));
      await ctx.close();
    }
  }

  // ---------------------------------------------------------------- arquivo único (offline, sem servidor)
  {
    const single = join(root, 'dist', 'pocao-em-apuros.html');
    if (existsSync(single)) {
      const p = await newPage({ width: 1280, height: 720 });
      await p.goto('file://' + single);
      await p.waitForSelector('#title-menu .menu-list', { timeout: 5000 });
      check('versão em arquivo único abre sem servidor', true);
      await p.close();
    }
  }

  check('nenhum erro no console', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('execução sem exceções', false, String(e));
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
process.exit(failed.length ? 1 : 0);
