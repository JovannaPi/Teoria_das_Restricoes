// Personagens fixos e gerador de clientes.

export interface CharacterDef {
  id: string;
  name: string;
  role: string;
}

export const CHARACTERS: Record<string, CharacterDef> = {
  protagonista: { id: 'protagonista', name: 'Lina Brasaverde', role: 'herdeira da loja' },
  mentora: { id: 'mentora', name: 'Vó Morgana', role: 'alquimista mentora' },
  aprendiz: { id: 'aprendiz', name: 'Tico', role: 'aprendiz apressado' },
  comerciante: { id: 'comerciante', name: 'Madame Trufa', role: 'comerciante de ingredientes' },
  gato: { id: 'gato', name: 'Fuligem', role: 'gato da loja' },
};

// Espécies dos clientes: determinam silhueta e cores no gerador de sprites.
export const CLIENT_SPECIES = ['humana', 'elfa', 'goblin', 'anão', 'espectro', 'sapo-mago', 'fauna'] as const;

export const CLIENT_NAMES = [
  'Sr. Bartolomeu',
  'Dona Clotilde',
  'Grizz, o goblin',
  'Elara do Bosque',
  'Mestre Thorin',
  'Fantasma Osvaldo',
  'Sapo Leopoldo',
  'Iara Ventania',
  'Cavaleira Brunilda',
  'Pip, o fauno',
  'Madame Zuleica',
  'Joca Pé-de-Ferro',
  'Lady Nocturna',
  'Bardo Fagundes',
  'Irmã Hortênsia',
  'Ruivo, o anão',
  'Nhá Benta',
  'Professor Quirino',
  'Moema das Águas',
  'Tavinho Faísca',
];

// Falas curtas de clientes por situação.
export const CLIENT_LINES = {
  chegada: [
    'Preciso disso para hoje, por favor!',
    'Dizem que esta loja voltou a funcionar...',
    'Minha avó comprava aqui. Vamos ver.',
    'É urgente, mas não tanto. Talvez.',
    'Tem cheiro de canela e enxofre. Bom sinal.',
  ],
  feliz: ['Perfeito! Volto amanhã.', 'Na hora certa!', 'Que frasco lindo!', 'Vou contar para a guilda inteira.'],
  atraso: ['Demorou, hein...', 'Quase desisti.', 'Da próxima vez, mais rápido.'],
  desistiu: ['Cansei de esperar!', 'Vou na loja do vale.', 'Nunca mais!'],
};
