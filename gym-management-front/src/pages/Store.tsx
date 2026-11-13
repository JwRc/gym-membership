import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, patch, post } from '../api/client';
import type { PaymentMethod, StudentRow } from '../api/types';
import { Alert, ErrorBox, Field, ICONS, Icon, Loading, Modal, Seg } from '../components/ui';
import { useMutate } from '../modals/useMutate';
import { MONTHS, PAYMENT_OPTIONS, br, brl, moneyInput, parseMoney, pct, todayISO } from '../lib/format';

interface Product { id: string; name: string; category: string; price: number; cost: number; margin: number; stock: number; minStock: number; low: boolean; soldMonth: number; archived: boolean }
interface Resp {
  categories: string[];
  summary: { revenue: number; salesCount: number; units: number; cost: number; profit: number; margin: number; stockValue: number; stockUnits: number; lowStock: number };
  products: Product[];
  sales: { id: string; number: number; date: string; items: string; student: string | null; paymentMethod: string; total: number; profit: number }[];
}
const PCOLS = 'minmax(220px,2.4fr) 120px 110px 90px 120px 110px 90px';
const VCOLS = '60px 90px minmax(220px,2.4fr) minmax(160px,1.4fr) 140px 110px 100px';

export function StorePage() {
  const q = useQuery({ queryKey: ['store'], queryFn: () => get<Resp>('/store') });
  const [tab, setTab] = useState<'products' | 'sales' | 'archived'>('products');
  const [pm, setPm] = useState<Product | 'new' | null>(null);
  const [sale, setSale] = useState<string | 'new' | null>(null);
  const m = useMutate();
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const s = d.summary;
  const active = d.products.filter((p) => !p.archived);
  const archived = d.products.filter((p) => p.archived);
  // se o último arquivado for restaurado, a aba some: volta para Produtos
  const view = tab === 'archived' && !archived.length ? 'products' : tab;
  const productRow = (x: Product, action: React.ReactNode) => (
    <div key={x.id} className="trow click" style={{ gridTemplateColumns: PCOLS }} onClick={() => setPm(x)}>
      <div style={{ minWidth: 0 }}><div className="ellipsis" style={{ fontSize: 13.5, fontWeight: 500 }}>{x.name}</div><div style={{ fontSize: 12, color: 'var(--mute2)', marginTop: 1 }}>{x.category}</div></div>
      <div className="right num" style={{ fontSize: 13 }}>{brl(x.price)}</div>
      <div className="right num muted" style={{ fontSize: 13 }}>{brl(x.cost)}</div>
      <div className="right num" style={{ fontSize: 13, color: 'var(--ok)' }}>{pct(x.margin)}</div>
      <div className="row gap8"><span className="num" style={{ fontSize: 13 }}>{x.stock} un.</span>{x.low && !x.archived && <span className="pill pill-bad">Baixo</span>}</div>
      <div className="right num muted" style={{ fontSize: 13 }}>{x.soldMonth}</div>
      <div className="right">{action}</div>
    </div>
  );
  const pheader = <div className="thead" style={{ gridTemplateColumns: PCOLS }}><div>Produto</div><div className="right">Preço de venda</div><div className="right">Custo</div><div className="right">Margem</div><div>Estoque</div><div className="right">Vendidos/mês</div><div /></div>;
  const month = MONTHS[new Date().getMonth()].toLowerCase();
  return (
    <div className="page">
      <div className="page-h">
        <div><h1>Loja</h1><div className="page-sub">Produtos, estoque e vendas · tudo entra no financeiro automaticamente</div></div>
        <div className="row gap8">
          <button className="btn" onClick={() => setPm('new')}>Novo produto</button>
          <button className="btn btn-primary" onClick={() => setSale('new')}><Icon d={ICONS.plus} size={14} width={2.2} />Registrar venda</button>
        </div>
      </div>
      <div className="grid4">
        <div className="card stat"><div className="stat-k">Vendas em {month}</div><div className="stat-v">{brl(s.revenue)}</div><div className="stat-s">{s.salesCount} vendas · {s.units} itens</div></div>
        <div className="card stat"><div className="stat-k">Custo dos produtos</div><div className="stat-v">{brl(s.cost)}</div><div className="stat-s">Lançado como saída</div></div>
        <div className="card stat"><div className="stat-k">Lucro bruto</div><div className="stat-v ok">{brl(s.profit)}</div><div className="stat-s">Margem de {pct(s.margin)}</div></div>
        <div className="card stat"><div className="stat-k">Estoque a preço de custo</div><div className="stat-v">{brl(s.stockValue)}</div><div className="stat-s">{s.stockUnits} unidades{s.lowStock ? ` · ${s.lowStock} com estoque baixo` : ''}</div></div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--line)' }}>
          <Seg value={view} onChange={setTab} options={[
            { v: 'products', label: 'Produtos', extra: <span className="num" style={{ fontSize: 11, color: 'var(--mute2)' }}>{active.length}</span> },
            { v: 'sales', label: 'Vendas', extra: <span className="num" style={{ fontSize: 11, color: 'var(--mute2)' }}>{d.sales.length}</span> },
            ...(archived.length ? [{ v: 'archived' as const, label: 'Arquivados', extra: <span className="num" style={{ fontSize: 11, color: 'var(--mute2)' }}>{archived.length}</span> }] : []),
          ]} />
        </div>
        {view === 'products' ? (
          <>
            {pheader}
            {active.map((x) => productRow(x, <button className="btn btn-sm" disabled={!x.stock} onClick={(e) => { e.stopPropagation(); setSale(x.id); }}>Vender</button>))}
            {!active.length && <div className="empty">Nenhum produto cadastrado.</div>}
          </>
        ) : view === 'archived' ? (
          <>
            {pheader}
            {archived.map((x) => productRow(x, <button className="btn btn-sm" disabled={m.busy} onClick={(e) => { e.stopPropagation(); m.run(() => post(`/store/products/${x.id}/restore`), `${x.name} restaurado`); }}>Restaurar</button>))}
          </>
        ) : (
          <>
            <div className="thead" style={{ gridTemplateColumns: VCOLS }}><div>Nº</div><div>Data</div><div>Itens</div><div>Aluno</div><div>Pagamento</div><div className="right">Total</div><div className="right">Lucro</div></div>
            {d.sales.map((v) => (
              <div key={v.id} className="trow" style={{ gridTemplateColumns: VCOLS, fontSize: 13 }}>
                <div className="mono muted2">#{v.number}</div><div className="num muted">{br(v.date).slice(0, 5)}</div>
                <div className="ellipsis">{v.items}</div><div className="ellipsis muted">{v.student ?? 'Avulso'}</div>
                <div className="muted">{v.paymentMethod}</div><div className="right num">{brl(v.total)}</div><div className="right num ok">{brl(v.profit)}</div>
              </div>
            ))}
            {!d.sales.length && <div className="empty">Nenhuma venda registrada.</div>}
          </>
        )}
      </div>
      {pm && <ProductModal product={pm === 'new' ? undefined : pm} categories={d.categories} onClose={() => setPm(null)} />}
      {sale && <SaleModal products={active}initial={sale === 'new' ? undefined : sale} onClose={() => setSale(null)} />}
    </div>
  );
}

function ProductModal({ product, categories, onClose }: { product?: Product; categories: string[]; onClose: () => void }) {
  const [f, setF] = useState({
    name: product?.name ?? '', category: product?.category ?? categories[0], price: product ? moneyInput(product.price) : '',
    cost: product ? moneyInput(product.cost) : '', stock: String(product?.stock ?? 0), minStock: String(product?.minStock ?? 0),
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const m = useMutate();
  const price = parseMoney(f.price);
  const cost = parseMoney(f.cost);
  const save = async () => {
    if (!(price >= 0) || !(cost >= 0)) return m.setErr('Informe preço e custo válidos.');
    const body = { name: f.name, category: f.category, price, cost, stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0 };
    const r = await m.run(() => (product ? patch(`/store/products/${product.id}`, body) : post('/store/products', body)), 'Produto salvo');
    if (r) onClose();
  };
  const [confirmArchive, setConfirmArchive] = useState(false);
  const archive = async () => {
    if (!confirmArchive) return setConfirmArchive(true);
    const r = await m.run(() => post(`/store/products/${product!.id}/archive`), 'Produto arquivado');
    if (r) onClose();
  };
  return (
    <Modal title={product ? 'Editar produto' : 'Novo produto'} onClose={onClose} footer={<>
      {product && !product.archived && <button className="btn" style={{ marginRight: 'auto', color: confirmArchive ? 'var(--bad)' : undefined }} disabled={m.busy} onClick={archive}>{confirmArchive ? 'Confirmar arquivamento' : 'Arquivar'}</button>}
      <button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy} onClick={save}>Salvar produto</button></>}>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Nome do produto"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Kimono Tatame Preto A2" autoFocus /></Field>
        <Field label="Categoria"><select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Preço de venda (R$)"><input className="input num" value={f.price} onChange={(e) => set({ price: e.target.value })} placeholder="0,00" /></Field>
        <Field label="Custo (R$)"><input className="input num" value={f.cost} onChange={(e) => set({ cost: e.target.value })} placeholder="0,00" /></Field>
      </div>
      <div className="grid2" style={{ gap: 12 }}>
        <Field label="Estoque atual"><input className="input num" value={f.stock} onChange={(e) => set({ stock: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Avisar quando chegar a"><input className="input num" value={f.minStock} onChange={(e) => set({ minStock: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <div className="row between" style={{ fontSize: 13, color: 'var(--mute)' }}>
        <span>Lucro por unidade</span>
        <span className="num" style={{ color: 'var(--ok)', fontWeight: 600 }}>{price > 0 && cost >= 0 ? `${brl(price - cost)} · ${pct((price - cost) / price)}` : '—'}</span>
      </div>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}

function SaleModal({ products, initial, onClose }: { products: Product[]; initial?: string; onClose: () => void }) {
  const avail = products.filter((p) => p.stock > 0);
  const [items, setItems] = useState([{ pid: initial ?? avail[0]?.id ?? '', qty: 1 }]);
  const [sid, setSid] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [date, setDate] = useState(todayISO());
  const students = useQuery({ queryKey: ['students', '', 'all', 'ACTIVE', 'all'], queryFn: () => get<{ rows: StudentRow[] }>('/students', { status: 'ACTIVE' }) });
  const m = useMutate();
  const P = new Map(products.map((p) => [p.id, p]));
  const total = items.reduce((a, i) => a + i.qty * (P.get(i.pid)?.price ?? 0), 0);
  const cost = items.reduce((a, i) => a + i.qty * (P.get(i.pid)?.cost ?? 0), 0);
  const warn = items.map((i) => P.get(i.pid)).find((p, k) => p && items[k].qty > p.stock);
  const upd = (k: number, p: Partial<(typeof items)[number]>) => setItems(items.map((x, j) => (j === k ? { ...x, ...p } : x)));
  const save = async () => {
    const r = await m.run(() => post<{ number: number; total: number }>('/store/sales', { items: items.map((i) => ({ productId: i.pid, qty: i.qty })), studentId: sid || undefined, paymentMethod: method, date }), (r) => `Venda nº ${r.number} registrada · ${brl(r.total)}`);
    if (r) onClose();
  };
  return (
    <Modal title="Registrar venda" width={560} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={m.busy || !!warn || !items.length} onClick={save}>Registrar venda</button></>}>
      <Field label="Itens">
        <div className="col gap8">
          {items.map((it, k) => (
            <div key={k} className="row gap8">
              <select className="input grow" value={it.pid} onChange={(e) => upd(k, { pid: e.target.value })}>
                {avail.map((p) => <option key={p.id} value={p.id}>{p.name} — {brl(p.price)} · {p.stock} un.</option>)}
              </select>
              <div className="row" style={{ border: '1px solid var(--bd2)', borderRadius: 8, height: 36 }}>
                <button className="icon-btn" onClick={() => upd(k, { qty: Math.max(1, it.qty - 1) })}>−</button>
                <span className="num" style={{ width: 24, textAlign: 'center', fontSize: 13 }}>{it.qty}</span>
                <button className="icon-btn" onClick={() => upd(k, { qty: it.qty + 1 })}>+</button>
              </div>
              <span className="num right" style={{ width: 90, fontSize: 13 }}>{brl(it.qty * (P.get(it.pid)?.price ?? 0))}</span>
              <button className="icon-btn" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== k))}><Icon d={ICONS.close} size={13} /></button>
            </div>
          ))}
          <div style={{ fontSize: 12.5, color: 'var(--sub)', cursor: 'pointer' }} onClick={() => setItems([...items, { pid: avail.find((p) => !items.some((i) => i.pid === p.id))?.id ?? avail[0].id, qty: 1 }])}>+ Adicionar item</div>
        </div>
      </Field>
      <div className="grid3" style={{ gap: 12 }}>
        <Field label="Aluno">
          <select className="input" value={sid} onChange={(e) => setSid(e.target.value)}><option value="">Avulso</option>{students.data?.rows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </Field>
        <Field label="Pagamento">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
        </Field>
        <Field label="Data"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {warn && <Alert warn>Estoque insuficiente de {warn.name} ({warn.stock} em estoque).</Alert>}
      <div className="grid3" style={{ gap: 12, padding: 12, borderRadius: 10, background: 'var(--sunk)', border: '1px solid var(--bd)' }}>
        <div><div style={{ fontSize: 12, color: 'var(--mute)' }}>Total · entrada</div><div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{brl(total)}</div></div>
        <div><div style={{ fontSize: 12, color: 'var(--mute)' }}>Custo · saída</div><div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{brl(cost)}</div></div>
        <div><div style={{ fontSize: 12, color: 'var(--mute)' }}>Lucro</div><div className="num ok" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>{brl(total - cost)}</div></div>
      </div>
      {m.err && <Alert>{m.err}</Alert>}
    </Modal>
  );
}
