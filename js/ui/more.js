// Aba Mais: churrasco, configurações do grupo, backup e dados do app
import { html, raw, esc, brl, fmtDate, todayISO, uid, num, WEEKDAYS } from '../util.js';
import { getState, mutate, replaceState, newGroup } from '../store.js';
import * as L from '../logic.js';
import { route, curGroup, on, go, pname } from './ctx.js';
import { toast, formSheet, confirmBox, openSheet, closeSheet, shareText, download } from './common.js';

export const VERSION = '1.0.0';
const WEIGHTS = [['1', 'Come e bebe'], ['0.7', 'Não bebe'], ['0.5', 'Come pouco'], ['2', 'Com acompanhante']];

export function renderMais(g) {
  if (route.sub === 'churrasco') return renderChurrasco(g, g.churrascos.find((c) => c.id === route.id));
  const inst = window.__installEvt; const standalone = matchMedia('(display-mode: standalone)').matches;
  const notif = 'Notification' in window ? Notification.permission : 'unsupported';
  return html`
    <ul class="menu">
      <li><button data-act="openChurras" data-id="">Churrascos<small>${g.churrascos.length ? `${g.churrascos.length} marcados` : 'Organize quem vai e divida a conta'}</small></button></li>
      <li><button data-act="groupCfg">Configurações do grupo<small>Times, regras do rodízio, mensalidade e limites</small></button></li>
      <li><button data-act="reminders">Lembretes do jogo<small>${notif === 'granted' ? 'Ativados neste aparelho' : notif === 'denied' ? 'Bloqueados no navegador' : notif === 'unsupported' ? 'Indisponíveis neste navegador' : 'Toque para ativar'}</small></button></li>
      <li><button data-act="exportGroup">Exportar este grupo<small>Arquivo de backup para guardar ou levar para outro aparelho</small></button></li>
      <li><button data-act="importFile">Importar backup<small>Adiciona grupos de um arquivo exportado</small></button></li>
      ${!standalone ? html`<li><button data-act="installApp">Instalar o app<small>${inst ? 'Adicione à tela inicial' : 'Veja como instalar neste aparelho'}</small></button></li>` : ''}
      <li><button class="danger" data-act="deleteGroup">Excluir este grupo<small>Apaga jogadores, jogos e finanças deste grupo</small></button></li>
    </ul>
    <p class="foot">Apito ${VERSION}. Os dados ficam só neste aparelho; faça backup de vez em quando.</p>`;
}

/* ---------------------------------------------------------------- churrasco */
const total = (c) => c.items.reduce((s, i) => s + num(i.cost), 0);
const shares = (c) => L.splitCost(total(c), c.parts.map((p) => ({ ...p, weight: c.equal ? 1 : p.weight })));
function renderChurrasco(g, c) {
  if (!c) return html`<section class="block"><div class="back"><a href="#/g/${g.id}/mais">Voltar</a></div><h3>Churrascos</h3>
    <ul class="list">${g.churrascos.map((x) => html`<li><button class="row prow-btn" data-act="openChurras" data-id="${x.id}"><span class="pn">${x.title} <small>${fmtDate(x.date)}, ${x.parts.filter((p) => p.going).length} vão</small></span><b>${brl(total(x))}</b></button></li>`)}${g.churrascos.length ? '' : html`<li class="none">Nenhum churrasco ainda</li>`}</ul>
    <section class="actions"><button class="btn primary" data-act="newChurras">Novo churrasco</button></section></section>`;
  const sh = shares(c); const byId = new Map(sh.map((s) => [s.pid, s.amount]));
  return html`<div class="back"><a href="#/g/${g.id}/mais/churrasco">Voltar</a></div>
    <section class="evhead"><div><h2>${c.title}</h2><p>${fmtDate(c.date)}</p></div><button class="mini" data-act="editChurras">Editar</button></section>
    <section class="block"><h3>Compras</h3><ul class="list plain">${c.items.map((i, k) => html`<li class="prow"><span class="pn">${i.name}</span><span class="pbtns"><b>${brl(i.cost)}</b><button class="mini" data-act="delItem" data-k="${k}" aria-label="Remover ${i.name}">Remover</button></span></li>`)}<li class="prow total"><span class="pn"><b>Total</b></span><span class="pbtns"><b>${brl(total(c))}</b></span></li></ul>
      <button class="btn" data-act="addItem">Adicionar item</button></section>
    <section class="block"><h3>Quem vai</h3>
      <label class="check"><input type="checkbox" ${c.equal ? raw('checked') : ''} data-change="churrasEqual"> <span>Dividir igualmente (ignora o tipo de cada um)</span></label>
      <ul class="list plain">${c.parts.map((p, k) => html`<li class="prow"><label class="check"><input type="checkbox" ${p.going ? raw('checked') : ''} data-change="partGoing" data-k="${k}"> <span>${p.name}</span></label>
        <span class="pbtns">${p.going && !c.equal ? html`<select data-change="partWeight" data-k="${k}" aria-label="Tipo de ${p.name}">${WEIGHTS.map(([w, t]) => html`<option value="${w}" ${String(p.weight) === w ? raw('selected') : ''}>${t}</option>`)}</select>` : ''}${p.going ? html`<b>${brl(byId.get(p.pid))}</b>` : ''}</span></li>`)}</ul>
      <button class="btn" data-act="partAll">Marcar todos os mensalistas</button></section>
    <section class="actions"><button class="btn" data-act="shareChurras">Compartilhar valores</button><button class="btn primary" data-act="chargeChurras">Gerar cobranças</button><button class="btn danger" data-act="delChurras">Excluir churrasco</button></section>`;
}

const churrasCtx = () => { const g = curGroup(); return { g, c: g.churrascos.find((x) => x.id === route.id) }; };
const churrasForm = (c, submit, onSubmit) => formSheet({ title: submit === 'Criar' ? 'Novo churrasco' : 'Editar churrasco', submit, fields: [{ name: 'title', label: 'Nome', value: c.title, required: true }, { name: 'date', label: 'Data', type: 'date', value: c.date }], onSubmit });

/* ------------------------------------------------------------- configurações */
function cfgFields(cfg, name) {
  const sel = (v, opts) => opts.map(([a, b]) => ({ v: a, t: b }));
  return [
    { name: 'name', label: 'Nome do grupo', value: name, required: true },
    { name: 'weekday', label: 'Dia do jogo', type: 'select', value: cfg.weekday, options: WEEKDAYS.map((t, i) => ({ v: i, t })) },
    { name: 'time', label: 'Horário', type: 'time', value: cfg.time }, { name: 'location', label: 'Local', value: cfg.location },
    { name: 'maxLine', label: 'Limite de jogadores por jogo', type: 'number', value: cfg.maxLine, hint: '0 = sem limite' }, { name: 'maxGK', label: 'Limite de goleiros por jogo', type: 'number', value: cfg.maxGK },
    { name: 'priorityMonthly', label: '', type: 'check', value: cfg.priorityMonthly, text: 'Mensalistas têm prioridade na lista de presença' },
    { name: 'linePerTeam', label: 'Jogadores na linha por time', type: 'number', value: cfg.linePerTeam, min: 1 }, { name: 'gkPerTeam', label: 'Goleiros por time', type: 'number', value: cfg.gkPerTeam, min: 0, max: 2 },
    { name: 'drawMode', label: 'Sorteio padrão', type: 'select', value: cfg.drawMode, options: sel(0, [['balanced', 'Equilibrado por nota e posição'], ['random', 'Aleatório'], ['arrival', 'Por ordem de chegada']]) },
    { name: 'defaultRating', label: 'Nota-base de quem não tem nota', type: 'number', value: cfg.defaultRating, step: '0.5', min: 0, max: 10 },
    { name: 'matchMinutes', label: 'Duração da partida (minutos)', type: 'number', value: cfg.matchMinutes, hint: '0 = sem limite de tempo' }, { name: 'goalLimit', label: 'Partida acaba com X gols', type: 'number', value: cfg.goalLimit, hint: '0 = não avisa' },
    { name: 'rotation', label: 'Quando um time ganha', type: 'select', value: cfg.rotation, options: sel(0, [['winner_stays', 'Vencedor fica, perdedor sai'], ['both_leave', 'Os dois saem']]) },
    { name: 'maxConsecutive', label: 'Máximo de partidas seguidas', type: 'number', value: cfg.maxConsecutive, hint: 'Depois disso o time sai mesmo vencendo. 0 = sem limite.' },
    { name: 'drawRule', label: 'Quando empata', type: 'select', value: cfg.drawRule, options: sel(0, [['longest_leaves', 'Sai quem está há mais partidas'], ['challenger_leaves', 'Sai o desafiante'], ['holder_leaves', 'Sai quem estava em campo'], ['both_leave', 'Os dois saem']]) },
    { name: 'monthlyFee', label: 'Mensalidade (R$)', type: 'number', step: '0.01', value: cfg.monthlyFee }, { name: 'guestFee', label: 'Diária do convidado (R$)', type: 'number', step: '0.01', value: cfg.guestFee },
    { name: 'dueDay', label: 'Dia de vencimento da mensalidade', type: 'number', min: 1, max: 28, value: cfg.dueDay }, { name: 'adminPhone', label: 'WhatsApp do administrador', type: 'tel', value: cfg.adminPhone, hint: 'Recebe as confirmações enviadas pelo link de convite. Só números, com DDD.' },
  ];
}

const slug = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

on({
  openChurras(el) { const g = curGroup(); go(`#/g/${g.id}/mais/churrasco${el.dataset.id ? '/' + el.dataset.id : ''}`); },
  newChurras() {
    const g = curGroup(); const c = { id: uid(), title: 'Churrasco', date: todayISO(), items: [], equal: false, parts: g.players.filter((p) => p.active !== false).map((p) => ({ pid: p.id, name: p.name, going: false, weight: 1 })) };
    churrasForm(c, 'Criar', (v) => { if (!v.title) return false; c.title = v.title; c.date = v.date; mutate(() => g.churrascos.push(c)); go(`#/g/${g.id}/mais/churrasco/${c.id}`); });
  },
  editChurras() { const { c } = churrasCtx(); churrasForm(c, 'Salvar', (v) => { mutate(() => { c.title = v.title; c.date = v.date; }); }); },
  addItem() { const { c } = churrasCtx(); formSheet({ title: 'Adicionar item', submit: 'Adicionar', fields: [{ name: 'name', label: 'Item', required: true, placeholder: 'Carne, cerveja, carvão...' }, { name: 'cost', label: 'Valor (R$)', type: 'number', step: '0.01', min: 0, required: true }], onSubmit(v) { if (!v.name || v.cost == null) return false; mutate(() => c.items.push({ name: v.name, cost: v.cost })); } }); },
  delItem(el) { const { c } = churrasCtx(); mutate(() => c.items.splice(+el.dataset.k, 1)); },
  churrasEqual(el) { const { c } = churrasCtx(); mutate(() => { c.equal = el.checked; }); },
  partGoing(el) { const { c } = churrasCtx(); mutate(() => { c.parts[+el.dataset.k].going = el.checked; }); },
  partWeight(el) { const { c } = churrasCtx(); mutate(() => { c.parts[+el.dataset.k].weight = num(el.value, 1); }); },
  partAll() { const { g, c } = churrasCtx(); mutate(() => c.parts.forEach((p) => { if (g.players.find((x) => x.id === p.pid)?.type === 'mensalista') p.going = true; })); },
  shareChurras() {
    const { g, c } = churrasCtx(); const sh = shares(c);
    shareText(`🍖 ${c.title} — ${fmtDate(c.date)}\n${g.name}\n\nTotal: ${brl(total(c))} para ${sh.length} pessoas\n\n` + sh.map((s) => `• ${s.name}: ${brl(s.amount)}`).join('\n'), g.name);
  },
  async chargeChurras() {
    const { g, c } = churrasCtx(); const sh = shares(c);
    if (!sh.length || !total(c)) { toast('Adicione itens e marque quem vai'); return; }
    if (!(await confirmBox(`Gerar ${sh.length} cobranças do churrasco? Quem já foi cobrado não é cobrado de novo.`, { ok: 'Gerar cobranças' }))) return;
    let n = 0; mutate(() => sh.forEach((s) => { const ref = `churras:${c.id}:${s.pid}`; if (!g.fin.charges.some((x) => x.ref === ref)) { g.fin.charges.push({ id: uid(), ref, playerId: s.pid, amount: s.amount, desc: c.title, due: c.date, status: 'open', createdAt: Date.now() }); n++; } }));
    toast(n ? `${n} cobrança(s) gerada(s) em Caixa` : 'Todos já foram cobrados');
  },
  async delChurras() { const { g, c } = churrasCtx(); if (!(await confirmBox('Excluir este churrasco? As cobranças já geradas continuam no Caixa.', { ok: 'Excluir', danger: true }))) return; mutate(() => { g.churrascos = g.churrascos.filter((x) => x.id !== c.id); }); go(`#/g/${g.id}/mais/churrasco`); },

  groupCfg() {
    const g = curGroup();
    formSheet({ title: 'Configurações do grupo', submit: 'Salvar', fields: cfgFields(g.cfg, g.name), onSubmit(v) {
      if (!v.name) return false;
      mutate(() => { g.name = v.name; const ints = ['weekday', 'maxLine', 'maxGK', 'linePerTeam', 'gkPerTeam', 'matchMinutes', 'goalLimit', 'maxConsecutive', 'dueDay'];
        Object.keys(v).forEach((k) => { if (k === 'name') return; g.cfg[k] = ints.includes(k) ? Math.max(0, Math.round(num(v[k]))) : ['defaultRating', 'monthlyFee', 'guestFee'].includes(k) ? num(v[k]) : v[k]; });
        g.cfg.adminPhone = String(g.cfg.adminPhone || '').replace(/\D/g, ''); g.cfg.linePerTeam = Math.max(1, g.cfg.linePerTeam); });
      toast('Configurações salvas'); } });
  },
  exportGroup() { const g = curGroup(); download(`apito-${slug(g.name)}-${todayISO()}.json`, new Blob([JSON.stringify({ apito: 1, groups: [g] }, null, 1)], { type: 'application/json' })); toast('Backup exportado'); },
  importFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      try {
        const d = JSON.parse(await inp.files[0].text()); if (!d.groups || !Array.isArray(d.groups)) throw new Error('formato');
        mutate(() => d.groups.forEach((gr) => { const ex = getState().groups.find((x) => x.id === gr.id); if (ex) gr.id = uid(), gr.name += ' (importado)'; getState().groups.push(gr); }));
        toast(`${d.groups.length} grupo(s) importado(s)`); go('#/');
      } catch (e) { toast('Arquivo inválido: use um backup exportado pelo Apito'); }
    };
    inp.click();
  },
  async deleteGroup() {
    const g = curGroup(); if (!(await confirmBox(`Excluir o grupo “${g.name}” com todos os jogadores, jogos e finanças? Exporte um backup antes se quiser guardar.`, { ok: 'Excluir grupo', danger: true }))) return;
    mutate((s) => { s.groups = s.groups.filter((x) => x.id !== g.id); }); go('#/');
  },
  installApp() {
    const e = window.__installEvt;
    if (e) { e.prompt(); e.userChoice.finally(() => { window.__installEvt = null; }); return; }
    openSheet({ title: 'Instalar o Apito', body: html`<p class="msg"><b>iPhone e iPad (Safari):</b> toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p><p class="msg"><b>Android (Chrome):</b> abra o menu ⋮ e toque em “Instalar app” ou “Adicionar à tela inicial”.</p><p class="msg"><b>Computador (Chrome ou Edge):</b> use o ícone de instalação na barra de endereço.</p>` });
  },
  async reminders() {
    if (!('Notification' in window)) { toast('Este navegador não oferece notificações'); return; }
    if (Notification.permission === 'denied') { toast('Libere as notificações nas configurações do navegador'); return; }
    const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    mutate((s) => { s.prefs.notify = p === 'granted'; });
    formSheet({ title: 'Lembretes do jogo', submit: 'Salvar', fields: [{ name: 'h', label: 'Avisar quantas horas antes?', type: 'number', min: 1, max: 48, value: getState().prefs.reminderHours }], extra: '<p class="hint">O aviso aparece quando o app é aberto perto do horário. Para receber com o app fechado seria preciso um servidor de notificações, que este app não usa.</p>',
      onSubmit(v) { mutate((s) => { s.prefs.reminderHours = Math.max(1, Math.round(v.h || 3)); }); toast(p === 'granted' ? 'Lembretes ativados' : 'Permissão não concedida'); } });
  },
});
