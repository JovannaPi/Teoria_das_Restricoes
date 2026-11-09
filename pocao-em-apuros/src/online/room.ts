// "Sala da turma": o professor abre uma sala no projetor e os alunos entram pelo QR da sala.
// Cada celular envia um resumo do próprio progresso no modo rápido (em que passo está, se achou o
// gargalo de primeira, em que armadilhas caiu, o resultado no fim). O telão junta tudo ao vivo,
// sem expor quem errou: só contagens. Nada de dado pessoal — o nome que aparece é o da bruxa.
import { currentGameUrl } from './qr';
import { loadFirestore, withTimeout } from './leaderboard';

export const ROOM_COLLECTION = 'pocao_sala';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L
const KEEP_MS = 12 * 3600 * 1000;

/** O que cada celular envia (um documento por aluno por sala). */
export interface RoomEntry {
  sala: string;
  jogadorId: string;
  bruxa: string;
  passo: number; // 0 problema · 1 identificar · 2 explorar · 3 subordinar · 4 elevar · 5 recomeçar · 6 resultado · 7 terminou
  erros: number; // palpites errados ao identificar o gargalo pela primeira vez
  preparo: boolean; // ajudou o Preparo (não era o gargalo)
  ocupado: boolean; // escolheu "todo mundo ocupado"
  fora: boolean; // investiu fora do gargalo
  capFim: number; // poções por minuto que a loja consegue no fim × 10 (-0 enquanto não terminou)
  pontos: number; // -1 enquanto não terminou
}

export const STEP_NAMES = ['O problema', 'Identificar', 'Explorar', 'Subordinar', 'Elevar', 'Recomeçar', 'Resultado', 'Terminou'];

export function isRoomCode(v: string | null | undefined): v is string {
  return !!v && /^[A-Z0-9]{4,6}$/.test(v);
}

export function newRoomCode(): string {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

export function roomUrl(code: string): string {
  return `${currentGameUrl()}?sala=${code}`;
}

function store(key: string, code: string | null): void {
  try {
    if (code) localStorage.setItem(key, JSON.stringify({ code, at: Date.now() }));
    else localStorage.removeItem(key);
  } catch {
    /* navegação privada: vale só nesta aba */
  }
}

function recall(key: string): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null') as { code: string; at: number } | null;
    return v && isRoomCode(v.code) && Date.now() - v.at < KEEP_MS ? v.code : null;
  } catch {
    return null;
  }
}

let joined: string | null | undefined;

/** Sala em que este celular está (vinda do link ?sala=CODIGO; vale por algumas horas). */
export function currentRoom(): string | null {
  if (joined !== undefined) return joined;
  const fromUrl = new URLSearchParams(location.search).get('sala')?.toUpperCase();
  if (isRoomCode(fromUrl)) store('pocao-sala', fromUrl);
  joined = isRoomCode(fromUrl) ? fromUrl : recall('pocao-sala');
  return joined;
}

export function leaveRoom(): void {
  joined = null;
  store('pocao-sala', null);
}

/** Sala aberta por este aparelho no projetor (para reabrir o mesmo painel). */
export function hostedRoom(): string | null {
  return recall('pocao-sala-painel');
}
export function rememberHostedRoom(code: string): void {
  store('pocao-sala-painel', code);
}

// ---------------------------------------------------------------- transporte (Firestore, ou falso nos testes)

export interface RoomBackend {
  put(id: string, data: RoomEntry): Promise<boolean>;
  watch(code: string, onRows: (rows: RoomEntry[]) => void, onStatus: (s: 'ok' | 'offline' | 'negado' | 'erro') => void): () => void;
}

const firestoreBackend: RoomBackend = {
  async put(id, data) {
    const conn = await loadFirestore();
    if (!conn) return false;
    const { fs, db } = conn;
    try {
      await withTimeout(fs.setDoc(fs.doc(db, ROOM_COLLECTION, id), { ...data, atualizadoEm: fs.serverTimestamp() }), 15000);
      return true;
    } catch {
      return false;
    }
  },
  watch(code, onRows, onStatus) {
    let stop: (() => void) | null = null;
    let cancelled = false;
    void loadFirestore().then((conn) => {
      if (cancelled) return;
      if (!conn) return onStatus('offline');
      const { fs, db } = conn;
      const q = fs.query(fs.collection(db, ROOM_COLLECTION), fs.where('sala', '==', code), fs.limit(400));
      stop = fs.onSnapshot(
        q,
        (snap) => {
          onStatus('ok');
          onRows(snap.docs.map((d) => d.data() as unknown as RoomEntry));
        },
        (err) => onStatus(/permission|insufficient/i.test(String(err?.message || err)) ? 'negado' : 'erro'),
      );
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  },
};

function backend(): RoomBackend {
  // os testes automáticos trocam o Firebase por uma versão em memória
  return (window as unknown as { __pocaoRoomBackend?: RoomBackend }).__pocaoRoomBackend ?? firestoreBackend;
}

// ---------------------------------------------------------------- envio do progresso (com fila curta)

let pending: RoomEntry | null = null;
let timer = 0;

export function reportRoom(entry: Omit<RoomEntry, 'sala'>, now = false): void {
  const sala = currentRoom();
  if (!sala) return;
  pending = { ...entry, sala, bruxa: (entry.bruxa || 'Bruxa').slice(0, 18), jogadorId: entry.jogadorId.slice(0, 40) };
  clearTimeout(timer);
  const send = () => {
    const e = pending;
    pending = null;
    if (e) void backend().put(`${e.sala}_${e.jogadorId}`, e);
  };
  if (now) send();
  else timer = window.setTimeout(send, 700);
}

export function watchRoom(code: string, onRows: (rows: RoomEntry[]) => void, onStatus: (s: 'ok' | 'offline' | 'negado' | 'erro') => void): () => void {
  return backend().watch(code, onRows, onStatus);
}

// ---------------------------------------------------------------- o que o telão mostra

export interface RoomSummary {
  total: number;
  porPasso: number[]; // quantos estão em cada passo (índices de STEP_NAMES)
  identificaram: number; // já passaram do passo "Identificar"
  dePrimeira: number; // desses, quantos acertaram de primeira
  preparo: number;
  ocupado: number;
  fora: number;
  terminaram: number;
  capMedia: number | null; // média de poções/min no fim, de quem terminou
  ranking: { bruxa: string; pontos: number; capFim: number }[];
}

export function summarize(rows: RoomEntry[]): RoomSummary {
  const porPasso = STEP_NAMES.map(() => 0);
  for (const r of rows) porPasso[Math.max(0, Math.min(7, r.passo))]++;
  const ident = rows.filter((r) => r.passo >= 2);
  const done = rows.filter((r) => r.passo >= 7 && r.pontos >= 0);
  return {
    total: rows.length,
    porPasso,
    identificaram: ident.length,
    dePrimeira: ident.filter((r) => r.erros === 0).length,
    preparo: rows.filter((r) => r.preparo).length,
    ocupado: rows.filter((r) => r.ocupado).length,
    fora: rows.filter((r) => r.fora).length,
    terminaram: done.length,
    capMedia: done.length ? done.reduce((t, r) => t + r.capFim, 0) / done.length / 10 : null,
    ranking: done
      .map((r) => ({ bruxa: r.bruxa, pontos: r.pontos, capFim: r.capFim / 10 }))
      .sort((a, b) => b.pontos - a.pontos || b.capFim - a.capFim)
      .slice(0, 10),
  };
}

/** Perguntas para o debate, a partir do que a própria turma fez. */
export function debatePrompts(s: RoomSummary): string[] {
  const out: string[] = [];
  const p = (n: number, um: string, varios: string) => (n === 1 ? `1 pessoa ${um}` : `${n} pessoas ${varios}`);
  if (s.identificaram) {
    const errou = s.identificaram - s.dePrimeira;
    out.push(
      errou
        ? `${errou === 1 ? '1 pessoa' : `${errou} pessoas`} de ${s.identificaram} ${errou === 1 ? 'errou' : 'erraram'} o gargalo antes de acertar. Que estação parecia o problema, e por que enganava?`
        : 'Todos acharam o gargalo de primeira. Que sinal entregou o Caldeirão?',
    );
  }
  if (s.preparo) out.push(`${p(s.preparo, 'ajudou', 'ajudaram')} o Preparo e nada mudou. Por que melhorar outra estação não aumenta as entregas?`);
  if (s.ocupado) out.push(`${p(s.ocupado, 'deixou', 'deixaram')} todo mundo ocupado. O que aconteceu com as filas e com as poções feitas antes da hora?`);
  if (s.fora) out.push(`${p(s.fora, 'investiu', 'investiram')} fora do gargalo. O que isso diz sobre investir antes de identificar a restrição?`);
  if (s.terminaram) out.push('Depois do segundo caldeirão, quem passou a segurar a loja? Por que o trabalho nunca "acaba"?');
  return out.slice(0, 4);
}
