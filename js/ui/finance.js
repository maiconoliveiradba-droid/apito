// Aba Caixa: lançamentos, cobranças (dívidas ficam "em atraso", sem mexer na carteira) e carteira de crédito
import { html, raw, esc, brl, fmtDate, fmtDateShort, todayISO, uid, num, MONTHS, fromISO, initials } from '../util.js';
import { mutate } from '../store.js';
import * as L from '../logic.js';
import { curGroup, on, pname, player } from './ctx.js';
import { toast, formSheet, confirmBox, openSheet, closeSheet } from './common.js';

const st = { tab: 'lanc', filter: 'open' };
const CATS = [['mensalidade', 'Mensalidade'], ['diaria', 'Diária de convidado'], ['credito', 'Crédito na carteira'], ['churrasco', 'Churrasco'], ['quadra', 'Quadra'], ['material', 'Bola e material'], ['outros', 'Outros']];
const catName = (c) => CATS.find((x) => x[0] === c)?.[1] || c;
const rerender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const playerOpts = (g, none = '— nenhum —') => [{ v: '', t: none }, ...g.players.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((p) => ({ v: p.id, t: p.name }))];

export function renderFinance(g) {
  const s = L.financeSummary(g.fin);
  const head = html`<section class="money">
    <div><span>Caixa</span><b class="${s.caixa < 0 ? 'neg' : ''}">${brl(s.caixa)}</b><small>entradas ${brl(s.entradas)}, saídas ${brl(s.saidas)}</small></div>
    <div><span>A receber</span><b>${brl(s.aReceber)}</b><small>cobranças no prazo</small></div>
    <div class="${s.emAtraso ? 'late' : ''}"><span>Em atraso</span><b>${brl(s.emAtraso)}</b><small>${s.qtdAtraso} jogador(es)</small></div></section>
    <div class="seg" role="tablist">${[['lanc', 'Lançamentos'], ['cobr', 'Cobranças'], ['cart', 'Carteiras']].map(([k, t]) => html`<button role="tab" aria-selected="${st.tab === k}" data-act="finTab" data-k="${k}">${t}</button>`)}</div>`;
  return html`${head}${st.tab === 'lanc' ? lanc(g) : st.tab === 'cobr' ? cobr(g) : cart(g)}`;
}

function lanc(g) {
  const tx = [...g.fin.tx].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.at - a.at));
  return html`<section class="actions"><button class="btn primary" data-act="newTx" data-kind="in">Nova entrada</button><button class="btn" data-act="newTx" data-kind="out">Nova saída</button></section>
    <ul class="list">${tx.map((t) => html`<li><button class="row prow-btn" data-act="txSheet" data-id="${t.id}"><span class="pn">${t.desc || catName(t.cat)} <small>${catName(t.cat)}${t.playerId ? `, ${pname(g, t.playerId)}` : ''}</small></span><small>${fmtDate(t.date)}</small><b class="${t.kind === 'in' ? 'pos' : 'neg'}">${t.kind === 'in' ? '+' : '−'} ${brl(t.amount)}</b></button></li>`)}${tx.length ? '' : html`<li class="none">Nenhum lançamento ainda</li>`}</ul>`;
}

function cobr(g) {
  const today = todayISO(); const f = st.filter;
  const all = [...g.fin.charges].sort((a, b) => (a.due < b.due ? -1 : 1));
  const list = all.filter((c) => (f === 'paid' ? c.status === 'paid' : f === 'late' ? L.isOverdue(c, today) : c.status === 'open'));
  const m = MONTHS[new Date().getMonth()];
  return html`<section class="actions"><button class="btn primary" data-act="newCharge">Nova cobrança</button><button class="btn" data-act="genMonthly">Gerar mensalidades de ${m}</button></section>
    <div class="seg small">${[['open', 'Abertas'], ['late', 'Em atraso'], ['paid', 'Pagas']].map(([k, t]) => html`<button aria-selected="${f === k}" data-act="chFilter" data-k="${k}">${t}</button>`)}</div>
    <ul class="list">${list.map((c) => { const late = L.isOverdue(c, today); return html`<li><button class="row prow-btn" data-act="chargeSheet" data-id="${c.id}"><span class="pn">${pname(g, c.playerId)} <small>${c.desc}, vence ${fmtDate(c.due)}</small></span><span class="badge ${c.status === 'paid' ? 'ok' : late ? 'late' : ''}">${c.status === 'paid' ? 'paga' : late ? 'em atraso' : 'aberta'}</span><b>${brl(c.amount)}</b></button></li>`; })}${list.length ? '' : html`<li class="none">Nada por aqui</li>`}</ul>`;
}

function cart(g) {
  const list = g.players.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return html`<p class="hint">A carteira é o crédito que o jogador deixou adiantado. Dívidas vencidas aparecem como “em atraso” e não descontam da carteira.</p>
    <ul class="list">${list.map((p) => { const w = L.walletOf(g.fin, p.id); const d = L.playerDebts(g.fin, p.id);
      return html`<li class="prow"><span class="pn">${p.name} ${d.totalLate ? html`<small class="late">em atraso ${brl(d.totalLate)}</small>` : d.totalOpen ? html`<small>a vencer ${brl(d.totalOpen)}</small>` : ''}</span><span class="pbtns"><b>${brl(w)}</b><button class="mini" data-act="deposit" data-pid="${p.id}">Depositar</button></span></li>`; })}</ul>`;
}

function txForm(g, kind) {
  formSheet({ title: kind === 'in' ? 'Nova entrada' : 'Nova saída', submit: 'Lançar', fields: [
    { name: 'amount', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0, required: true },
    { name: 'cat', label: 'Categoria', type: 'select', value: kind === 'in' ? 'mensalidade' : 'quadra', options: CATS.map(([v, t]) => ({ v, t })) },
    { name: 'playerId', label: 'Jogador (opcional)', type: 'select', value: '', options: playerOpts(g) },
    { name: 'desc', label: 'Descrição', placeholder: kind === 'in' ? 'Ex.: mensalidade de outubro' : 'Ex.: aluguel da quadra' }, { name: 'date', label: 'Data', type: 'date', value: todayISO() }],
  onSubmit(v) { if (!v.amount || v.amount <= 0) return false; mutate(() => g.fin.tx.push({ id: uid(), kind, cat: v.cat, amount: v.amount, playerId: v.playerId || null, desc: v.desc, date: v.date || todayISO(), at: Date.now() })); toast('Lançamento salvo'); } });
}

on({
  finTab(el) { st.tab = el.dataset.k; rerender(); },
  chFilter(el) { st.filter = el.dataset.k; rerender(); },
  newTx(el) { txForm(curGroup(), el.dataset.kind); },
  txSheet(el) {
    const g = curGroup(); const t = g.fin.tx.find((x) => x.id === el.dataset.id);
    openSheet({ title: t.desc || catName(t.cat), body: html`<p class="msg">${t.kind === 'in' ? 'Entrada' : 'Saída'} de <b>${brl(t.amount)}</b> em ${fmtDate(t.date)}.<br>${catName(t.cat)}${t.playerId ? `, ${pname(g, t.playerId)}` : ''}</p>${t.chargeId ? html`<p class="hint">Este lançamento veio do pagamento de uma cobrança. Excluir aqui reabre a cobrança.</p>` : ''}`, foot: html`<button class="btn danger" data-act="delTx" data-id="${t.id}">Excluir</button>` });
  },
  async delTx(el) {
    const g = curGroup(); const t = g.fin.tx.find((x) => x.id === el.dataset.id); closeSheet();
    if (!(await confirmBox('Excluir este lançamento?', { ok: 'Excluir', danger: true }))) return;
    mutate(() => { g.fin.tx = g.fin.tx.filter((x) => x.id !== t.id); if (t.chargeId) { const c = g.fin.charges.find((x) => x.id === t.chargeId); if (c) { c.status = 'open'; delete c.paidAt; delete c.paidWith; delete c.txId; } } });
  },
  newCharge() {
    const g = curGroup();
    formSheet({ title: 'Nova cobrança', submit: 'Cobrar', fields: [
      { name: 'who', label: 'Quem', type: 'select', value: '__mens', options: [{ v: '__mens', t: 'Todos os mensalistas' }, ...playerOpts(g, '— escolha —').slice(1)] },
      { name: 'amount', label: 'Valor por pessoa (R$)', type: 'number', step: '0.01', min: 0, required: true }, { name: 'desc', label: 'Descrição', placeholder: 'Ex.: camisa do grupo', required: true },
      { name: 'due', label: 'Vencimento', type: 'date', value: todayISO() }],
    onSubmit(v) { if (!v.amount || !v.desc) return false;
      const ids = v.who === '__mens' ? g.players.filter((p) => p.active !== false && p.type === 'mensalista').map((p) => p.id) : [v.who];
      mutate(() => ids.forEach((id) => g.fin.charges.push({ id: uid(), playerId: id, amount: v.amount, desc: v.desc, due: v.due, status: 'open', createdAt: Date.now() }))); toast(`${ids.length} cobrança(s) criada(s)`); } });
  },
  genMonthly() {
    const g = curGroup(); const fee = num(g.cfg.monthlyFee);
    if (!fee) { toast('Defina o valor da mensalidade em Mais, Configurações'); return; }
    const d = new Date(); const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; const due = `${ym}-${String(Math.min(28, g.cfg.dueDay || 10)).padStart(2, '0')}`;
    let n = 0;
    mutate(() => g.players.filter((p) => p.active !== false && p.type === 'mensalista').forEach((p) => { const ref = `mensal:${ym}:${p.id}`; if (!g.fin.charges.some((c) => c.ref === ref)) { g.fin.charges.push({ id: uid(), ref, playerId: p.id, amount: fee, desc: `Mensalidade ${MONTHS[d.getMonth()]}`, due, status: 'open', createdAt: Date.now() }); n++; } }));
    toast(n ? `${n} mensalidade(s) gerada(s)` : 'As mensalidades deste mês já foram geradas');
  },
  chargeSheet(el) {
    const g = curGroup(); const c = g.fin.charges.find((x) => x.id === el.dataset.id); const w = L.walletOf(g.fin, c.playerId);
    const late = L.isOverdue(c);
    openSheet({ title: pname(g, c.playerId), body: html`<p class="msg">${c.desc}<br><b>${brl(c.amount)}</b>, vence em ${fmtDate(c.due)}${late ? html` <span class="badge late">em atraso</span>` : ''}</p>${c.status === 'paid' ? html`<p class="hint">Paga ${c.paidAt ? `em ${fmtDate(c.paidAt)}` : ''} ${c.paidWith === 'carteira' ? 'com a carteira' : 'no caixa'}.</p>` : html`<p class="hint">Carteira do jogador: ${brl(w)}</p>`}`,
      foot: c.status === 'paid' ? html`<button class="btn danger" data-act="delCharge" data-id="${c.id}">Excluir</button>`
        : html`<button class="btn danger" data-act="delCharge" data-id="${c.id}">Excluir</button><button class="btn" data-act="payCharge" data-id="${c.id}" data-via="carteira" ${w >= c.amount ? '' : raw('disabled')}>Pagar com a carteira</button><button class="btn primary" data-act="payCharge" data-id="${c.id}" data-via="caixa">Recebi no caixa</button>` });
  },
  payCharge(el) {
    const g = curGroup(); const c = g.fin.charges.find((x) => x.id === el.dataset.id); const via = el.dataset.via;
    mutate(() => {
      c.status = 'paid'; c.paidAt = todayISO(); c.paidWith = via;
      if (via === 'caixa') { const t = { id: uid(), kind: 'in', cat: c.ref?.startsWith('mensal') ? 'mensalidade' : c.ref?.startsWith('diaria') ? 'diaria' : c.ref?.startsWith('churras') ? 'churrasco' : 'outros', amount: c.amount, playerId: c.playerId, desc: c.desc, date: todayISO(), at: Date.now(), chargeId: c.id }; g.fin.tx.push(t); c.txId = t.id; }
    });
    closeSheet(); toast('Pagamento registrado');
  },
  async delCharge(el) {
    const g = curGroup(); const id = el.dataset.id; closeSheet();
    if (!(await confirmBox('Excluir esta cobrança? Se ela já foi paga no caixa, o lançamento também sai.', { ok: 'Excluir', danger: true }))) return;
    mutate(() => { g.fin.charges = g.fin.charges.filter((c) => c.id !== id); g.fin.tx = g.fin.tx.filter((t) => t.chargeId !== id); });
  },
  deposit(el) {
    const g = curGroup(); const p = player(g, el.dataset.pid);
    formSheet({ title: `Depósito de ${p.name}`, submit: 'Depositar', fields: [{ name: 'amount', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0, required: true }], onSubmit(v) { if (!v.amount || v.amount <= 0) return false; mutate(() => g.fin.tx.push({ id: uid(), kind: 'in', cat: 'credito', amount: v.amount, playerId: p.id, desc: 'Crédito na carteira', date: todayISO(), at: Date.now() })); toast('Crédito adicionado'); } });
  },
});
