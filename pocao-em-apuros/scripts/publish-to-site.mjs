// Copia o build (dist/) para ../pocao/, a pasta servida junto com o restante do site
// do repositório (por exemplo, pelo GitHub Pages): .../Teoria_das_Restricoes/pocao/
import { cpSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const src = join(process.cwd(), 'dist');
const dest = join(process.cwd(), '..', 'pocao');
if (!existsSync(src)) throw new Error('Rode "npm run build" antes.');
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log('Jogo publicado em ../pocao/ (abra pocao/index.html por um servidor, ou pocao/pocao-em-apuros.html direto).');
