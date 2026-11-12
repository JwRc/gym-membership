/**
 * Dados de demonstração (baseados no protótipo "Academia Tatame v2").
 * Datas relativas a hoje, geração determinística (mesma semente = mesmos dados).
 *
 *   ricardo@academiatatame.com.br / tatame123  → admin, Academia Tatame (92 alunos)
 *   joao.santos@gmail.com         / aluno123   → aluno, Academia Tatame
 *   helena@ctkaizen.com.br        / kaizen123  → admin, CT Kaizen (academia nova, onboarding)
 */
import { PaymentMethod, Prisma, PrismaClient, StudentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CATALOG } from '../src/domain/catalog';
import { DisciplineRules, promotionTitle, requirementFor } from '../src/domain/graduation';
import { addDays, dateOnly, today, ymd } from '../src/common/util';

if (process.env.NODE_ENV === 'production') {
  console.error('Seed de demonstração bloqueado em produção (NODE_ENV=production).');
  process.exit(1);
}

const prisma = new PrismaClient();
const T0 = today();
const Y0 = T0.getUTCFullYear();
const M0 = T0.getUTCMonth() + 1; // 1–12
const D0 = T0.getUTCDate();

let seed = 20261030;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const W = (ws: number[]) => {
  const x = rnd();
  let acc = 0;
  for (let i = 0; i < ws.length; i++) if (x < (acc += ws[i])) return i;
  return 0;
};
/** mês relativo: rel(0) = mês atual, rel(-1) = anterior */
const rel = (k: number) => {
  const m0 = M0 - 1 + k;
  return { y: Y0 + Math.floor(m0 / 12), m: (((m0 % 12) + 12) % 12) + 1 };
};

type Lv = [name: string, color: string, m: number | null, a: number | null, color2?: string];
const cat = (id: string) => CATALOG.find((c) => c.id === id)!;

async function wipe() {
  // Apaga só as academias de demonstração. Vendas primeiro (itens referenciam produtos).
  const where = { code: { in: ['TATAME-4821', 'KAIZEN-3170'] } };
  await prisma.sale.deleteMany({ where: { tenant: where } });
  await prisma.tenant.deleteMany({ where });
}

async function upsertCatalog() {
  for (const c of CATALOG) {
    const data = {
      name: c.name, color: c.color, system: c.system, degreesPerLevel: c.degreesPerLevel ?? 0, lastLevelMaxDegrees: c.lastLevelMaxDegrees ?? 0,
      degreeMinMonths: c.degreeMinMonths ?? null, degreeMinClasses: c.degreeMinClasses ?? null,
    };
    await prisma.catalogDiscipline.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
    await prisma.catalogLevel.deleteMany({ where: { disciplineId: c.id } });
    await prisma.catalogLevel.createMany({
      data: c.levels.map(([name, color, minMonths, minClasses, color2], order) => ({ disciplineId: c.id, order, name, color, color2: color2 ?? null, minMonths, minClasses })),
    });
  }
}

async function createDiscipline(
  tenantId: string,
  originId: string | null,
  instructorId: string,
  price: number,
  copy?: { name: string; color: string; system: string; levels: Lv[]; at?: Date },
) {
  const c = originId ? cat(originId) : null;
  const levels: Lv[] = copy?.levels ?? c!.levels;
  return prisma.discipline.create({
    data: {
      tenantId, originId, instructorId, monthlyPrice: price,
      name: copy?.name ?? c!.name, color: copy?.color ?? c!.color, system: copy?.system ?? c!.system,
      degreesPerLevel: c?.degreesPerLevel ?? 0, lastLevelMaxDegrees: c?.lastLevelMaxDegrees ?? 0,
      degreeMinMonths: c?.degreeMinMonths ?? null, degreeMinClasses: c?.degreeMinClasses ?? null,
      customizedAt: copy ? (copy.at ?? addDays(T0, -60)) : null,
      levels: { create: levels.map(([name, color, minMonths, minClasses, color2], order) => ({ order, name, color, color2: color2 ?? null, minMonths, minClasses })) },
    },
    include: { levels: true },
  });
}

function rulesOf(d: Awaited<ReturnType<typeof createDiscipline>>): DisciplineRules {
  return {
    system: d.system, degreesPerLevel: d.degreesPerLevel, lastLevelMaxDegrees: d.lastLevelMaxDegrees,
    degreeMinMonths: d.degreeMinMonths, degreeMinClasses: d.degreeMinClasses,
    levels: [...d.levels].sort((a, b) => a.order - b.order),
  };
}

async function seedTatame(hash: (s: string) => Promise<string>) {
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Academia Tatame', initials: 'AT', code: 'TATAME-4821', cnpj: '34.512.887/0001-20', phone: '(11) 3456-7821',
      address: 'Rua Harmonia, 412 — Vila Madalena, São Paulo/SP',
    },
  });
  const tid = tenant.id;
  const [ricardo, thiago, daniela] = await Promise.all(
    ['Ricardo Almeida', 'Thiago Nogueira', 'Daniela Prado'].map((name) => prisma.instructor.create({ data: { tenantId: tid, name } })),
  );
  const bjj = await createDiscipline(tid, 'bjj', ricardo.id, 220);
  const mt = await createDiscipline(tid, 'mt', thiago.id, 190);
  const box = await createDiscipline(tid, 'box', daniela.id, 170, {
    name: 'Boxe', color: '#2EC4B6', system: 'Níveis', at: addDays(T0, -80),
    levels: [['Iniciante', '#C9CED6', 3, 24], ['Básico', '#86D9CF', 6, 48], ['Intermediário', '#2EC4B6', 9, 72], ['Avançado', '#17877D', 12, 96], ['Competidor', '#D9A441', null, null]],
  });
  const D = { bjj, mt, box } as const;
  type DK = keyof typeof D;
  const instr: Record<DK, string> = { bjj: ricardo.name, mt: thiago.name, box: daniela.name };

  const plans = [
    ['Mensal · Jiu-jitsu', '1 modalidade, todas as turmas', 220], ['Mensal · Muay Thai', '1 modalidade, todas as turmas', 190],
    ['Mensal · Boxe', '1 modalidade, todas as turmas', 170], ['Combo 2 modalidades', 'Qualquer combinação', 250],
    ['Plano Kids', 'Jiu-jitsu Kids, até 13 anos', 150], ['Plano Manhã', 'Turmas até 13h', 120],
  ] as const;
  const P = await Promise.all(plans.map(([name, description, price]) => prisma.plan.create({ data: { tenantId: tid, name, description, price } })));
  const planFor = (mods: DK[], age: number) =>
    age < 14 ? P[4] : mods.length > 1 ? P[3] : mods[0] === 'bjj' ? P[0] : mods[0] === 'mt' ? P[1] : P[2];

  // ── Alunos ──────────────────────────────────────────────
  type X = { apto?: DK; dob?: [number, number, number]; mens?: number; venc?: number; tel?: string; med?: string; resp?: [string, string, string]; late?: boolean; bdayToday?: boolean };
  const fixed: [string, 'M' | 'F', Partial<Record<DK, [number, number?]>>, X][] = [
    ['João Victor Santos', 'M', { bjj: [1, 4] }, { apto: 'bjj', dob: [14, 3, 1998], mens: 220, venc: 5, tel: '(11) 98432-1170', med: 'Reconstrução de LCA no joelho esquerdo (2021). Evitar chave de calcanhar e raspagens com torção de joelho.' }],
    ['Camila Ribeiro', 'F', { bjj: [0, 4], mt: [1] }, { apto: 'bjj', dob: [2, 6, 2001], mens: 250, venc: 10 }],
    ['Felipe Andrade', 'M', { mt: [1] }, { apto: 'mt', dob: [21, 11, 1995], mens: 190, venc: 15 }],
    ['Larissa Mendes', 'F', { box: [1] }, { apto: 'box', dob: [8, 4, 1993], mens: 170, venc: 1 }],
    ['Diego Nascimento', 'M', { bjj: [2, 4] }, { apto: 'bjj', dob: [19, 7, 1989], mens: 220, venc: 5 }],
    ['Enzo Gabriel Freitas', 'M', { bjj: [0, 3] }, { apto: 'bjj', dob: [11, 2, 2016], mens: 150, venc: 10, resp: ['Renata Freitas', 'Mãe', '(11) 99104-2283'] }],
    ['Rafael Moreira', 'M', { bjj: [2, 2] }, { bdayToday: true, dob: [0, 0, 1998], mens: 220, venc: 5 }],
    ['Beatriz Lima', 'F', { bjj: [0, 2] }, { bdayToday: true, dob: [0, 0, 2014], mens: 150, venc: 10, resp: ['Patrícia Lima', 'Mãe', '(11) 98712-4410'], med: 'Asma leve. Mantém a bombinha na mochila.' }],
    ['Gabriel Martins', 'M', { bjj: [1, 2], mt: [2] }, { late: true, mens: 250, venc: 5 }],
    ['Mariana Costa', 'F', { bjj: [1, 1] }, { late: true, mens: 220, venc: 10 }],
    ['Juliana Rocha', 'F', { mt: [3], box: [2] }, { late: true, mens: 240, venc: 15 }],
    ['Lucas Ferreira', 'M', { mt: [0] }, { late: true, mens: 180, venc: 20 }],
    ['Pedro Henrique Souza', 'M', { box: [0] }, { late: true, mens: 150, venc: 20 }],
    ['Bruno Carvalho', 'M', { bjj: [3, 3] }, { dob: [3, M0, 1990] }],
    ['Amanda Teixeira', 'F', { mt: [3] }, { dob: [9, M0, 1996] }],
    ['Gustavo Araújo', 'M', { bjj: [4, 1], box: [2] }, { dob: [15, M0, 1987] }],
    ['Letícia Barbosa', 'F', { box: [2] }, { dob: [22, M0, 2003] }],
    ['Matheus Cardoso', 'M', { bjj: [1, 2] }, { dob: [27, M0, 1999] }],
    ['Isabela Duarte', 'F', { mt: [2], bjj: [0, 1] }, { dob: [28, M0, 2000] }],
  ];
  const FM = ['Rodrigo', 'Vinícius', 'Leonardo', 'Eduardo', 'André', 'Caio', 'Henrique', 'Daniel', 'Marcelo', 'Samuel', 'Arthur', 'Davi', 'Igor', 'Renan', 'Otávio', 'Murilo', 'Fábio', 'Leandro', 'Vitor', 'Guilherme', 'Ricardo', 'Paulo', 'Fernando', 'Alexandre'];
  const FF = ['Ana Clara', 'Fernanda', 'Aline', 'Carolina', 'Natália', 'Bianca', 'Gabriela', 'Priscila', 'Raquel', 'Vanessa', 'Tatiane', 'Luana', 'Sofia', 'Yasmin', 'Bruna', 'Júlia'];
  const SN = ['Silva', 'Oliveira', 'Pereira', 'Gomes', 'Rodrigues', 'Almeida', 'Lopes', 'Carvalho', 'Barros', 'Pinto', 'Cavalcanti', 'Monteiro', 'Vieira', 'Batista', 'Campos', 'Correia', 'Dias', 'Fonseca', 'Machado', 'Ramos', 'Siqueira', 'Tavares', 'Xavier', 'Medeiros', 'Peixoto', 'Rezende', 'Brandão', 'Coelho', 'Antunes', 'Queiroz'];
  const MEDS = ['Hipertensão controlada com medicação.', 'Alergia a dipirona.', 'Hérnia de disco L5-S1 — evitar quedas de alto impacto.', 'Rinite alérgica.', 'Luxação recorrente no ombro direito.'];
  const LOTW: [number, number][] = [[1, 20], [5, 24], [10, 16], [15, 8], [20, 6], [30, 6]];
  const pickVenc = () => {
    let r = rnd() * 80;
    for (const [d, w] of LOTW) if ((r -= w) < 0) return d;
    return 5;
  };

  const specs = fixed.map(([name, g, lv, x]) => ({ name, g, lv, x, fixed: true }));
  const used = new Set(specs.map((s) => s.name));
  let k = 0;
  while (specs.length < 92) {
    const g = rnd() < 0.68 ? 'M' : 'F';
    const name = (g === 'M' ? FM[k % FM.length] : FF[k % FF.length]) + ' ' + SN[(k * 7 + 3) % SN.length];
    k++;
    if (used.has(name)) continue;
    used.add(name);
    const r = rnd();
    const mods: DK[] = r < 0.42 ? ['bjj'] : r < 0.6 ? ['mt'] : r < 0.74 ? ['box'] : r < 0.86 ? ['bjj', 'mt'] : r < 0.94 ? ['mt', 'box'] : ['bjj', 'box'];
    const kid = rnd() < 0.09;
    const lv: Partial<Record<DK, [number, number?]>> = {};
    for (const m of kid ? (['bjj'] as DK[]) : mods) {
      if (m === 'bjj') lv.bjj = [kid ? 0 : W([0.46, 0.28, 0.14, 0.08, 0.04]), ri(0, 4)];
      if (m === 'mt') lv.mt = [W([0.3, 0.25, 0.18, 0.12, 0.08, 0.04, 0.02, 0.01])];
      if (m === 'box') lv.box = [W([0.34, 0.3, 0.2, 0.12, 0.04])];
    }
    specs.push({ name, g, lv, x: { kid } as X & { kid: boolean }, fixed: false });
  }

  const studentIds: { id: string; name: string; status: StudentStatus; mods: DK[]; age: number; g: 'M' | 'F'; levels: Partial<Record<DK, number>> }[] = [];
  const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
  const METHODS: PaymentMethod[] = ['PIX', 'PIX', 'CASH', 'DEBIT'];

  for (let idx = 0; idx < specs.length; idx++) {
    const sp = specs[idx];
    const x = sp.x as X & { kid?: boolean };
    let dob: Date;
    if (x.bdayToday) dob = ymd(x.dob![2], M0, D0);
    else if (x.dob) dob = ymd(x.dob[2], x.dob[1], x.dob[0]);
    else {
      const age = x.kid ? ri(7, 13) : rnd() < 0.12 ? ri(14, 17) : ri(18, 46);
      let mo = ri(1, 12);
      if (mo === M0) mo = ((M0 + 5) % 12) + 1; // aniversariantes do mês só os fixos
      dob = ymd(Y0 - age - (mo > M0 ? 1 : 0), mo, ri(1, 28));
    }
    const age = Math.floor((T0.getTime() - dob.getTime()) / (365.25 * 86_400_000));
    const mods = Object.keys(sp.lv) as DK[];
    const base = { bjj: 220, mt: 190, box: 170 };
    const mens = x.mens ?? (age < 14 ? 150 : mods.length > 1 ? 250 : rnd() < 0.15 ? base[mods[0]] - 50 : base[mods[0]]);
    const venc = x.venc ?? pickVenc();

    let status: StudentStatus = 'ACTIVE';
    if (!sp.fixed) {
      const gi = idx - fixed.length;
      if (gi >= 61 && gi < 69) status = 'INACTIVE';
      else if (gi >= 69) status = 'LOCKED';
    }

    // Graduações
    type RankSeed = { d: DK; levelOrder: number; degree: number; levelSince: Date; lastPromotionAt: Date; classesSince: number; hist: { levelOrder: number; degree: number; date: Date; first: boolean }[] };
    const ranks: RankSeed[] = [];
    for (const m of mods) {
      const [i, g0] = sp.lv[m]!;
      const g = g0 ?? 0;
      const rules = rulesOf(D[m]);
      const r = requirementFor(rules, { levelOrder: i, degree: g, levelSince: T0, lastPromotionAt: T0, classesSince: 0 });
      let p = x.apto === m ? 1.08 + rnd() * 0.25 : sp.fixed ? 0.3 + rnd() * 0.55 : 0.12 + rnd() * 0.84;
      if (!sp.fixed && rnd() < 0.05) p = 1.05 + rnd() * 0.2;
      let levelSince: Date, lastPromotionAt: Date, classesSince: number;
      if (!r) {
        levelSince = addDays(T0, -ri(200, 1300));
        lastPromotionAt = levelSince;
        classesSince = ri(80, 320);
      } else {
        const days = r.months * 30.4 * p;
        classesSince = Math.round(r.classes * (p >= 1 ? p : p * (0.9 + rnd() * 0.15)));
        if (m === 'bjj' && r.kind === 'level') {
          levelSince = addDays(T0, -days);
          lastPromotionAt = addDays(T0, -Math.min(days * 0.25, ri(40, 120)));
        } else {
          lastPromotionAt = addDays(T0, -days);
          levelSince = m === 'bjj' ? addDays(lastPromotionAt, -(g * ri(115, 150))) : lastPromotionAt;
        }
      }
      const hist: RankSeed['hist'] = [];
      if (m === 'bjj')
        for (let j = g; j >= 1; j--) hist.push({ levelOrder: i, degree: j, date: addDays(levelSince, ((lastPromotionAt.getTime() - levelSince.getTime()) / 86_400_000) * (j / g)), first: false });
      hist.push({ levelOrder: i, degree: 0, date: levelSince, first: i === 0 });
      let d = levelSince;
      for (let q = i - 1; q >= 0; q--) {
        d = addDays(d, -(rules.levels[q].minMonths ?? 6) * 30.4 * (1.05 + rnd() * 0.4));
        hist.push({ levelOrder: q, degree: 0, date: d, first: q === 0 });
      }
      ranks.push({ d: m, levelOrder: i, degree: g, levelSince, lastPromotionAt, classesSince, hist });
    }
    let start = new Date(Math.min(...ranks.map((r) => r.hist[r.hist.length - 1].date.getTime())));
    const minStart = ymd(dob.getUTCFullYear() + 5, dob.getUTCMonth() + 1, dob.getUTCDate());
    if (start < minStart) start = minStart;

    const norm = sp.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ');
    const email = sp.name === 'João Victor Santos' ? 'joao.santos@gmail.com' : `${norm[0]}.${norm[norm.length - 1]}${rnd() < 0.3 ? ri(10, 99) : ''}@${pick(['gmail.com', 'gmail.com', 'hotmail.com', 'outlook.com'])}`;
    const phone = x.tel ?? `(11) 9${ri(6000, 9999)}-${ri(1000, 9999)}`;
    let resp = x.resp ?? null;
    if (!resp && age < 18) resp = [pick(['Cláudia', 'Marcos', 'Sandra', 'Roberto', 'Adriana']) + ' ' + sp.name.split(' ').slice(-1)[0], pick(['Mãe', 'Pai']), `(11) 9${ri(6000, 9999)}-${ri(1000, 9999)}`];
    const med = x.med ?? (!sp.fixed && rnd() < 0.14 ? pick(MEDS) : null);

    const s = await prisma.student.create({
      data: {
        tenantId: tid, name: sp.name, gender: sp.g, birthDate: dob, email, phone, status, monthlyFee: mens, dueDay: venc,
        startDate: start, medicalNotes: med, guardianName: resp?.[0], guardianRelation: resp?.[1], guardianPhone: resp?.[2],
        planId: planFor(mods, age).id,
        ranks: { create: ranks.map((r) => ({ disciplineId: D[r.d].id, levelOrder: r.levelOrder, degree: r.degree, levelSince: r.levelSince, lastPromotionAt: r.lastPromotionAt, classesSince: r.classesSince })) },
        promotions: {
          create: ranks.flatMap((r) =>
            r.hist.map((h) => ({ disciplineId: D[r.d].id, levelOrder: h.levelOrder, degree: h.degree, date: h.date, title: promotionTitle(rulesOf(D[r.d]), h.levelOrder, h.degree, h.first), instructorName: instr[r.d] })),
          ),
        },
      },
    });
    studentIds.push({ id: s.id, name: s.name, status, mods, age, g: sp.g, levels: Object.fromEntries(ranks.map((r) => [r.d, r.levelOrder])) });

    // Mensalidades: últimos 7 meses + atual (+ próximo a partir do dia 25)
    const last = D0 >= 25 ? 1 : 0;
    for (let kk = -7; kk <= last; kk++) {
      const { y, m } = rel(kk);
      const due = ymd(y, m, venc);
      if (due < ymd(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) continue;
      if (status === 'INACTIVE' && kk >= -3) continue;
      const row: Prisma.InvoiceCreateManyInput = { tenantId: tid, studentId: s.id, year: y, month: m, dueDate: due, amount: mens, status: 'PENDING' };
      if (status === 'LOCKED' && kk >= -2) row.status = 'EXEMPT';
      else if (x.late && kk === -1) row.status = 'OVERDUE';
      else if (due < T0 && !(x.late && kk === 0)) {
        row.status = 'PAID';
        row.paidAt = addDays(due, -((sp.name.length + m) % 4));
        row.paymentMethod = METHODS[(sp.name.length + m) % 4];
      } else if (due < addDays(T0, -3)) row.status = 'OVERDUE';
      invoiceRows.push(row);
    }
  }

  await prisma.invoice.createMany({ data: invoiceRows });
  const paid = await prisma.invoice.findMany({ where: { tenantId: tid, status: 'PAID' }, include: { student: { select: { name: true } } } });
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  await prisma.transaction.createMany({
    data: paid.map((i) => ({
      tenantId: tid, invoiceId: i.id, date: i.paidAt!, amount: i.amount, description: `Mensalidade · ${i.student.name}`,
      note: `${MONTHS[i.month - 1]} ${i.year}`, category: 'Mensalidades', type: 'INCOME' as const, status: 'PAID' as const, source: 'INVOICE' as const,
    })),
  });

  // Usuário aluno (João)
  const joao = studentIds.find((s) => s.name === 'João Victor Santos')!;
  await prisma.user.create({ data: { tenantId: tid, email: 'joao.santos@gmail.com', name: joao.name, role: 'STUDENT', studentId: joao.id, passwordHash: await hash('aluno123') } });
  await prisma.user.create({ data: { tenantId: tid, email: 'ricardo@academiatatame.com.br', name: 'Ricardo Almeida', role: 'ADMIN', passwordHash: await hash('tatame123') } });

  // ── Turmas ──────────────────────────────────────────────
  const T: [string, DK, number[], string, string, number][] = [
    ['Jiu-jitsu Iniciante', 'bjj', [0, 2, 4], '07:00', '08:00', 28], ['Jiu-jitsu Kids', 'bjj', [1, 3], '17:00', '18:00', 16],
    ['Jiu-jitsu Avançado', 'bjj', [0, 2, 4], '19:30', '21:00', 28], ['Jiu-jitsu No-Gi', 'bjj', [1, 3], '20:00', '21:30', 20],
    ['Open Mat', 'bjj', [5], '10:00', '12:00', 35], ['Muay Thai Manhã', 'mt', [1, 3], '06:30', '07:30', 15],
    ['Muay Thai Iniciante', 'mt', [0, 2], '18:00', '19:00', 20], ['Muay Thai Avançado', 'mt', [1, 3], '19:00', '20:00', 18],
    ['Muay Thai Feminino', 'mt', [5], '09:00', '10:00', 14], ['Boxe Funcional', 'box', [0, 2, 4], '12:00', '13:00', 18],
    ['Boxe Técnico', 'box', [1, 3], '18:00', '19:00', 16], ['Boxe Sparring', 'box', [4], '18:00', '19:30', 12],
  ];
  const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const instrId: Record<DK, string> = { bjj: ricardo.id, mt: thiago.id, box: daniela.id };
  const groups = [];
  for (const [name, d, days, s, e, capacity] of T) {
    groups.push(
      await prisma.classGroup.create({
        data: { tenantId: tid, name, disciplineId: D[d].id, instructorId: instrId[d], capacity, slots: { create: days.map((weekday) => ({ weekday, startMin: toM(s), endMin: toM(e) })) } },
      }),
    );
  }
  const G = Object.fromEntries(groups.map((g, i) => [`t${i + 1}`, { id: g.id, cap: g.capacity, n: 0 }]));
  const enroll: Prisma.EnrollmentCreateManyInput[] = [];
  const add = (sid: string, t: string) => {
    const g = G[t];
    if (g.n >= g.cap || enroll.some((e) => e.studentId === sid && e.classGroupId === g.id)) return false;
    g.n++;
    enroll.push({ studentId: sid, classGroupId: g.id });
    return true;
  };
  for (const s of studentIds.filter((s) => s.status === 'ACTIVE')) {
    if (s.levels.bjj !== undefined) {
      if (s.age < 14) add(s.id, 't2');
      else {
        const pri = s.levels.bjj <= 1 ? 't1' : 't3';
        if (!add(s.id, pri)) add(s.id, pri === 't1' ? 't3' : 't1');
        if (rnd() < 0.35) add(s.id, 't4');
        if (rnd() < 0.3) add(s.id, 't5');
      }
    }
    if (s.levels.mt !== undefined) {
      const pri = s.levels.mt <= 1 ? 't7' : 't8';
      if (!add(s.id, pri)) add(s.id, pri === 't7' ? 't8' : 't7');
      if (rnd() < 0.25) add(s.id, 't6');
      if (s.g === 'F' && rnd() < 0.5) add(s.id, 't9');
    }
    if (s.levels.box !== undefined) {
      const pri = rnd() < 0.5 ? 't10' : 't11';
      if (!add(s.id, pri)) add(s.id, pri === 't10' ? 't11' : 't10');
      if (s.levels.box >= 2 && rnd() < 0.5) add(s.id, 't12');
    }
  }
  await prisma.enrollment.createMany({ data: enroll });

  // ── Lançamentos (despesas fixas e receitas avulsas) ──────
  const tx: Prisma.TransactionCreateManyInput[] = [];
  const addT = (k2: number, day: number, description: string, category: string, type: 'INCOME' | 'EXPENSE', amount: number, note?: string) => {
    const { y, m } = rel(k2);
    const date = ymd(y, m, day);
    tx.push({ tenantId: tid, date, description, category, type, amount, note: note ?? null, status: date < T0 ? 'PAID' : 'PENDING', source: 'MANUAL' });
  };
  for (let k2 = -3; k2 <= 1; k2++) {
    addT(k2, 5, 'Aluguel do imóvel', 'Aluguel', 'EXPENSE', 4800, 'Imobiliária Paulista');
    addT(k2, 5, 'Salário · Thiago Nogueira', 'Folha de pagamento', 'EXPENSE', 2800, 'Professor de Muay Thai');
    addT(k2, 5, 'Salário · Daniela Prado', 'Folha de pagamento', 'EXPENSE', 2400, 'Professora de Boxe');
    addT(k2, 10, 'Energia elétrica', 'Contas de consumo', 'EXPENSE', 640 + ri(0, 70) + ri(0, 99) / 100, 'Enel');
    addT(k2, 10, 'Água e esgoto', 'Contas de consumo', 'EXPENSE', 175 + ri(0, 20) + ri(0, 99) / 100, 'Sabesp');
    addT(k2, 12, 'Internet fibra', 'Contas de consumo', 'EXPENSE', 149.9, '500 Mb');
    addT(k2, 15, 'Honorários contábeis', 'Serviços', 'EXPENSE', 450, 'Escritório Ramos');
    addT(k2, 18, 'Anúncios no Instagram', 'Marketing', 'EXPENSE', 300);
    addT(k2, 28, 'Limpeza mensal', 'Serviços', 'EXPENSE', 640, 'Brilho Serviços');
  }
  addT(-2, 9, 'Taxa de matrícula · 4 novos alunos', 'Matrículas', 'INCOME', 320);
  addT(-2, 17, 'Aulas particulares', 'Aulas particulares', 'INCOME', 450, '3 aulas');
  addT(-2, 24, 'Sacos de pancada (2 un.)', 'Equipamentos', 'EXPENSE', 1380);
  addT(-1, 8, 'Manutenção do tatame', 'Manutenção', 'EXPENSE', 950, 'Troca de 6 placas EVA');
  addT(-1, 12, 'Seminário de No-Gi', 'Eventos', 'INCOME', 1650, '22 participantes');
  addT(-1, 14, 'Taxa de matrícula · 3 novos alunos', 'Matrículas', 'INCOME', 240);
  addT(0, 4, 'Aulas particulares', 'Aulas particulares', 'INCOME', 300, '2 aulas');
  addT(0, 14, 'Exame de graduação · taxas', 'Eventos', 'INCOME', 1200, '15 alunos previstos');
  addT(0, 14, 'Faixas e certificados', 'Equipamentos', 'EXPENSE', 780);
  addT(0, 20, 'Seguro do imóvel', 'Serviços', 'EXPENSE', 380, 'Parcela 4/12');
  await prisma.transaction.createMany({ data: tx });

  // ── Loja ────────────────────────────────────────────────
  const products: [string, string, number, number, number, number][] = [
    ['Kimono Tatame Branco A2', 'Kimonos', 389.9, 210, 6, 3], ['Kimono Tatame Azul A3', 'Kimonos', 389.9, 210, 4, 2], ['Kimono Kids M2', 'Kimonos', 249.9, 130, 2, 3],
    ['Faixa de Jiu-jitsu adulto', 'Faixas', 59.9, 22, 18, 6], ['Faixa Kids', 'Faixas', 39.9, 15, 12, 5],
    ['Luva de Boxe 12oz', 'Luvas', 229.9, 125, 5, 2], ['Luva de Muay Thai 14oz', 'Luvas', 249.9, 138, 1, 2],
    ['Bandagem elástica (par)', 'Acessórios', 29.9, 11, 24, 8], ['Protetor bucal', 'Acessórios', 24.9, 8, 15, 6], ['Caneleira Muay Thai', 'Acessórios', 189.9, 98, 4, 2],
    ['Rash guard Tatame', 'Vestuário', 149.9, 72, 9, 3], ['Camiseta Academia Tatame', 'Vestuário', 79.9, 32, 20, 5],
    ['Água mineral 500 ml', 'Bebidas', 4, 1.3, 48, 12], ['Isotônico 500 ml', 'Bebidas', 8, 3.9, 30, 10],
  ];
  const PR = await Promise.all(products.map(([name, category, price, cost, stock, minStock]) => prisma.product.create({ data: { tenantId: tid, name, category, price, cost, stock, minStock } })));
  const PW = [2, 1, 1, 4, 2, 2, 1, 5, 4, 1, 2, 3, 8, 6];
  const pickP = () => {
    let r = rnd() * PW.reduce((a, b) => a + b, 0);
    for (let i = 0; i < PW.length; i++) if ((r -= PW[i]) < 0) return PR[i];
    return PR[0];
  };
  const activeIds = studentIds.filter((s) => s.status === 'ACTIVE').map((s) => s.id);
  const FORMAS: PaymentMethod[] = ['PIX', 'PIX', 'CASH', 'DEBIT', 'CREDIT'];
  let n = 1;
  const saleDays: [number, number[]][] = [[-2, [3, 5, 7, 9, 12, 14, 17, 19, 23, 26]], [-1, [1, 2, 6, 7, 9, 13, 14, 16, 20, 21, 22, 23, 27, 28]], [0, [1, 2, 3, 4, 5, 6, 7, 8, 10, 12]]];
  for (const [k2, days] of saleDays)
    for (const day of days) {
      const { y, m } = rel(k2);
      const date = ymd(y, m, day);
      if (date > T0) continue;
      const items: { p: (typeof PR)[number]; qty: number }[] = [];
      for (let i = 0; i < (rnd() < 0.3 ? 2 : 1); i++) {
        const p = pickP();
        if (!items.some((x) => x.p.id === p.id)) items.push({ p, qty: p.category === 'Bebidas' ? ri(1, 4) : 1 });
      }
      const total = items.reduce((a, x) => a + x.qty * Number(x.p.price), 0);
      const cost = items.reduce((a, x) => a + x.qty * Number(x.p.cost), 0);
      const label = items.map((x) => `${x.qty > 1 ? x.qty + '× ' : ''}${x.p.name}`).join(', ');
      const sale = await prisma.sale.create({
        data: {
          tenantId: tid, number: n, date, studentId: rnd() < 0.75 ? pick(activeIds) : null, paymentMethod: pick(FORMAS),
          items: { create: items.map((x) => ({ productId: x.p.id, qty: x.qty, unitPrice: x.p.price, unitCost: x.p.cost })) },
        },
      });
      await prisma.transaction.createMany({
        data: [
          { tenantId: tid, saleId: sale.id, date, type: 'INCOME', status: 'PAID', source: 'SALE', category: 'Loja', amount: Math.round(total * 100) / 100, description: `Venda nº ${n}`, note: label },
          { tenantId: tid, saleId: sale.id, date, type: 'EXPENSE', status: 'PAID', source: 'SALE', category: 'Custo de produtos', amount: Math.round(cost * 100) / 100, description: `Custo · venda nº ${n}`, note: label },
        ],
      });
      n++;
    }
  return { students: studentIds.length, invoices: invoiceRows.length, classes: groups.length, sales: n - 1 };
}

async function seedKaizen(hash: (s: string) => Promise<string>) {
  const tenant = await prisma.tenant.create({ data: { name: 'CT Kaizen', initials: 'CK', code: 'KAIZEN-3170' } });
  const [helena, marcos] = await Promise.all(['Helena Kato', 'Marcos Ueda'].map((name) => prisma.instructor.create({ data: { tenantId: tenant.id, name } })));
  await createDiscipline(tenant.id, 'judo', marcos.id, 180);
  await createDiscipline(tenant.id, 'karate', helena.id, 170, {
    name: 'Karatê Shotokan', color: '#D97FD0', system: 'Faixas (kyu)', at: dateOnly('2026-09-02'),
    levels: [['Branca', '#EDEDEA', 3, 24], ['Amarela', '#EAC02E', 4, 36], ['Laranja', '#EE8424', 6, 48], ['Verde', '#2E9A58', 6, 48], ['Azul', '#2F5FD0', 8, 64], ['Roxa', '#7440C0', 10, 80], ['Marrom', '#6E4426', 12, 100], ['Preta', '#121212', null, null]],
  });
  await createDiscipline(tenant.id, null, helena.id, 140, { name: 'Funcional', color: '#6FD3A6', system: 'Sem graduação', levels: [] });
  await prisma.user.create({ data: { tenantId: tenant.id, email: 'helena@ctkaizen.com.br', name: 'Helena Kato', role: 'ADMIN', passwordHash: await hash('kaizen123') } });
}

async function main() {
  const cache = new Map<string, string>();
  const hash = async (s: string) => cache.get(s) ?? (cache.set(s, await bcrypt.hash(s, 10)), cache.get(s)!);
  await wipe();
  await upsertCatalog();
  const r = await seedTatame(hash);
  await seedKaizen(hash);
  console.log(`Seed ok (hoje = ${T0.toISOString().slice(0, 10)}):`, r);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
