/**
 * Regras de graduação (puras, sem I/O).
 *
 * - Modalidades com graus (ex.: Jiu-jitsu, 4 graus por faixa): cada grau exige
 *   degreeMinMonths/degreeMinClasses desde a última graduação; ao completar os
 *   graus, a próxima faixa exige minMonths do nível atual contados desde a
 *   data da faixa e minClasses desde a última graduação.
 * - No último nível (ex.: faixa preta) os graus seguem até lastLevelMaxDegrees
 *   usando os requisitos do próprio nível.
 * - Demais modalidades: troca de nível exige os mínimos do nível atual.
 *   Nível sem mínimos (ou último) = topo, sem próxima graduação.
 */

export interface LevelDef {
  order: number;
  name: string;
  color: string;
  minMonths: number | null;
  minClasses: number | null;
}

export interface DisciplineRules {
  system: string;
  levels: LevelDef[];
  degreesPerLevel: number;
  lastLevelMaxDegrees: number;
  degreeMinMonths: number | null;
  degreeMinClasses: number | null;
}

export interface RankState {
  levelOrder: number;
  degree: number;
  levelSince: Date;
  lastPromotionAt: Date;
  classesSince: number;
}

export interface Requirement {
  months: number;
  classes: number;
  kind: 'degree' | 'level';
}

export interface Progress {
  requirement: Requirement | null;
  next: { levelOrder: number; degree: number } | null;
  pct: number | null; // 0..1 (pode passar de 1)
  eligible: boolean;
  monthsLeft: number;
  classesLeft: number;
  status: string; // "Apto", "Faltam 3 meses", "Faltam 12 aulas", "Topo"
}

const MONTH_DAYS = 30.4;

function levelAt(rules: DisciplineRules, order: number): LevelDef | undefined {
  return rules.levels.find((l) => l.order === order);
}

function sorted(rules: DisciplineRules) {
  return [...rules.levels].sort((a, b) => a.order - b.order);
}

export function requirementFor(rules: DisciplineRules, rank: RankState): Requirement | null {
  const levels = sorted(rules);
  const idx = levels.findIndex((l) => l.order === rank.levelOrder);
  if (idx < 0) return null;
  const L = levels[idx];
  const isLast = idx === levels.length - 1;
  const has = (m: number | null, a: number | null) => m != null && a != null;

  if (rules.degreesPerLevel > 0) {
    if (isLast) {
      if (rank.degree < rules.lastLevelMaxDegrees && has(L.minMonths, L.minClasses))
        return { months: L.minMonths!, classes: L.minClasses!, kind: 'degree' };
      return null;
    }
    if (rank.degree < rules.degreesPerLevel && has(rules.degreeMinMonths, rules.degreeMinClasses))
      return { months: rules.degreeMinMonths!, classes: rules.degreeMinClasses!, kind: 'degree' };
  }
  if (isLast || !has(L.minMonths, L.minClasses)) return null;
  return { months: L.minMonths!, classes: L.minClasses!, kind: 'level' };
}

export function nextRank(rules: DisciplineRules, rank: RankState): { levelOrder: number; degree: number } | null {
  const req = requirementFor(rules, rank);
  const levels = sorted(rules);
  const idx = levels.findIndex((l) => l.order === rank.levelOrder);
  if (idx < 0) return null;
  if (req?.kind === 'degree') return { levelOrder: rank.levelOrder, degree: rank.degree + 1 };
  if (req?.kind === 'level' || idx < levels.length - 1) {
    const nxt = levels[idx + 1];
    return nxt ? { levelOrder: nxt.order, degree: 0 } : null;
  }
  return null;
}

export function progress(rules: DisciplineRules, rank: RankState, today: Date): Progress {
  const requirement = requirementFor(rules, rank);
  const next = nextRank(rules, rank);
  if (!requirement)
    return { requirement, next, pct: null, eligible: false, monthsLeft: 0, classesLeft: 0, status: next ? 'Sem requisito' : 'Topo' };

  // Para faixa com graus (BJJ), o tempo conta desde a data da faixa.
  const ref = rules.degreesPerLevel > 0 && requirement.kind === 'level' ? rank.levelSince : rank.lastPromotionAt;
  const days = (today.getTime() - ref.getTime()) / 86_400_000;
  const pt = days / (requirement.months * MONTH_DAYS);
  const pa = requirement.classes > 0 ? rank.classesSince / requirement.classes : 1;
  const eligible = pt >= 1 && pa >= 1;
  const monthsLeft = Math.max(0, Math.ceil((1 - pt) * requirement.months));
  const classesLeft = Math.max(0, requirement.classes - rank.classesSince);

  let status = 'Apto';
  if (!eligible) {
    if (pt < 1) {
      status =
        monthsLeft > 1
          ? `Faltam ${monthsLeft} meses`
          : `Faltam ${Math.max(1, Math.ceil(((1 - pt) * requirement.months * MONTH_DAYS) / 7))} sem.`;
    } else status = `Faltam ${classesLeft} aulas`;
  }
  return { requirement, next, pct: Math.min(pt, pa), eligible, monthsLeft, classesLeft, status };
}

/** "Azul · 2 graus" */
export function rankLabel(rules: DisciplineRules, levelOrder: number, degree: number): string {
  const L = levelAt(rules, levelOrder);
  const n = L?.name ?? '—';
  if (rules.degreesPerLevel > 0 && degree > 0) return `${n} · ${degree} grau${degree > 1 ? 's' : ''}`;
  return n;
}

/** Prefixo do título no histórico: "Faixa Azul", "Prajied Verde", "Corda Amarela", "Nível Básico". */
export function levelPrefix(system: string): string {
  const s = system.toLowerCase();
  if (s.startsWith('faixa')) return 'Faixa ';
  if (s.startsWith('prajied')) return 'Prajied ';
  if (s.startsWith('corda')) return 'Corda ';
  return 'Nível ';
}

export function promotionTitle(rules: DisciplineRules, levelOrder: number, degree: number, first = false): string {
  const L = levelAt(rules, levelOrder);
  const n = L?.name ?? '—';
  const t = degree > 0 ? `${n} · ${degree}º grau` : levelPrefix(rules.system) + n;
  return first ? `Início · ${t}` : t;
}

/** Faixa visual: cor, ponteira (BJJ preta; vermelha na faixa preta) e graus. */
export function beltVisual(rules: DisciplineRules, levelOrder: number, degree: number) {
  const L = levelAt(rules, levelOrder);
  const withDegrees = rules.degreesPerLevel > 0;
  const isLast = sorted(rules).at(-1)?.order === levelOrder;
  return {
    color: L?.color ?? '#888888',
    bar: withDegrees ? (isLast ? '#C8252C' : '#121212') : (L?.color ?? '#888888'),
    hasBar: withDegrees,
    stripes: withDegrees ? degree : 0,
    name: L?.name ?? '—',
    label: rankLabel(rules, levelOrder, degree),
  };
}
