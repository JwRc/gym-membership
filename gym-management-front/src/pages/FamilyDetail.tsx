import { Fragment, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { del, get, post } from '../api/client';
import type { FamilyChargeRow, FamilyDetail, FamilyFinance, FamilyInvoice, FamilyMember, StudentRow } from '../api/types';
import { Alert, Avatar, ErrorBox, ICONS, Icon, InvoicePill, Loading, Modal, StatusPill } from '../components/ui';
import { Amount } from '../components/InvoiceBlocks';
import { FamilyModal } from '../modals/FamilyModal';
import { StudentModal } from '../modals/StudentModal';
import { PayInvoiceModal } from '../modals/basic';
import { useMutate } from '../modals/useMutate';
import { useApp } from '../auth/AppContext';
import { BILLING_LABEL, ruleText } from '../lib/family';
import { br, brl } from '../lib/format';

const MCOLS = 'minmax(220px,2fr) 100px 120px 130px 130px 110px';
const CCOLS = '28px 1.3fr 1fr 1.4fr 1fr 1.2fr 170px';
const ICOLS = '1.3fr 1.4fr 1fr 1.3fr 1fr 1.2fr 170px';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type PayTarget = { kind: 'charge'; row: FamilyChargeRow } | { kind: 'invoice'; row: FamilyInvoice };

export function FamilyDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can } = useApp();
  const q = useQuery({ queryKey: ['family', id], queryFn: () => get<FamilyDetail>(`/families/${id}`) });
  const fin = useQuery({ queryKey: ['family', id, 'finance'], queryFn: () => get<FamilyFinance>(`/families/${id}/finance`) });
  const [modal, setModal] = useState<null | 'edit' | 'new-member' | 'add-member' | 'dissolve'>(null);
  const [pay, setPay] = useState<PayTarget | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const m = useMutate();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const f = q.data!;
  const write = can('families.write');
  const ruleOrigin = f.discountOverride === 'INHERIT' ? 'Padrão da academia' : f.discountOverride === 'CUSTOM' ? 'Personalizado' : 'Sem desconto';

  const removeMember = (mb: FamilyMember) => m.run(() => del(`/families/${f.id}/members/${mb.id}`), `${mb.name} saiu da família`);

  return (
    <div className="page">
      <div className="crumbs"><span className="link" onClick={() => nav('/familias')}>Famílias</span><span>/</span><span style={{ color: 'var(--text)' }}>{f.name}</span></div>
      <div className="row gap16">
        <div className="grow">
          <h1 style={{ fontSize: 22, letterSpacing: '-0.02em' }}>{f.name}</h1>
          <div className="page-sub">
            Titular: {f.guardian.name} · {f.members.length} membro{f.members.length === 1 ? '' : 's'} · cobrança {BILLING_LABEL[f.billingMode].toLowerCase()}
            {f.billingMode === 'CONSOLIDATED' && f.dueDay ? `, vence dia ${String(f.dueDay).padStart(2, '0')}` : ''}
          </div>
        </div>
        {write && <button className="btn" onClick={() => setModal('dissolve')}>Desfazer família</button>}
        {write && <button className="btn" onClick={() => setModal('edit')}>Editar</button>}
      </div>
      {m.err && <Alert>{m.err}</Alert>}
      {f.warning && <Alert warn>{f.warning}</Alert>}

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-h"><div className="card-t">Titular</div></div>
          {[
            ['Nome', f.guardian.name + (f.guardian.relation ? ` · ${f.guardian.relation}` : '')],
            ['E-mail', f.guardian.email],
            ['Telefone', f.guardian.phone ?? '—'],
            ['CPF', f.guardian.cpf ? f.guardian.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : '—'],
            ['Treina', f.guardian.studentId ? 'Sim, é membro da família' : 'Não'],
          ].map(([k, v]) => (
            <div key={k} className="row between gap16" style={{ padding: '10px 18px', borderBottom: '1px solid var(--line2)', fontSize: 13 }}>
              <span style={{ color: 'var(--mute2)' }}>{k}</span><span className="ellipsis">{v}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-h"><div className="card-t">Cobrança e desconto</div>{write && <div className="card-link" onClick={() => setModal('edit')}>Alterar</div>}</div>
          {[
            ['Cobrança', f.billingMode === 'CONSOLIDATED' ? `Consolidada · uma cobrança por mês, dia ${String(f.dueDay).padStart(2, '0')}` : 'Separada · cada membro com a sua mensalidade'],
            ['Desconto', ruleText(f.rule)],
            ['Origem do desconto', ruleOrigin],
            ['Próximo mês (prévia)', <span key="p" className="num"><Amount amount={f.totals.amount} gross={f.totals.gross} discount={f.totals.discount} /></span>],
          ].map(([k, v]) => (
            <div key={k as string} className="row between gap16" style={{ padding: '10px 18px', borderBottom: '1px solid var(--line2)', fontSize: 13 }}>
              <span style={{ color: 'var(--mute2)' }}>{k}</span><span style={{ textAlign: 'right' }}>{v}</span>
            </div>
          ))}
          <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--mute2)' }}>Mudanças valem a partir das próximas mensalidades geradas.</div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-h">
          <div className="card-t">Membros<span style={{ fontSize: 12, color: 'var(--mute2)', fontWeight: 400 }}>{f.members.length}</span></div>
          {write && (
            <div className="row gap8">
              <button className="btn btn-sm" onClick={() => setModal('add-member')}>Adicionar aluno existente</button>
              <button className="btn btn-sm btn-primary" onClick={() => setModal('new-member')}><Icon d={ICONS.plus} size={13} width={2.2} />Novo membro</button>
            </div>
          )}
        </div>
        <div className="thead" style={{ gridTemplateColumns: MCOLS }}><div>Aluno</div><div>Situação</div><div className="right">Mensalidade</div><div className="right">Desconto</div><div className="right">Próxima</div><div /></div>
        {f.members.map((mb) => (
          <div key={mb.id} className="trow click" style={{ gridTemplateColumns: MCOLS, fontSize: 13 }} onClick={() => nav(`/alunos/${mb.id}`)}>
            <div className="row gap10" style={{ minWidth: 0 }}>
              <Avatar name={mb.name} initials={mb.initials} size={28} />
              <div style={{ minWidth: 0 }}>
                <div className="row gap6"><span className="ellipsis" style={{ fontWeight: 500 }}>{mb.name}</span>{mb.isGuardian && <span className="pill pill-blue" style={{ fontSize: 10.5, padding: '1px 6px' }}>Titular</span>}</div>
                <div className="ellipsis" style={{ fontSize: 12, color: 'var(--mute2)' }}>{mb.age} anos · {mb.email ?? 'sem e-mail'}</div>
              </div>
            </div>
            <div><StatusPill s={mb.status} /></div>
            <div className="right num">{brl(mb.monthlyFee)}</div>
            <div className="right num" style={{ color: mb.next?.discount ? 'var(--ok)' : 'var(--mute2)' }} title={mb.next?.note ?? undefined}>
              {mb.next?.exempt ? 'Isento' : mb.next?.discount ? `− ${brl(mb.next.discount)}` : '—'}
            </div>
            <div className="right num">{mb.next ? (mb.next.exempt ? '—' : brl(mb.next.amount)) : <span style={{ color: 'var(--mute2)' }}>Sem cobrança</span>}</div>
            <div className="right">
              {write && !mb.isGuardian && (
                <button className="btn btn-sm btn-ghost" disabled={m.busy} title={mb.email ? 'Tirar da família' : 'Informe um e-mail do aluno antes de tirá-lo da família'}
                  onClick={(e) => { e.stopPropagation(); removeMember(mb); }}>Remover</button>
              )}
            </div>
          </div>
        ))}
        {!f.members.length && <div className="empty">Nenhum membro ainda.</div>}
      </div>

      <FinanceBlock fin={fin.data} loading={fin.isLoading} consolidated={f.billingMode === 'CONSOLIDATED'} open={open} setOpen={setOpen} onPay={setPay} canPay={can('invoices.write')} />

      {modal === 'edit' && <FamilyModal family={f} onClose={() => setModal(null)} />}
      {modal === 'new-member' && <StudentModal family={{ id: f.id, name: f.name }} onClose={() => setModal(null)} />}
      {modal === 'add-member' && <AddMemberModal family={f} onClose={() => setModal(null)} />}
      {modal === 'dissolve' && <DissolveModal family={f} onClose={() => setModal(null)} onDone={() => nav('/familias')} />}
      {pay?.kind === 'charge' && (
        <PayInvoiceModal invoice={{ id: pay.row.id, ref: pay.row.ref, amount: pay.row.total, name: f.name }} url={`/families/${f.id}/charges/${pay.row.id}/pay`} onClose={() => setPay(null)} />
      )}
      {pay?.kind === 'invoice' && <PayInvoiceModal invoice={{ id: pay.row.id, ref: pay.row.ref, amount: pay.row.amount, name: pay.row.student.name }} onClose={() => setPay(null)} />}
    </div>
  );
}

function FinanceBlock({ fin, loading, consolidated, open, setOpen, onPay, canPay }: {
  fin?: FamilyFinance; loading: boolean; consolidated: boolean; open: string | null; setOpen: (v: string | null) => void; onPay: (p: PayTarget) => void; canPay: boolean;
}) {
  if (loading || !fin) return <Loading />;
  const year = new Date().getFullYear();
  const s = fin.summary;
  return (
    <>
      <div className="grid3">
        {[
          ['Em aberto', brl(s.open), s.openCount ? `${s.openCount} mensalidade(s)` : 'Nada pendente', s.open ? 'var(--bad)' : undefined],
          [`Pago em ${year}`, brl(s.paidYear), 'Todas as mensalidades da família', undefined],
          [`Desconto família em ${year}`, brl(s.discountYear), 'Nas mensalidades geradas no ano', 'var(--ok)'],
        ].map(([k, v, sub, c]) => (
          <div key={k} className="card stat">
            <div className="stat-k">{k}</div>
            <div className="stat-v" style={{ color: c }}>{v}</div>
            <div className="stat-s">{sub}</div>
          </div>
        ))}
      </div>

      {(consolidated || fin.charges.length > 0) && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-h"><div className="card-t">Cobranças da família<span style={{ fontSize: 12, color: 'var(--mute2)', fontWeight: 400 }}>{fin.charges.length}</span></div></div>
          <div className="thead" style={{ gridTemplateColumns: CCOLS }}><div /><div>Referência</div><div>Vencimento</div><div>Total</div><div>Pago em</div><div>Status</div><div /></div>
          {fin.charges.map((c) => (
            <Fragment key={c.id}>
              <div className="trow click" style={{ gridTemplateColumns: CCOLS, fontSize: 13 }} onClick={() => setOpen(open === c.id ? null : c.id)}>
                <Icon d={ICONS.chevR} size={13} stroke="var(--mute2)" style={{ transform: open === c.id ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }} />
                <div>{c.ref}<span style={{ fontSize: 11.5, color: 'var(--mute2)', marginLeft: 6 }}>{c.invoices.length} membro{c.invoices.length === 1 ? '' : 's'}</span></div>
                <div className="num muted">{br(c.dueDate)}</div>
                <div><Amount amount={c.total} discount={c.discount} /></div>
                <div className="num muted">{c.paidAt ? `${br(c.paidAt)}${c.method ? ' · ' + c.method : ''}` : '—'}</div>
                <div><InvoicePill state={c.state} label={c.label} /></div>
                <div className="right">{canPay && c.canPay && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); onPay({ kind: 'charge', row: c }); }}>Registrar pagamento</button>}</div>
              </div>
              {open === c.id && c.invoices.map((i) => (
                <div key={i.id} className="trow" style={{ gridTemplateColumns: CCOLS, fontSize: 12.5, background: 'var(--sunk)' }}>
                  <div /><div className="ellipsis">{i.student.name}</div><div />
                  <div><Amount amount={i.amount} gross={i.gross} discount={i.discount} note={i.discountNote} /></div>
                  <div /><div><InvoicePill state={i.state} label={i.label} /></div><div className="right muted" style={{ fontSize: 12 }}>{i.discountNote ?? ''}</div>
                </div>
              ))}
            </Fragment>
          ))}
          {!fin.charges.length && <div className="empty">Nenhuma cobrança gerada ainda. A cobrança do mês é criada junto com as mensalidades.</div>}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-h"><div className="card-t">{consolidated ? 'Mensalidades avulsas dos membros' : 'Mensalidades dos membros'}<span style={{ fontSize: 12, color: 'var(--mute2)', fontWeight: 400 }}>{fin.invoices.length}</span></div></div>
        <div className="thead" style={{ gridTemplateColumns: ICOLS }}><div>Referência</div><div>Aluno</div><div>Vencimento</div><div>Valor</div><div>Pago em</div><div>Status</div><div /></div>
        {fin.invoices.map((i) => (
          <div key={i.id} className="trow" style={{ gridTemplateColumns: ICOLS, fontSize: 13 }}>
            <div>{i.ref}</div>
            <div className="ellipsis">{i.student.name}</div>
            <div className="num muted">{br(i.dueDate)}</div>
            <div><Amount amount={i.amount} gross={i.gross} discount={i.discount} note={i.discountNote} /></div>
            <div className="num muted">{i.paidAt ? br(i.paidAt) : '—'}</div>
            <div><InvoicePill state={i.state} label={i.label} /></div>
            <div className="right">{canPay && i.canPay && <button className="btn btn-sm" onClick={() => onPay({ kind: 'invoice', row: i })}>Registrar pagamento</button>}</div>
          </div>
        ))}
        {!fin.invoices.length && (
          <div className="empty">{consolidated ? 'Nenhuma mensalidade fora da cobrança da família.' : 'Nenhuma mensalidade lançada.'}</div>
        )}
      </div>
    </>
  );
}

function AddMemberModal({ family, onClose }: { family: FamilyDetail; onClose: () => void }) {
  const students = useQuery({ queryKey: ['students', 'all'], queryFn: () => get<{ rows: StudentRow[] }>('/students?status=all') });
  const [search, setSearch] = useState('');
  const m = useMutate();
  const s = norm(search.trim());
  const free = (students.data?.rows ?? []).filter((x) => !x.family && (!s || norm(x.name).includes(s))).slice(0, 12);
  const add = async (st: StudentRow) => {
    if (await m.run(() => post(`/families/${family.id}/members`, { studentId: st.id }), `${st.name} entrou na ${family.name}`)) onClose();
  };
  return (
    <Modal title="Adicionar aluno existente" sub={family.name} width={520} onClose={onClose} footer={<button className="btn" onClick={onClose}>Fechar</button>}>
      <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno sem família…" autoFocus />
      <div className="col" style={{ gap: 2 }}>
        {free.map((st) => (
          <div key={st.id} className="row gap10 trow click" style={{ padding: '8px 4px', minHeight: 0 }} onClick={() => !m.busy && add(st)}>
            <Avatar name={st.name} initials={st.initials} size={26} />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="ellipsis" style={{ fontSize: 13.5 }}>{st.name}</div>
              <div style={{ fontSize: 12, color: 'var(--mute2)' }}>{st.age} anos · {brl(st.monthlyFee)}/mês</div>
            </div>
            <StatusPill s={st.status} />
          </div>
        ))}
        {students.isLoading && <Loading />}
        {!students.isLoading && !free.length && <div className="empty" style={{ padding: 20 }}>Nenhum aluno sem família encontrado.</div>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--mute2)' }}>A mensalidade já gerada para este mês continua avulsa; o desconto família vale a partir da próxima.</div>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}

function DissolveModal({ family, onClose, onDone }: { family: FamilyDetail; onClose: () => void; onDone: () => void }) {
  const m = useMutate();
  const noEmail = family.members.filter((x) => !x.email);
  const go = async () => {
    if (await m.run(() => del(`/families/${family.id}`), `${family.name} desfeita`)) {
      onClose();
      onDone();
    }
  };
  return (
    <Modal title="Desfazer família" sub={family.name} width={460} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy || !!noEmail.length} onClick={go}>Desfazer família</button></>}>
      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
        Os membros voltam a ser alunos avulsos e o cadastro do titular é apagado. Mensalidades em aberto saem da cobrança da família e seguem
        avulsas, com o valor que já tinham. O histórico de pagamentos continua nas mensalidades de cada aluno.
      </div>
      {!!noEmail.length && <Alert warn>Informe o e-mail de {noEmail.map((x) => x.name).join(', ')} antes de desfazer a família.</Alert>}
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
