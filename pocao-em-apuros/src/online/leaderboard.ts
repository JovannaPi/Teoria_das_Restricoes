// Placar online: envia o resultado de cada fase e acompanha o ranking ao vivo.
// O Firebase é carregado sob demanda pela internet; sem conexão o jogo funciona normalmente
// e os resultados ficam guardados para envio posterior.
import type { HeroConfig } from '../game/hero';
import { COLLECTION, FIREBASE_CONFIG, FIREBASE_VERSION, RANKED_PHASES, SEASON } from './config';

export interface ScoreEntry {
  jogadorId: string;
  jogador: string;
  bruxa: string;
  visual: string;
  fase: string;
  pontos: number;
  estrelas: number;
  venceu: boolean;
  lucro: number;
  entregas: number;
}

export interface RankRow {
  jogadorId: string;
  jogador: string;
  bruxa: string;
  visual: string;
  total: number;
  vencidas: number;
  fases: Record<string, number>; // melhor pontuação vencida por fase
  ultima: number; // ms
}

export interface Ranking {
  geral: RankRow[];
  porFase: Record<string, RankRow[]>;
  entradas: number;
}

export type BoardStatus = 'carregando' | 'ok' | 'offline' | 'erro';

// ------------------------------------------------------------------ aparência compacta

const VISUAL_KEYS: (keyof HeroConfig)[] = ['skin', 'hair', 'hairStyle', 'cloth', 'accent', 'hat', 'hatColor'];

export function encodeVisual(h: HeroConfig): string {
  return VISUAL_KEYS.map((k) => String(h[k])).join('|');
}

export function decodeVisual(v: string): Partial<HeroConfig> {
  const parts = String(v || '').split('|');
  const out: Record<string, string> = {};
  VISUAL_KEYS.forEach((k, i) => {
    if (parts[i]) out[k] = parts[i];
  });
  return out as Partial<HeroConfig>;
}

// ------------------------------------------------------------------ ranking (puro, testável)

/** Soma a melhor pontuação de cada fase VENCIDA por jogador; empates: mais fases vencidas, depois quem chegou antes. */
export function computeRanking(rows: (ScoreEntry & { criadoMs?: number })[]): Ranking {
  const players = new Map<string, RankRow>();
  for (const r of rows) {
    if (!RANKED_PHASES.includes(r.fase as (typeof RANKED_PHASES)[number])) continue;
    let p = players.get(r.jogadorId);
    const t = r.criadoMs ?? 0;
    if (!p) {
      p = { jogadorId: r.jogadorId, jogador: r.jogador, bruxa: r.bruxa, visual: r.visual, total: 0, vencidas: 0, fases: {}, ultima: 0 };
      players.set(r.jogadorId, p);
    }
    if (t >= p.ultima) {
      p.ultima = t;
      p.jogador = r.jogador;
      p.bruxa = r.bruxa;
      p.visual = r.visual;
    }
    if (r.venceu) p.fases[r.fase] = Math.max(p.fases[r.fase] ?? 0, Math.round(r.pontos));
  }
  const all = [...players.values()];
  for (const p of all) {
    p.vencidas = Object.keys(p.fases).length;
    p.total = Object.values(p.fases).reduce((a, b) => a + b, 0);
  }
  const geral = all.filter((p) => p.vencidas > 0).sort((a, b) => b.total - a.total || b.vencidas - a.vencidas || a.ultima - b.ultima);
  const porFase: Record<string, RankRow[]> = {};
  for (const f of RANKED_PHASES) {
    porFase[f] = all.filter((p) => p.fases[f] != null).sort((a, b) => b.fases[f] - a.fases[f] || a.ultima - b.ultima);
  }
  return { geral, porFase, entradas: rows.length };
}

// ------------------------------------------------------------------ Firebase sob demanda

type Fs = {
  initializeFirestore: (app: unknown, opts: unknown) => unknown;
  collection: (db: unknown, path: string) => unknown;
  addDoc: (col: unknown, data: unknown) => Promise<unknown>;
  query: (...a: unknown[]) => unknown;
  where: (f: string, op: string, v: unknown) => unknown;
  limit: (n: number) => unknown;
  onSnapshot: (q: unknown, next: (snap: { docs: { data: () => Record<string, unknown> }[] }) => void, err: (e: Error) => void) => () => void;
  serverTimestamp: () => unknown;
};

let fsPromise: Promise<{ fs: Fs; db: unknown } | null> | null = null;

function loadFirestore(): Promise<{ fs: Fs; db: unknown } | null> {
  if (fsPromise) return fsPromise;
  fsPromise = (async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    try {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
      const appMod = (await import(/* @vite-ignore */ `${base}/firebase-app.js`)) as {
        initializeApp: (c: unknown, name: string) => unknown;
      };
      const fs = (await import(/* @vite-ignore */ `${base}/firebase-firestore.js`)) as Fs;
      const app = appMod.initializeApp(FIREBASE_CONFIG, 'pocao-em-apuros');
      // modo de conexão mais compatível (redes de faculdade, navegador do WhatsApp/Instagram)
      const db = fs.initializeFirestore(app, { experimentalForceLongPolling: true });
      return { fs, db };
    } catch {
      fsPromise = null; // tenta de novo numa próxima vez
      return null;
    }
  })();
  return fsPromise;
}

export type SubmitResult = 'ok' | 'offline' | 'negado';

export async function submitScore(e: ScoreEntry): Promise<SubmitResult> {
  const conn = await loadFirestore();
  if (!conn) return 'offline';
  const { fs, db } = conn;
  try {
    await withTimeout(
      fs.addDoc(fs.collection(db, COLLECTION), {
        jogadorId: e.jogadorId.slice(0, 40),
        jogador: e.jogador.slice(0, 24),
        bruxa: e.bruxa.slice(0, 18),
        visual: e.visual.slice(0, 120),
        fase: e.fase,
        pontos: Math.max(0, Math.min(100, Math.round(e.pontos))),
        estrelas: Math.max(0, Math.min(3, Math.round(e.estrelas))),
        venceu: !!e.venceu,
        lucro: Math.round(e.lucro),
        entregas: Math.round(e.entregas),
        temporada: SEASON,
        criadoEm: fs.serverTimestamp(),
      }),
      15000,
    );
    return 'ok';
  } catch (err) {
    return /permission|insufficient/i.test(String((err as Error)?.message || err)) ? 'negado' : 'offline';
  }
}

/** Acompanha o placar ao vivo. Retorna a função para parar de acompanhar. */
export function watchBoard(onData: (r: Ranking) => void, onStatus: (s: BoardStatus, msg?: string) => void): () => void {
  let stop: (() => void) | null = null;
  let cancelled = false;
  onStatus('carregando');
  void loadFirestore().then((conn) => {
    if (cancelled) return;
    if (!conn) {
      onStatus('offline', 'Sem conexão com a internet: o placar aparece quando houver rede.');
      return;
    }
    const { fs, db } = conn;
    const q = fs.query(fs.collection(db, COLLECTION), fs.where('temporada', '==', SEASON), fs.limit(3000));
    stop = fs.onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => {
          const x = d.data();
          const ts = x.criadoEm as { toMillis?: () => number } | null;
          return { ...(x as unknown as ScoreEntry), criadoMs: ts?.toMillis ? ts.toMillis() : Date.now() };
        });
        onStatus('ok');
        onData(computeRanking(rows));
      },
      (err) => {
        const denied = /permission|insufficient/i.test(String(err?.message || err));
        onStatus(
          'erro',
          denied
            ? 'O placar ainda não foi liberado no Firebase (falta colar as regras de segurança — veja docs/placar-online.md).'
            : 'Não foi possível carregar o placar agora.',
        );
      },
    );
  });
  return () => {
    cancelled = true;
    stop?.();
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
