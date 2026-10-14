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
    check('rápido: botão Jogar grande e visível sem rolar', pb.h >= 56 && pb.bottom <= pb.vh, `${Math.round(pb.h)} px de altura`);
    await m.screenshot({ path: join(shotsDir, 'rapido-01-inicio.png') });
    await m.tap('.play-btn');
    await m.waitForSelector('.creator');
    check('rápido: nome da bruxa já vem sugerido (sem dado pessoal)', (await m.inputValue('[data-hero-field="name"]')).length > 2);
    await m.tap('[data-action="hero-save"]');
    for (let i = 0; i < 3; i++) {
      const b = await m.$('[data-action="dialogue-next"]');
      if (!b) break;
      await b.tap();
    }
    await m.waitForSelector('.turma-coach');
    check('rápido: sem janela de objetivos em sequência', (await m.$('.modal')) == null);
    check('rápido: primeira tarefa é tocar numa estação', (await m.textContent('.turma-coach')).includes('Toque em uma estação'));
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
    const sheetOpen = () => m.evaluate(() => document.body.classList.contains('side-open'));
    await m.tap('#station-strip [data-strip="caldeirao"]');
    check('rápido: tocar numa estação abre o painel de baixo', await sheetOpen());
    await shot('02-painel');
    await m.tap('.sheet-x');
    check('rápido: o painel fecha e volta para a loja', !(await sheetOpen()));
    await m.tap('#station-strip [data-strip="embalagem"]');
    await m.tap('.sheet-x');
    await m.waitForTimeout(1100);
    await ff(30);
    check('rápido: pergunta onde está o acúmulo', (await coach()).includes('acumulando'));
    // resposta errada → explicação com dados; depois a certa (maior fila no momento)
    await choose('balcao');
    check('rápido: resposta errada explicada com os números', /fila na frente da estação Balcão tem \d+/.test(await coach()));
    const top = await m.evaluate(() => {
      const s = window.__pocao.game.sim;
      return Object.values(s.stations).sort((a, b) => b.queue.length - a.queue.length)[0].id;
    });
    await choose(top);
    await m.waitForTimeout(1400);
    check('rápido: passo 1 (identificar) com opções de estação', (await coach()).includes('qual estação está limitando'));
    await shot('03-identificar');
    await choose('embalagem');
    check('rápido: escolher a estação ocupada/parada errada é explicado ("não é o mesmo")', /não é o mesmo/.test(await coach()));
    await choose('caldeirao');
    check('rápido: restrição confirmada com evidências', /Isso! Caldeirão está ocupada \d+%/.test(await coach()));
    check('rápido: sem janela extra para o resultado da hipótese', (await m.$('.modal')) == null);
    await choose('ok');
    { const t = await coach(); check('rápido: passo 2 (explorar) com escolhas dentro do cartão', t.includes('nada precisa ser comprado'), t.slice(0, 160)); }
    await shot('04-explorar');
    await choose('breakCover');
    await ff(30);
    check('rápido: efeito medido depois da decisão', /ficava parado \d+% do tempo; agora \d+%/.test(await coach()));
    await choose('ok');
    check('rápido: passo 3 (subordinar)', (await coach()).includes('Como liberar o trabalho'));
    await choose('corda');
    await ff(30);
    check('rápido: corda mostra o estoque em processo antes → depois', /poções espalhadas pela loja: \d+ → \d+/.test(await coach()));
    await choose('ok');
    check('rápido: passo 4 (elevar) com preço das opções', /Segundo caldeirão/.test(await coach()));
    await shot('05-elevar');
    await choose('caldeirao_extra');
    check('rápido: compra pede confirmação (segundo toque)', /Toque de novo para confirmar/.test(await coach()));
    await choose('caldeirao_extra');
    await ff(30);
    check('rápido: investimento na restrição mostra o efeito', /Você elevou a restrição/.test(await coach()));
    await choose('ok');
    check('rápido: passo 5 (recomeçar)', (await coach()).includes('A loja mudou'));
    await choose('caldeirao');
    check('rápido: a restrição antiga não é mais a resposta', /não é o que limita a loja agora/.test(await coach()));
    await choose('destilacao');
    check('rápido: nova restrição (destilação) confirmada', /Isso! Destilação/.test(await coach()));
    await choose('ok');
    const tSim = await m.evaluate(() => window.__pocao.game.sim.t);
    check('rápido: os cinco passos cabem no dia de 5 minutos de jogo', tSim < 300, `${Math.round(tSim)} s de jogo`);
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
    check('rápido: passo 1 "em parte" (houve um palpite errado) e passos 2 a 5 feitos', statuses[0] === 'Em parte' && statuses.slice(1).every((x) => x === 'Feito'), statuses.join(' | '));
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
    // pular dicas: tudo liberado e a partida segue
    await m.tap('.turma-coach [data-action="quick-skip"]');
    check('rápido: pular dicas libera as decisões', !(await m.evaluate(() => window.__pocao.game.policyLocked('release'))));
    await m.tap('.turma-coach [data-action="quick-unskip"]');
    check('rápido: dicas podem ser reabertas', (await coach()).includes('Toque em uma estação'));
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
    check('slide tem título, instrução, tempo e endereço alternativo', /Poção em Apuros/.test(slideText) && /Aponte a câmera e jogue/.test(slideText) && /cerca de 5 minutos/.test(slideText) && /jovannapi\.github\.io/.test(slideText));
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

  // ---------------------------------------------------------------- celular comprido e "site para computador"
  {
    const hero = () => {
      const g = window.__pocao.game;
      g.save.hero = { name: 'Teste', player: 'Teste', skin: '#f3cfa6', hair: '#8a4a22', hairStyle: 'longo', cloth: '#1f2c52', accent: '#46b06e', hat: 'bruxa', hatColor: '#121a33' };
      void g.startPhase('fase1');
    };
    const measure = () => {
      const r = (s) => document.querySelector(s)?.getBoundingClientRect();
      const vis = ['#bottom', '#side'].map(r).filter((b) => b && b.height > 0);
      const area = vis[0];
      return {
        dock: document.body.classList.contains('dock'),
        zoom: Number(getComputedStyle(document.documentElement).zoom) || 1,
        sw: document.documentElement.scrollWidth,
        iw: innerWidth,
        tabTop: r('#tabbar').top,
        areaBottom: area ? area.bottom : 0,
        stripCols: getComputedStyle(document.querySelector('#station-strip')).gridTemplateColumns.split(' ').length,
        sidePos: getComputedStyle(document.querySelector('#side')).position,
        stage: r('#stage').width / r('#stage-wrap').width,
      };
    };
    // celular comprido normal: o painel encaixa no espaço livre (sem faixa vazia)
    const c1 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p1 = await c1.newPage();
    p1.on('pageerror', (e) => errors.push(String(e)));
    await p1.goto(URL);
    await p1.waitForSelector('.play-btn');
    await p1.evaluate(hero);
    await p1.waitForTimeout(300);
    for (let i = 0; i < 6; i++) { const b = await p1.$('[data-action="dialogue-next"]'); if (!b) break; await b.tap(); }
    let m = await p1.evaluate(measure);
    check('celular 390×844: espaço abaixo da loja ocupado até a barra de abas', m.dock && Math.abs(m.areaBottom - m.tabTop) <= 2, JSON.stringify(m));
    await p1.tap('#tabbar [data-tab-id="pedidos"]');
    await p1.waitForTimeout(250);
    m = await p1.evaluate(measure);
    check('celular 390×844: Pedidos encaixado no espaço livre (não cobre a loja)', m.sidePos === 'static' && Math.abs(m.areaBottom - m.tabTop) <= 2, JSON.stringify(m));
    await c1.close();
    // Chrome com "Site para computador": janela de 980 px numa tela de 412 px
    const c2 = await browser.newContext({ viewport: { width: 980, height: 2000 }, screen: { width: 412, height: 915 }, isMobile: false, hasTouch: true });
    const p2 = await c2.newPage();
    p2.on('pageerror', (e) => errors.push(String(e)));
    await p2.goto(URL);
    await p2.waitForSelector('.play-btn');
    await p2.evaluate(hero);
    await p2.waitForTimeout(300);
    for (let i = 0; i < 6; i++) { const b = await p2.$('[data-action="dialogue-next"]'); if (!b) break; await b.click(); }
    m = await p2.evaluate(measure);
    check('site para computador: página ampliada para a largura da tela, layout de celular', m.zoom > 2 && m.stripCols === 6 && m.dock, JSON.stringify(m));
    check('site para computador: sem rolagem lateral, loja na largura toda, sem faixa vazia', m.sw <= m.iw + 1 && m.stage > 0.98 && Math.abs(m.areaBottom - m.tabTop) <= 3, JSON.stringify(m));
    await p2.click('#station-strip [data-strip="caldeirao"]');
    await p2.waitForTimeout(250);
    const sel = await p2.evaluate(() => window.__pocao.game.selected);
    await p2.click('#station-strip [data-strip="preparo"]');
    await p2.waitForTimeout(150);
    // ponto da loja que o próprio jogo considera o caldeirão, convertido para coordenadas da tela
    const tapShop = await p2.evaluate(() => {
      const g = window.__pocao.game;
      const c = document.querySelector('#shop').getBoundingClientRect();
      const pts = [];
      for (let y = 60; y < 240; y += 3) for (let x = 60; x < 420; x += 3) {
        const pk = g.scene.pick(x, y, g.sim);
        if (pk.kind === 'station' && pk.id === 'caldeirao') pts.push([x, y]);
      }
      if (!pts.length) return null;
      const [x, y] = pts[Math.floor(pts.length / 2)];
      return { x: c.left + (x / 480) * c.width, y: c.top + (y / 270) * c.height };
    });
    if (tapShop) await p2.mouse.click(tapShop.x, tapShop.y);
    await p2.waitForTimeout(200);
    check('site para computador: toque na loja acerta a estação certa', !!tapShop && (await p2.evaluate(() => window.__pocao.game.selected)) === 'caldeirao', JSON.stringify(tapShop));
    await c2.close();
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
