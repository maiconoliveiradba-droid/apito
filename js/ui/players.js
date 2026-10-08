// Aba Jogadores: cadastro, notas-base e estatísticas individuais
import { html, raw, esc, initials, brl, num } from '../util.js';
import { mutate, newPlayer } from '../store.js';
import * as L from '../logic.js';
import { route, curGroup, on, go, player } from './ctx.js';
import { toast, formSheet, confirmBox, openSheet, closeSheet } from './common.js';

let query = '';
const POS = [{ v: 'linha', t: 'Linha' }, { v: 'goleiro', t: 'Goleiro' }];
const TYPE = [{ v: 'mensalista', t: 'Mensalista' }, { v: 'convidado', t: 'Convidado' }];

function plist(g) {
  const q = query.trim().toLowerCase();
  const stats = L.aggregate(g.events);
  const list = g.players.filter((p) => !q || p.name.toLowerCase().includes(q)).sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name, 'pt-BR'));
  if (!list.length) return html`<li class="none">${g.players.length ? 'Nenhum jogador com esse nome' : 'Cadastre os jogadores do grupo para montar a lista de presença'}</li>`;
  return html`${list.map((p) => { const s = stats.get(p.id);
    return html`<li><button class="row prow-btn ${p.active === false ? 'off' : ''}" data-act="playerSheet" data-pid="${p.id}"><span class="avatar">${initials(p.name)}</span>
      <span class="pn">${p.name} ${p.position === 'goleiro' ? html`<span class="tag">goleiro</span>` : ''} ${p.type !== 'mensalista' ? html`<span class="tag soft">${p.type}</span>` : ''} ${p.active === false ? html`<span class="tag soft">arquivado</span>` : ''}</span>
      <small>nota ${String(p.baseRating).replace('.', ',')}${s ? `, ${s.presencas} presenças` : ''}</small></button></li>`; })}`;
}

export function renderPlayers(g) {
  return html`
    <section class="toolbar"><input type="search" id="psearch" placeholder="Buscar jogador" value="${query}" data-input="playerSearch" aria-label="Buscar jogador"><button class="btn primary" data-act="addPlayer">Novo jogador</button></section>
    <ul class="list" id="plist">${plist(g)}</ul>
    <section class="actions"><button class="btn" data-act="addMany">Adicionar vários de uma vez</button></section>`;
}

function playerForm(g, p, title, submit, onSubmit) {
  formSheet({ title, submit, fields: [
    { name: 'name', label: 'Nome', value: p.name, required: true }, { name: 'position', label: 'Posição', type: 'select', value: p.position, options: POS },
    { name: 'type', label: 'Tipo', type: 'select', value: p.type, options: TYPE, hint: 'Mensalistas têm prioridade na lista de presença e pagam mensalidade.' },
    { name: 'baseRating', label: 'Nota-base (0 a 10)', type: 'number', value: p.baseRating, step: '0.5', min: 0, max: 10, hint: 'Usada no sorteio equilibrado. As avaliações dos jogos vão ajustando essa nota.' },
    { name: 'phone', label: 'WhatsApp (opcional)', type: 'tel', value: p.phone, placeholder: 'DDD + número' }], onSubmit });
}

function statGrid(s) {
  const c = (l, v) => html`<div><b>${v}</b><span>${l}</span></div>`;
  return html`<div class="stats">${c('Presenças', s.presencas)}${c('Jogos', s.jogos)}${c('Vitórias', s.v)}${c('Gols', s.gols)}${c('Assistências', s.assist)}${c('Desarmes', s.desarmes)}${c('Defesas difíceis', s.defesas)}${c('Falhas', s.falhas)}${c('Nota média', s.notaMedia == null ? '—' : String(s.notaMedia).replace('.', ','))}</div>`;
}

on({
  playerSearch(el) { query = el.value; const g = curGroup(); document.getElementById('plist').innerHTML = plist(g).toString(); },
  addPlayer() {
    const g = curGroup(); const p = newPlayer({ baseRating: g.cfg.defaultRating });
    playerForm(g, p, 'Novo jogador', 'Adicionar', (v) => { if (!v.name) return false; mutate(() => g.players.push({ ...p, name: v.name, position: v.position, type: v.type, baseRating: v.baseRating ?? g.cfg.defaultRating, phone: v.phone })); });
  },
  addMany() {
    const g = curGroup();
    formSheet({ title: 'Adicionar vários', submit: 'Adicionar todos', fields: [
      { name: 'names', label: 'Um nome por linha', type: 'textarea', rows: 8, placeholder: 'Rafa\nBruno\nLéo' },
      { name: 'position', label: 'Posição', type: 'select', value: 'linha', options: POS }, { name: 'type', label: 'Tipo', type: 'select', value: 'mensalista', options: TYPE }],
    onSubmit(v) { const names = v.names.split('\n').map((s) => s.trim()).filter(Boolean); if (!names.length) return false; mutate(() => names.forEach((n) => g.players.push(newPlayer({ name: n, position: v.position, type: v.type, baseRating: g.cfg.defaultRating })))); toast(`${names.length} jogadores adicionados`); } });
  },
  playerSheet(el) {
    const g = curGroup(); const p = player(g, el.dataset.pid); const s = L.aggregate(g.events).get(p.id) || L.aggregate([]).get(p.id) || { presencas: 0, jogos: 0, v: 0, gols: 0, assist: 0, desarmes: 0, defesas: 0, falhas: 0, notaMedia: null };
    const w = L.walletOf(g.fin, p.id); const d = L.playerDebts(g.fin, p.id);
    openSheet({ title: p.name, wide: true, body: html`<p class="hint">${p.position === 'goleiro' ? 'Goleiro' : 'Linha'}, ${p.type}, nota-base ${String(p.baseRating).replace('.', ',')}${p.phone ? `, ${p.phone}` : ''}</p>${statGrid(s)}
      <h3>Financeiro</h3><div class="stats two"><div><b>${brl(w)}</b><span>Carteira (crédito)</span></div><div class="${d.totalLate ? 'late' : ''}"><b>${brl(d.totalLate)}</b><span>Em atraso</span></div></div>`,
    foot: html`<button class="btn" data-act="editPlayer" data-pid="${p.id}">Editar</button><button class="btn" data-act="archivePlayer" data-pid="${p.id}">${p.active === false ? 'Reativar' : 'Arquivar'}</button><button class="btn danger" data-act="deletePlayer" data-pid="${p.id}">Excluir</button>` });
  },
  editPlayer(el) {
    const g = curGroup(); const p = player(g, el.dataset.pid); closeSheet();
    playerForm(g, p, 'Editar jogador', 'Salvar', (v) => { if (!v.name) return false; mutate(() => Object.assign(p, { name: v.name, position: v.position, type: v.type, baseRating: v.baseRating ?? p.baseRating, phone: v.phone })); });
  },
  archivePlayer(el) { const g = curGroup(); const p = player(g, el.dataset.pid); mutate(() => { p.active = p.active === false; }); closeSheet(); toast(p.active === false ? 'Jogador arquivado' : 'Jogador reativado'); },
  async deletePlayer(el) {
    const g = curGroup(); const p = player(g, el.dataset.pid); closeSheet();
    const used = g.events.some((e) => e.matches.some((m) => Object.values(m.lineup).some((ids) => ids.includes(p.id))) || e.arrivals.includes(p.id));
    const msg = used ? `${p.name} tem histórico de jogos. Excluir remove o nome dos rankings e das partidas antigas. Prefira arquivar. Excluir mesmo assim?` : `Excluir ${p.name}?`;
    if (!(await confirmBox(msg, { ok: 'Excluir', danger: true }))) return;
    mutate(() => { g.players = g.players.filter((x) => x.id !== p.id); g.events.forEach((e) => { delete e.rsvp[p.id]; e.arrivals = e.arrivals.filter((id) => id !== p.id); }); });
  },
});
