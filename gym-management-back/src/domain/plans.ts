/**
 * Regras de plano (puras, sem I/O).
 *
 * - O plano tem N modalidades: quem entra nele ganha graduação inicial nas que
 *   ainda não tem. Trocar/sair do plano nunca remove modalidade (graduação fica).
 * - O plano pode ter turmas: quem entra vai para elas. Turma lotada é pulada
 *   (o aluno é salvo e recebe aviso). Ao trocar de plano, sai das turmas do
 *   plano antigo que não estão no novo.
 */

export interface ClassTransitionInput {
  /** Turmas pedidas pelo formulário (ou as atuais, se o formulário não mexeu). */
  base: string[];
  /** Turmas em que o aluno já está matriculado. */
  enrolled: string[];
  /** Turmas do plano anterior (vazio se não havia plano ou ele não mudou). */
  oldPlan: string[];
  /** Turmas do plano novo. */
  newPlan: string[];
  /** Turmas sem vaga (contando só alunos ativos). */
  full: string[];
}

export function planClassTransition(i: ClassTransitionInput): { finalIds: string[]; skippedFull: string[] } {
  const enrolled = new Set(i.enrolled);
  const newPlan = new Set(i.newPlan);
  // lotada só importa para quem ainda não está na turma
  const blocked = new Set(i.full.filter((id) => !enrolled.has(id)));
  const leaving = new Set(i.oldPlan.filter((id) => !newPlan.has(id)));

  const final = new Set(i.base.filter((id) => !leaving.has(id) && !(newPlan.has(id) && blocked.has(id))));
  const skippedFull: string[] = [];
  for (const id of newPlan) {
    if (blocked.has(id)) skippedFull.push(id);
    else final.add(id);
  }
  return { finalIds: [...final], skippedFull };
}

/** Modalidades do plano que o aluno ainda não tem. */
export function missingDisciplines(studentDisciplineIds: string[], planDisciplineIds: string[]): string[] {
  const has = new Set(studentDisciplineIds);
  return [...new Set(planDisciplineIds)].filter((id) => !has.has(id));
}

/** Toda turma do plano precisa ser de uma modalidade do plano. Devolve o nome da primeira que não é. */
export function classOutsidePlan(disciplineIds: string[], classGroups: { name: string; disciplineId: string }[]): string | null {
  const ok = new Set(disciplineIds);
  return classGroups.find((g) => !ok.has(g.disciplineId))?.name ?? null;
}

/** O que foi adicionado ao plano numa edição (para aplicar aos alunos atuais). */
export function added(before: string[], after: string[]): string[] {
  const b = new Set(before);
  return [...new Set(after)].filter((id) => !b.has(id));
}
