// Configuração do placar online (Firestore do projeto do Calend.rio, coleção separada só do jogo).
// Para trocar de projeto Firebase, substitua o objeto abaixo pelo do seu projeto.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDtwltPWQmwvcAMG9kU5t46a7PId4GgqbE',
  authDomain: 'calendario-3b725.firebaseapp.com',
  projectId: 'calendario-3b725',
  storageBucket: 'calendario-3b725.firebasestorage.app',
  messagingSenderId: '492897906274',
  appId: '1:492897906274:web:ab44cf81ac1098593d2b3b',
};

export const FIREBASE_VERSION = '10.14.1';

/** Coleção onde ficam as pontuações. */
export const COLLECTION = 'pocao_placar';

/**
 * "Temporada" da competição. Para começar um placar novo (outra turma, outro semestre),
 * troque este valor e publique de novo: as pontuações antigas deixam de aparecer.
 */
export const SEASON = 'turma-2026';

/** Fases que contam para o placar. */
export const RANKED_PHASES = ['fase1', 'fase2', 'fase3', 'fase4', 'fase5', 'mestra'] as const;
