// Aba Rankings: por estatística e por período (semana, mês, semestre, ano, geral)
import { html, raw, fmtDateShort, fmtDate, MONTHS, fromISO, todayISO } from '../util.js';
import * as L from '../logic.js';
import { curGroup, on, pname } from './ctx.js';
import { renderCard, shareImage, shareText } from './common.js';

const rk = { period: 'mes', stat: 'gols', ref: todayISO() };
const PERIODS = [['semana', 'Semana'], ['mes', 'Mês'], ['semestre', 'Semestre'], ['ano', 'Ano'], ['tudo', 'Geral']];

function label() {
  const { from, to } = L.periodRange(rk.period, rk.ref); const d = fromISO(rk.ref);
  if (rk.period === 'semana') return `${fmtDateShort(from)} a ${fmtDateShort(to)}`;
  if (rk.period === 'mes') { const m = MONTHS[d.getMonth()]; return `${m[0].toUpperCase()}${m.slice(1)} de ${d.getFullYear()}`; }
  if (rk.period === 'semestre') return `${d.getMonth() < 6 ? '1º' : '2º'} semestre de ${d.getFullYear()}`;
  if (rk.period === 'ano') return String(d.getFullYear());
  return 'Todo o período';
}
function data(g) {
  const stats = L.aggregate(g.events, L.periodRange(rk.period, rk.ref));
  return L.ranking(stats, rk.stat, (id) => pname(g, id)).filter((r) => g.players.some((p) => p.id === r.id));
}

export function renderRankings(g) {
  const rows = data(g); const def = L.RANK_STATS.find((s) => s.key === rk.stat);
  return html`
    <div class="seg" role="tablist" aria-label="Período">${PERIODS.map(([k, t]) => html`<button role="tab" aria-selected="${rk.period === k}" data-act="rkPeriod" data-k="${k}">${t}</button>`)}</div>
    ${rk.period !== 'tudo' ? html`<div class="pager"><button class="mini" data-act="rkShift" data-d="-1" aria-label="Período anterior">Anterior</button><b>${label()}</b><button class="mini" data-act="rkShift" data-d="1" aria-label="Próximo período">Próximo</button></div>` : html`<div class="pager"><b>${label()}</b></div>`}
    <div class="statpick" role="tablist" aria-label="Estatística">${L.RANK_STATS.map((s) => html`<button role="tab" aria-selected="${rk.stat === s.key}" data-act="rkStat" data-k="${s.key}">${s.label}</button>`)}</div>
    ${rows.length ? html`<ol class="rank">${rows.map((r) => html`<li class="${r.pos <= 3 ? 'top' : ''}"><b class="pos">${r.pos}</b><span class="nm">${pname(g, r.id)}</span><small>${r.s.jogos} jogos</small><b class="val">${r.text}</b></li>`)}</ol>
      <section class="actions"><button class="btn" data-act="rkShareText">Compartilhar texto</button><button class="btn primary" data-act="rkShareImg">Compartilhar imagem</button></section>`
      : html`<section class="empty"><h2>Sem dados neste período</h2><p>${def.min ? 'Esta estatística precisa de mais jogos ou avaliações.' : 'Os rankings são montados com as peladas encerradas.'}</p></section>`}`;
}

on({
  rkPeriod(el) { rk.period = el.dataset.k; rk.ref = todayISO(); window.dispatchEvent(new HashChangeEvent('hashchange')); },
  rkShift(el) { rk.ref = L.shiftRef(rk.period, rk.ref, +el.dataset.d); window.dispatchEvent(new HashChangeEvent('hashchange')); },
  rkStat(el) { rk.stat = el.dataset.k; window.dispatchEvent(new HashChangeEvent('hashchange')); },
  rkShareText() {
    const g = curGroup(); const def = L.RANK_STATS.find((s) => s.key === rk.stat); const rows = data(g).slice(0, 15);
    const medals = ['🥇', '🥈', '🥉'];
    shareText(`🏆 Ranking de ${def.label.toLowerCase()} — ${label()}\n${g.name}\n\n` + rows.map((r) => `${medals[r.pos - 1] || `${r.pos}.`} ${pname(g, r.id)} — ${r.text}`).join('\n'), g.name);
  },
  async rkShareImg() {
    const g = curGroup(); const def = L.RANK_STATS.find((s) => s.key === rk.stat); const rows = data(g).slice(0, 12);
    const blob = await renderCard({ title: `Ranking de ${def.label.toLowerCase()}`, subtitle: `${g.name}, ${label()}`, rows: rows.map((r) => ({ left: r.pos, name: pname(g, r.id), right: r.text, hot: r.pos === 1 })), footer: 'Feito no Apito' });
    shareImage(blob, `ranking-${rk.stat}.png`, 'Ranking');
  },
});
