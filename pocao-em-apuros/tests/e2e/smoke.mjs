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
  await page.fill('[data-hero-field="player"]', 'Aluna Teste');
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
  for (const a of ['title-phases', 'title-glossary', 'title-settings', 'title-about']) {
    await page.click(`[data-action="${a}"]`);
    await page.waitForTimeout(80);
    const bad = await deadButtons(page);
    check(`painel ${a} abre sem botões mortos`, (await page.isVisible('#title-panel')) && bad.length === 0, bad.join(', '));
  }

  // ---------------------------------------------------------------- tutorial completo
  await page.click('[data-action="title-back"]');
  await page.click('[data-action="title-start"][data-v="tutorial"]');
  check('criação da bruxa aparece antes da primeira partida', (await page.$('.creator')) != null);
  check('criação da bruxa sem botões mortos', (await deadButtons(page)).length === 0);
  await page.click('[data-action="hero-save"]');
  check('criação exige os nomes', await page.isVisible('.creator'));
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
  await page.click('.modal [data-action="modal-close"]');
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
  await page.click('[data-action="title-phases"]');
  await page.click('.phase-card[data-v="fase4"]');
  await skipDialogues(page);
  await page.click('.modal [data-action="modal-close"]');
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
    await m.tap('[data-action="title-start"][data-v="tutorial"]');
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
    // tocar na própria loja (canvas) seleciona a estação
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
    await m.tap('.modal [data-action="modal-close"]');
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
