import { WEEKDAYS_SHORT, hm } from '../common/util';

export interface Slot {
  id?: string;
  weekday: number;
  startMin: number;
  endMin: number;
}

/** "Seg · Qua · Sex" + "19:30–21:00", ou "Seg 07:00 · Qua 19:00" + "2 horários" */
export function slotSummary(slots: Slot[]): { days: string; time: string } {
  const sl = [...slots].sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
  if (!sl.length) return { days: 'Sem horário', time: '' };
  const same = sl.every((x) => x.startMin === sl[0].startMin && x.endMin === sl[0].endMin);
  return same
    ? { days: sl.map((x) => WEEKDAYS_SHORT[x.weekday]).join(' · '), time: `${hm(sl[0].startMin)}–${hm(sl[0].endMin)}` }
    : { days: sl.map((x) => `${WEEKDAYS_SHORT[x.weekday]} ${hm(x.startMin)}`).join(' · '), time: `${sl.length} horários` };
}

/** Horários que se sobrepõem no tatame (ignora o próprio slot). */
export function findConflicts(
  groups: { name: string; slots: Slot[] }[],
  weekday: number,
  startMin: number,
  endMin: number,
  ignoreSlotId?: string,
): string[] {
  const out: string[] = [];
  for (const g of groups)
    for (const s of g.slots) {
      if (ignoreSlotId && s.id === ignoreSlotId) continue;
      if (s.weekday === weekday && s.startMin < endMin && startMin < s.endMin) out.push(`${g.name} (${hm(s.startMin)}–${hm(s.endMin)})`);
    }
  return out;
}
