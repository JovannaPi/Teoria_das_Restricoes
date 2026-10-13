// Relatório de balanceamento (executado via vitest em tests/balance.test.ts).
import { getPhase } from '../src/data/phases';
import { STATION_ORDER } from '../src/data/stations';
import { analyzeCapacity } from '../src/sim/analysis';
import { createSim } from '../src/sim/engine';
import { Lever, Plan, runPlan, runStrategy, STRATEGIES } from '../tests/strategies';

export function loadsLine(phaseId: string): string {
  const s = createSim(getPhase(phaseId).scenario);
  const a = analyzeCapacity(s);
  return (
    `cargas iniciais (demanda ${a.demandPerMin.toFixed(1)}/min): ` +
    STATION_ORDER.map((id) => `${id.slice(0, 5)}=${a.loads[id].load.toFixed(2)}`).join(' ') +
    ` → ${a.constraint}`
  );
}

export function report(phases: string[], seeds: number[] = [], withLevers = false): string {
  const lines: string[] = [];
  for (const p of phases) {
    lines.push(`\n=== ${p} ===`);
    lines.push(loadsLine(p));
    const rows: [string, (sd?: number) => ReturnType<typeof runStrategy>][] = STRATEGIES.map((st) => [st, (sd?: number) => runStrategy(p, st, sd)]);
    if (withLevers) {
      for (const lv of ['ajuda', 'limpeza', 'intervalo', 'inspecao', 'prioridade', 'pulmao'] as Lever[]) {
        const plan: Plan = { levers: [lv], sync: false, push: false, invest: 'nenhum', identify: 'certo', retie: false };
        rows.push(['só ' + lv, (sd?: number) => runPlan(p, plan, 'só ' + lv, sd)]);
      }
    }
    for (const [name, fn] of rows) {
      const runs = [fn(), ...seeds.map((sd) => fn(sd))];
      const r = runs[0];
      const wins = runs.filter((x) => x.won).length;
      lines.push(
        `${name.padEnd(19)} ent=${String(r.delivered).padStart(3)} LL=${String(r.netProfit).padStart(5)} caixa=${String(r.cash).padStart(5)} wip=${String(r.avgWip).padStart(5)} canc=${r.canceled} atr=${r.late} rep=${r.reputation} rest=${r.finalConstraint} ${r.won ? 'VENCE' : 'perde'} (${wins}/${runs.length}) ${r.defeat ?? ''} | ${r.objectives}`,
      );
    }
  }
  return lines.join('\n');
}
