// Aba Pelada: do aviso de presença até os destaques do dia
import { html, raw, esc, fmtDateLong, fmtDate, fmtDateShort, clock, todayISO, uid, num, nextWeekday, b64urlEncode, brl, addDays } from '../util.js';
import { mutate, newEvent, newPlayer } from '../store.js';
import * as L from '../logic.js';
import { route, curGroup, curEvent, on, go, pname, player } from './ctx.js';
import { toast, formSheet, confirmBox, pickPlayer, shareText, copyText, openSheet, closeSheet, renderCard, shareImage } from './common.js';

const STAGES = [['presenca', 'Presença'], ['chegada', 'Chegada'], ['times', 'Times'], ['partida', 'Partida'], ['pos', 'Pós-jogo']];
const defaultStage = (ev) => (ev.status === 'encerrada' ? 'pos' : ev.status === 'agendada' ? 'presenca' : !ev.teams.length ? 'chegada' : 'partida');
const teamCol = (t) => L.TEAM_COLORS[t.color % L.TEAM_COLORS.length];
const teamStyle = (t) => { const c = teamCol(t); return `--tc:${c.c};--tt:${c.t}`; };
const team = (ev, id) => ev.teams.find((t) => t.id === id);
const fullSize = (g) => g.cfg.linePerTeam + g.cfg.gkPerTeam;
const gkTag = (p) => (p && p.position === 'goleiro' ? raw('<span class="tag">goleiro</span>') : '');
const typeTag = (p) => (p && p.type !== 'mensalista' ? raw(`<span class="tag soft">${esc(p.type)}</span>`) : '');
const liveMatch = (ev) => ev.matches.find((m) => m.status === 'andamento');

/* ------------------------------------------------------------------ render */
export function renderPelada(g) {
  const ev = curEvent(g) || (route.eid ? null : g.events.filter((e) => e.status !== 'encerrada').sort((a, b) => (a.date < b.date ? -1 : 1))[0]);
  if (!ev) return html`${emptyState(g)}${history(g)}`;
  const stage = route.stage || defaultStage(ev);
  const base = `#/g/${g.id}/pelada/${ev.id}`;
  const locked = (s) => ev.status === 'agendada' && ['chegada', 'times', 'partida'].includes(s);
  return html`
    <section class="evhead">
      <div><h2>${fmtDateLong(ev.date)}</h2><p>${ev.time}${ev.location ? html`, ${ev.location}` : ''}</p></div>
      <button class="mini" data-act="editEvent">Editar</button>
    </section>
    <nav class="stages" aria-label="Etapas da pelada">${STAGES.map(([s, t], i) => locked(s)
      ? html`<a aria-disabled="true" aria-label="${t} (bloqueada)" data-act="locked"><b>${i + 1}</b><span class="t">${t}</span></a>`
      : html`<a href="${base}/${s}" aria-label="${t}" ${s === stage ? raw('aria-current="step"') : ''}><b>${i + 1}</b><span class="t">${t}</span></a>`)}</nav>
    ${stage === 'presenca' ? viewPresenca(g, ev) : stage === 'chegada' ? viewChegada(g, ev) : stage === 'times' ? viewTimes(g, ev) : stage === 'partida' ? viewPartida(g, ev) : viewPos(g, ev)}
    ${route.eid ? '' : history(g)}`;
}

function emptyState(g) {
  return html`<section class="empty"><h2>Nenhuma pelada marcada</h2><p>Agende o próximo jogo para abrir a lista de presença e avisar o grupo.</p>
    <button class="btn primary" data-act="newEvent">Agendar pelada</button></section>`;
}

function history(g) {
  const done = g.events.filter((e) => e.status === 'encerrada').sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!done.length) return '';
  return html`<section class="block"><h3>Jogos anteriores</h3><ul class="list">${done.map((e) => {
    const h = L.highlights(e, g.players).find((x) => x.key === 'craque');
    return html`<li><a class="row" href="#/g/${g.id}/pelada/${e.id}/pos"><span><b>${fmtDate(e.date)}</b> <small>${e.matches.filter((m) => m.status === 'encerrada').length} partidas</small></span><small>${h ? `craque: ${h.ids.map((id) => pname(g, id)).join(', ')}` : ''}</small></a></li>`; })}</ul></section>`;
}

/* ---------------------------------------------------------------- presença */
function listText(g, ev) {
  const a = L.attendance(ev, g.players, g.cfg);
  const num1 = (arr) => arr.map((p, i) => `${i + 1}. ${p.name}`).join('\n') || '-';
  let t = `⚽ ${g.name}\n📅 ${fmtDateLong(ev.date)}, ${ev.time}${ev.location ? `\n📍 ${ev.location}` : ''}\n\n`;
  t += `🧤 Goleiros (${a.gk.ok.length}${a.maxGK ? `/${a.maxGK}` : ''}):\n${num1(a.gk.ok)}\n\n🏃 Jogadores (${a.line.ok.length}${a.maxLine ? `/${a.maxLine}` : ''}):\n${num1(a.line.ok)}`;
  const wait = [...a.gk.wait, ...a.line.wait]; if (wait.length) t += `\n\n⏳ Fila de espera:\n${num1(wait)}`;
  return t;
}
function inviteLink(g, ev) {
  const code = b64urlEncode({ g: g.name, d: ev.date, t: ev.time, l: ev.location, w: g.cfg.adminPhone || '', p: g.players.filter((p) => p.active !== false).map((p) => p.name) });
  return `${location.origin}${location.pathname}#/convite/${code}`;
}

function viewPresenca(g, ev) {
  const a = L.attendance(ev, g.players, g.cfg);
  const wait = [...a.gk.wait, ...a.line.wait];
  const row = (p, btns, note = '') => html`<li class="prow"><span class="pn">${p.name} ${gkTag(p)} ${typeTag(p)} ${note ? html`<small>${note}</small>` : ''}</span><span class="pbtns">${btns}</span></li>`;
  const no = (p) => html`<button class="mini" data-act="rsvp" data-pid="${p.id}" data-s="nao">Não vai</button>`;
  const yes = (p) => html`<button class="mini ok" data-act="rsvp" data-pid="${p.id}" data-s="sim">Vai</button>`;
  const clear = (p) => html`<button class="mini" data-act="rsvp" data-pid="${p.id}" data-s="">Limpar</button>`;
  return html`
    <section class="chips"><span class="chip ${a.maxLine && a.line.ok.length >= a.maxLine ? 'full' : ''}"><b>${a.line.ok.length}</b>${a.maxLine ? `/${a.maxLine}` : ''} jogadores</span>
      <span class="chip ${a.maxGK && a.gk.ok.length >= a.maxGK ? 'full' : ''}"><b>${a.gk.ok.length}</b>${a.maxGK ? `/${a.maxGK}` : ''} goleiros</span>
      <span class="chip"><b>${wait.length}</b> na espera</span><span class="chip"><b>${a.pending.length}</b> sem resposta</span></section>
    <section class="block"><h3>Goleiros confirmados</h3><ul class="list plain">${a.gk.ok.map((p) => row(p, no(p))) || ''}${a.gk.ok.length ? '' : html`<li class="none">Ninguém ainda</li>`}</ul></section>
    <section class="block"><h3>Jogadores confirmados</h3><ul class="list plain">${a.line.ok.map((p, i) => row(p, no(p), `#${i + 1}`))}${a.line.ok.length ? '' : html`<li class="none">Ninguém ainda</li>`}</ul></section>
    ${wait.length ? html`<section class="block"><h3>Fila de espera</h3><p class="hint">Quando alguém desiste, o primeiro da fila entra automaticamente.</p><ul class="list plain">${wait.map((p, i) => row(p, no(p), `espera #${i + 1}`))}</ul></section>` : ''}
    ${a.pending.length ? html`<section class="block"><h3>Sem resposta</h3><ul class="list plain">${a.pending.map((p) => row(p, html`${yes(p)}${no(p)}`))}</ul></section>` : ''}
    ${a.declined.length ? html`<section class="block"><h3>Não vão</h3><ul class="list plain">${a.declined.map((p) => row(p, html`${yes(p)}${clear(p)}`))}</ul></section>` : ''}
    <section class="actions">
      <button class="btn" data-act="addGuest">Adicionar convidado</button>
      <button class="btn" data-act="shareList">Lista no WhatsApp</button>
      <button class="btn" data-act="inviteLink">Link para confirmar presença</button>
      <button class="btn primary big" data-act="startEvent">Iniciar pelada</button>
    </section>`;
}

/* ----------------------------------------------------------------- chegada */
function viewChegada(g, ev) {
  const a = L.attendance(ev, g.players, g.cfg);
  const confirmed = [...a.gk.ok, ...a.line.ok];
  const arrived = ev.arrivals.map((id) => player(g, id)).filter(Boolean);
  const missing = confirmed.filter((p) => !ev.arrivals.includes(p.id));
  return html`
    <p class="hint">A ordem de chegada define quem joga primeiro e quem fica de reserva no sorteio.</p>
    <section class="block"><h3>Já chegaram (${arrived.length})</h3><ol class="list order">${arrived.map((p, i) => html`<li class="prow"><span class="pn"><b class="n">${i + 1}</b>${p.name} ${gkTag(p)}</span><span class="pbtns"><button class="mini" data-act="unarrive" data-pid="${p.id}">Desfazer</button></span></li>`)}${arrived.length ? '' : html`<li class="none">Toque em “Chegou” quando cada jogador aparecer</li>`}</ol></section>
    <section class="block"><h3>Faltam chegar (${missing.length})</h3><ul class="list plain">${missing.map((p) => html`<li class="prow"><span class="pn">${p.name} ${gkTag(p)}</span><span class="pbtns"><button class="mini ok" data-act="arrive" data-pid="${p.id}">Chegou</button></span></li>`)}</ul></section>
    <section class="actions"><button class="btn" data-act="arriveOther">Chegou sem confirmar</button><button class="btn primary big" data-act="stage" data-s="times">Ir para o sorteio</button></section>`;
}

/* ------------------------------------------------------------------- times */
function drawOpts(g, ev) { return { mode: g.cfg.drawMode, linePerTeam: g.cfg.linePerTeam, gkPerTeam: g.cfg.gkPerTeam, ...(ev.drawOpts || {}) }; }
function viewTimes(g, ev) {
  const o = drawOpts(g, ev);
  const rating = (id) => L.effectiveRating(player(g, id), g.events.filter((e) => e.id !== ev.id), g.cfg);
  const started = ev.matches.length > 0;
  return html`
    <section class="block"><h3>Sorteio</h3>
      <div class="inline">
        <label>Modo<select data-change="drawOpt" data-k="mode"><option value="balanced" ${o.mode === 'balanced' ? raw('selected') : ''}>Equilibrado</option><option value="random" ${o.mode === 'random' ? raw('selected') : ''}>Aleatório</option><option value="arrival" ${o.mode === 'arrival' ? raw('selected') : ''}>Por chegada</option></select></label>
        <label>Na linha<input type="number" min="1" max="11" value="${o.linePerTeam}" data-change="drawOpt" data-k="linePerTeam"></label>
        <label>Goleiros<input type="number" min="0" max="2" value="${o.gkPerTeam}" data-change="drawOpt" data-k="gkPerTeam"></label>
      </div>
      <button class="btn primary" data-act="draw">${ev.teams.length ? 'Sortear de novo' : 'Sortear times'}</button></section>
    ${ev.teams.length ? html`
      <section class="teams">${ev.teams.map((t) => {
        const sum = t.players.reduce((s, id) => s + rating(id), 0);
        return html`<article class="team" style="${teamStyle(t)}"><header><h3>${t.name}</h3><small>${t.players.length} jogadores, nota média ${(sum / Math.max(1, t.players.length)).toFixed(1).replace('.', ',')}</small></header>
          <ul>${t.players.map((id) => html`<li><span>${pname(g, id)} ${gkTag(player(g, id))}</span><button class="mini" data-act="movePlayer" data-pid="${id}" aria-label="Mover ${pname(g, id)}">Mover</button></li>`)}</ul></article>`; })}</section>
      ${ev.reserve.length ? html`<section class="block"><h3>Reservas</h3><p class="hint">Entram para completar times incompletos, começando por quem jogou menos.</p><ul class="list plain">${ev.reserve.map((id) => html`<li class="prow"><span class="pn">${pname(g, id)} ${gkTag(player(g, id))}</span><span class="pbtns"><button class="mini" data-act="movePlayer" data-pid="${id}">Mover</button></span></li>`)}</ul></section>` : ''}
      ${!started && ev.court ? html`<section class="block"><h3>Primeiro jogo</h3><div class="inline">
        ${[0, 1].map((i) => html`<label>${i ? 'Contra' : 'Time'}<select data-change="court" data-i="${i}">${ev.teams.map((t) => html`<option value="${t.id}" ${ev.court[i] === t.id ? raw('selected') : ''}>${t.name}</option>`)}</select></label>`)}</div></section>` : ''}
      <section class="actions"><button class="btn" data-act="shareTeams">Compartilhar times</button><button class="btn primary big" data-act="stage" data-s="partida">Ir para a partida</button></section>` : ''}`;
}

/* ----------------------------------------------------------------- partida */
function lineupLabel(g, ev, m, tid) { return (m.lineup[tid] || []).map((id) => ({ ...player(g, id), teamName: team(ev, tid)?.name })); }
function viewPartida(g, ev) {
  if (ev.teams.length < 2 || !ev.court) return html`<section class="empty"><h2>Sorteie os times primeiro</h2><p>A partida usa os times sorteados e o rodízio automático da fila.</p><button class="btn primary" data-act="stage" data-s="times">Ir para o sorteio</button></section>`;
  const m = liveMatch(ev);
  const queue = html`<section class="block"><h3>Fila de times</h3><ol class="queue">${ev.queue.map((id) => html`<li style="${teamStyle(team(ev, id))}"><span class="dot"></span>${team(ev, id).name}</li>`)}${ev.queue.length ? '' : html`<li class="none">Só dois times: continuam jogando entre si</li>`}</ol></section>`;
  const done = ev.matches.filter((x) => x.status === 'encerrada');
  const resumo = done.length ? html`<section class="block"><h3>Resultados</h3><ul class="list plain">${[...done].reverse().map((x) => { const s = L.score(x); return html`<li class="res"><span>${team(ev, x.a).name}</span><b>${s[x.a]} x ${s[x.b]}</b><span>${team(ev, x.b).name}</span></li>`; })}</ul></section>` : '';
  if (!m) {
    const [a, b] = ev.court; const used = [];
    const la = L.buildLineup(ev, a, fullSize(g)); const lb = L.buildLineup(ev, b, fullSize(g), la);
    const names = (ids, tid) => ids.map((id) => `${pname(g, id)}${team(ev, tid).players.includes(id) ? '' : ' (reserva)'}`).join(', ');
    return html`<section class="next"><h2>${done.length ? 'Próxima partida' : 'Primeira partida'}</h2>
      <div class="vs"><div style="${teamStyle(team(ev, a))}"><b>${team(ev, a).name}</b><small>${names(la, a)}</small></div><span>x</span><div style="${teamStyle(team(ev, b))}"><b>${team(ev, b).name}</b><small>${names(lb, b)}</small></div></div>
      <button class="btn primary big" data-act="startMatch">Iniciar partida</button></section>${queue}${resumo}`;
  }
  const s = L.score(m); const ta = team(ev, m.a); const tb = team(ev, m.b);
  const running = !!m.runningSince;
  const stat = (type, label) => html`<button class="btn" data-act="stat" data-type="${type}">${label}</button>`;
  return html`
    <section class="board" aria-label="Placar">
      <div class="side" style="${teamStyle(ta)}"><span class="tname">${ta.name}</span><output class="score">${s[m.a]}</output><button class="goal" data-act="goal" data-tid="${m.a}">Gol</button></div>
      <div class="mid"><output class="clock" data-timer="${m.id}">${clock(L.elapsedOf(m))}</output><small>${m.limitMs ? `limite ${clock(m.limitMs)}` : 'sem limite'}</small></div>
      <div class="side" style="${teamStyle(tb)}"><span class="tname">${tb.name}</span><output class="score">${s[m.b]}</output><button class="goal" data-act="goal" data-tid="${m.b}">Gol</button></div>
    </section>
    <section class="controls"><button class="btn ${running ? '' : 'primary'}" data-act="toggleTimer">${running ? 'Pausar' : (m.elapsed ? 'Continuar' : 'Iniciar cronômetro')}</button><button class="btn" data-act="resetTimer">Zerar</button><button class="btn danger" data-act="endMatch">Encerrar partida</button></section>
    <section class="statrow">${stat('desarme', 'Desarme')}${stat('defesa', 'Defesa difícil')}${stat('falha', 'Falha')}</section>
    <section class="block"><h3>Lances da partida</h3><ul class="log">${[...m.events].reverse().map((e) => html`<li><time>${clock(e.t)}</time><span>${e.type === 'gol' ? html`<b>Gol</b> de ${pname(g, e.playerId)}${e.assistId ? html`, assistência de ${pname(g, e.assistId)}` : ''}` : html`<b>${L.STAT_LABEL[e.type]}</b> de ${pname(g, e.playerId)}`} <small>${team(ev, e.teamId)?.name || ''}</small></span><button class="mini" data-act="delEvent" data-eid="${e.id}" aria-label="Desfazer lance">Desfazer</button></li>`)}${m.events.length ? '' : html`<li class="none">Nenhum lance registrado</li>`}</ul></section>
    ${queue}${resumo}`;
}

/* ------------------------------------------------------------------- pós-jogo */
function presentIds(ev) {
  const s = new Set(ev.arrivals); ev.matches.forEach((m) => Object.values(m.lineup || {}).forEach((ids) => ids.forEach((id) => s.add(id)))); return [...s];
}
function hlText(g, ev, hl) {
  return `🏆 Destaques da pelada de ${fmtDate(ev.date)} — ${g.name}\n\n` + hl.map((h) => `${h.title}: ${h.ids.map((id) => pname(g, id)).join(', ')} (${h.text})`).join('\n');
}
function hlBlock(g, ev) {
  const hl = L.highlights(ev, g.players);
  return html`<h3>Destaques do dia</h3>${hl.length ? html`<ul class="hl">${hl.map((h) => html`<li><b>${h.title}</b><span>${h.ids.map((id) => pname(g, id)).join(', ')}</span><small>${h.text}</small></li>`)}</ul>
    <div class="actions"><button class="btn" data-act="shareHl">Compartilhar destaques</button><button class="btn" data-act="shareHlImg">Imagem dos destaques</button></div>` : html`<p class="hint">Registre gols, lances e notas para ver os destaques.</p>`}`;
}
function viewPos(g, ev) {
  const ids = presentIds(ev).filter((id) => player(g, id)).sort((a, b) => pname(g, a).localeCompare(pname(g, b), 'pt-BR'));
  const done = ev.matches.filter((x) => x.status === 'encerrada');
  const open = liveMatch(ev);
  return html`
    ${open ? html`<p class="warn">Há uma partida em andamento. Encerre-a na etapa Partida antes de fechar a pelada.</p>` : ''}
    ${done.length ? html`<section class="block"><h3>Partidas</h3><ul class="list plain">${done.map((x) => { const s = L.score(x); return html`<li class="res"><span>${team(ev, x.a)?.name}</span><b>${s[x.a]} x ${s[x.b]}</b><span>${team(ev, x.b)?.name}</span></li>`; })}</ul></section>` : ''}
    <section class="block" id="hlbox">${hlBlock(g, ev)}</section>
    <section class="block"><h3>Avaliação dos jogadores</h3><p class="hint">Notas de 0 a 10. Elas entram no ranking e ajudam a equilibrar os próximos sorteios.</p>
      <ul class="list plain rate">${ids.map((id) => html`<li class="prow"><span class="pn">${pname(g, id)} ${gkTag(player(g, id))}</span><span class="pbtns"><input type="number" inputmode="decimal" min="0" max="10" step="0.5" placeholder="—" aria-label="Nota de ${pname(g, id)}" value="${typeof ev.ratings[id] === 'number' ? ev.ratings[id] : ''}" data-change="rate" data-pid="${id}"></span></li>`)}</ul></section>
    <section class="actions">
      ${ev.status === 'encerrada' ? html`<button class="btn danger" data-act="reopenEvent">Reabrir pelada</button><button class="btn danger" data-act="deleteEvent">Excluir pelada</button>`
        : html`<button class="btn primary big" data-act="finishEvent">Encerrar pelada</button>`}
    </section>`;
}

/* ----------------------------------------------------------------- cronômetro */
let audio; let wake;
function beep(times = 3) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) { const o = audio.createOscillator(); const gn = audio.createGain(); o.connect(gn); gn.connect(audio.destination); o.frequency.value = 880; gn.gain.value = 0.2; o.start(audio.currentTime + i * 0.35); o.stop(audio.currentTime + i * 0.35 + 0.22); }
  } catch (e) { /* sem áudio */ }
  if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 400]);
}
async function keepAwake(on) {
  try {
    if (on && !wake && 'wakeLock' in navigator) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    if (!on && wake) { await wake.release(); wake = null; }
  } catch (e) { /* não suportado */ }
}
// chamado a cada segundo pelo app: atualiza o relógio sem refazer a tela e dispara o aviso do tempo
export function tick() {
  const g = curGroup(); if (!g) return;
  const ev = g.events.find((e) => e.status === 'aovivo'); if (!ev) { keepAwake(false); return; }
  const m = liveMatch(ev); if (!m) { keepAwake(false); return; }
  const ms = L.elapsedOf(m);
  document.querySelectorAll(`[data-timer="${m.id}"]`).forEach((el) => { el.textContent = clock(ms); el.classList.toggle('over', !!m.limitMs && ms >= m.limitMs); });
  keepAwake(!!m.runningSince);
  if (m.runningSince && m.limitMs && ms >= m.limitMs && !m.alerted) { mutate(() => { m.alerted = true; }, { silent: true }); beep(); toast('Tempo de jogo esgotado'); }
}

/* -------------------------------------------------------------------- ações */
const ctx = () => { const g = curGroup(); const ev = curEvent(g) || g.events.filter((e) => e.status !== 'encerrada').sort((a, b) => (a.date < b.date ? -1 : 1))[0]; return { g, ev }; };
const eventForm = (g, ev, submitLabel, onSubmit) => formSheet({
  title: submitLabel === 'Agendar' ? 'Agendar pelada' : 'Editar pelada', submit: submitLabel,
  fields: [{ name: 'date', label: 'Data', type: 'date', value: ev.date, required: true }, { name: 'time', label: 'Horário', type: 'time', value: ev.time },
    { name: 'location', label: 'Local', value: ev.location, placeholder: 'Quadra, endereço...' },
    { name: 'maxLine', label: 'Limite de jogadores', type: 'number', value: ev.maxLine, hint: '0 = sem limite. Quem passar do limite entra na fila de espera.' },
    { name: 'maxGK', label: 'Limite de goleiros', type: 'number', value: ev.maxGK }], onSubmit });

on({
  newEvent() {
    const g = curGroup(); const draft = newEvent(g);
    eventForm(g, draft, 'Agendar', (v) => { Object.assign(draft, { date: v.date, time: v.time, location: v.location, maxLine: v.maxLine ?? 0, maxGK: v.maxGK ?? 0 }); mutate(() => g.events.push(draft)); go(`#/g/${g.id}/pelada/${draft.id}/presenca`); });
  },
  editEvent() {
    const { g, ev } = ctx(); if (!ev) return;
    eventForm(g, ev, 'Salvar', (v) => { mutate(() => Object.assign(ev, { date: v.date, time: v.time, location: v.location, maxLine: v.maxLine ?? 0, maxGK: v.maxGK ?? 0 })); });
  },
  locked() { toast('Inicie a pelada para liberar esta etapa'); },
  stage(el) { const { g, ev } = ctx(); go(`#/g/${g.id}/pelada/${ev.id}/${el.dataset.s}`); },
  rsvp(el) {
    const { g, ev } = ctx(); const { pid, s } = el.dataset;
    mutate(() => { if (!s) delete ev.rsvp[pid]; else ev.rsvp[pid] = { s, at: Date.now() }; });
  },
  addGuest() {
    const { g, ev } = ctx();
    formSheet({ title: 'Adicionar convidado', submit: 'Adicionar e confirmar', fields: [
      { name: 'name', label: 'Nome', required: true }, { name: 'position', label: 'Posição', type: 'select', value: 'linha', options: [{ v: 'linha', t: 'Linha' }, { v: 'goleiro', t: 'Goleiro' }] },
      { name: 'baseRating', label: 'Nota (0 a 10)', type: 'number', value: g.cfg.defaultRating, step: '0.5', min: 0, max: 10 }],
    onSubmit(v) { if (!v.name) return false; const p = newPlayer({ name: v.name, position: v.position, type: 'convidado', baseRating: v.baseRating ?? g.cfg.defaultRating }); mutate(() => { g.players.push(p); ev.rsvp[p.id] = { s: 'sim', at: Date.now() }; }); } });
  },
  shareList() { const { g, ev } = ctx(); shareText(listText(g, ev), g.name); },
  inviteLink() {
    const { g, ev } = ctx(); const link = inviteLink(g, ev);
    openSheet({ title: 'Link para confirmar presença', body: html`<p class="msg">Quem abrir o link escolhe o próprio nome e envia a confirmação pelo WhatsApp. Você só precisa tocar em “Vai” aqui no app.</p><p class="hint">Como os dados ficam no seu aparelho, a confirmação chega como mensagem e não altera a lista sozinha.</p><textarea readonly rows="3">${link}</textarea>`,
      foot: html`<button class="btn" data-act="copyInvite">Copiar</button><button class="btn primary" data-act="shareInvite">Enviar no WhatsApp</button>` });
    window.__invite = { link, text: `Confirme sua presença na pelada de ${fmtDateLong(ev.date)}, ${ev.time}:\n${link}` };
  },
  copyInvite() { copyText(window.__invite.link); },
  shareInvite() { shareText(window.__invite.text, g_name()); },
  async startEvent() {
    const { g, ev } = ctx(); const a = L.attendance(ev, g.players, g.cfg);
    if (a.total < 2 && !(await confirmBox('Menos de dois confirmados. Iniciar mesmo assim?', { ok: 'Iniciar' }))) return;
    mutate(() => { ev.status = 'aovivo'; }); go(`#/g/${g.id}/pelada/${ev.id}/chegada`);
  },
  arrive(el) { const { ev } = ctx(); mutate(() => { if (!ev.arrivals.includes(el.dataset.pid)) ev.arrivals.push(el.dataset.pid); if (!ev.rsvp[el.dataset.pid]) ev.rsvp[el.dataset.pid] = { s: 'sim', at: Date.now() }; }); },
  unarrive(el) { const { ev } = ctx(); mutate(() => { ev.arrivals = ev.arrivals.filter((id) => id !== el.dataset.pid); }); },
  async arriveOther() {
    const { g, ev } = ctx(); const a = L.attendance(ev, g.players, g.cfg); const conf = new Set([...a.gk.ok, ...a.line.ok].map((p) => p.id));
    const others = g.players.filter((p) => p.active !== false && !ev.arrivals.includes(p.id) && !conf.has(p.id));
    const id = await pickPlayer({ title: 'Quem chegou?', players: others, allowNone: '+ Novo convidado' });
    if (id === null) return;
    if (id === '') { actions_addGuestArrival(g, ev); return; }
    mutate(() => { ev.arrivals.push(id); ev.rsvp[id] = { s: 'sim', at: Date.now() }; });
  },
  drawOpt(el) { const { g, ev } = ctx(); mutate(() => { ev.drawOpts = { ...(ev.drawOpts || {}), [el.dataset.k]: el.dataset.k === 'mode' ? el.value : num(el.value) }; }, { silent: true }); },
  async draw() {
    const { g, ev } = ctx();
    if (ev.matches.length && !(await confirmBox('Já existem partidas registradas. Sortear de novo apaga os times atuais (as partidas jogadas continuam no histórico).', { ok: 'Sortear de novo' }))) return;
    const a = L.attendance(ev, g.players, g.cfg);
    const ids = ev.arrivals.length ? ev.arrivals : [...a.gk.ok, ...a.line.ok].map((p) => p.id);
    if (ids.length < 2) { toast('São necessários pelo menos 2 jogadores'); return; }
    const hist = g.events.filter((e) => e.id !== ev.id);
    const players = ids.map((id) => { const p = player(g, id); return { id, position: p.position, rating: L.effectiveRating(p, hist, g.cfg) }; });
    const o = drawOpts(g, ev); const r = L.drawTeams(players, { ...o, rnd: Math.random });
    mutate(() => {
      ev.teams = r.teams.map((t, i) => ({ id: uid(), name: L.TEAM_COLORS[i % L.TEAM_COLORS.length].name, color: i, players: t.ids }));
      ev.reserve = r.reserve; ev.court = [ev.teams[0].id, ev.teams[1].id]; ev.queue = ev.teams.slice(2).map((t) => t.id); ev.streak = {};
    });
    toast(`${ev.teams.length} times sorteados`);
  },
  court(el) { const { ev } = ctx(); const i = +el.dataset.i; mutate(() => { const c = [...ev.court]; const other = c[1 - i]; c[i] = el.value; if (c[0] === c[1]) c[1 - i] = ev.court[i]; ev.court = c; ev.queue = ev.teams.map((t) => t.id).filter((id) => !c.includes(id)); }); },
  movePlayer(el) {
    const { g, ev } = ctx(); const pid = el.dataset.pid;
    openSheet({ title: `Mover ${pname(g, pid)}`, body: html`<div class="pick">${ev.teams.map((t) => html`<button class="row-btn" data-act="doMove" data-pid="${pid}" data-to="${t.id}">${t.name}</button>`)}<button class="row-btn dim" data-act="doMove" data-pid="${pid}" data-to="reserva">Reserva</button></div>` });
  },
  doMove(el) {
    const { ev } = ctx(); const { pid, to } = el.dataset;
    mutate(() => { ev.teams.forEach((t) => { t.players = t.players.filter((id) => id !== pid); }); ev.reserve = ev.reserve.filter((id) => id !== pid); if (to === 'reserva') ev.reserve.push(pid); else ev.teams.find((t) => t.id === to).players.push(pid); });
    closeSheet();
  },
  shareTeams() {
    const { g, ev } = ctx();
    const t = `⚽ Times de ${fmtDate(ev.date)} — ${g.name}\n\n` + ev.teams.map((tm) => `👕 ${tm.name}\n${tm.players.map((id) => `• ${pname(g, id)}`).join('\n')}`).join('\n\n') + (ev.reserve.length ? `\n\n⏳ Reservas: ${ev.reserve.map((id) => pname(g, id)).join(', ')}` : '');
    shareText(t, g.name);
  },
  startMatch() {
    const { g, ev } = ctx(); const [a, b] = ev.court; const la = L.buildLineup(ev, a, fullSize(g)); const lb = L.buildLineup(ev, b, fullSize(g), la);
    const m = { id: uid(), a, b, lineup: { [a]: la, [b]: lb }, events: [], status: 'andamento', elapsed: 0, runningSince: Date.now(), limitMs: num(g.cfg.matchMinutes) * 60000, alerted: false, startedAt: Date.now() };
    mutate(() => ev.matches.push(m));
    try { beep(0); } catch (e) { /* prepara o áudio com o toque do usuário */ }
  },
  toggleTimer() { const { ev } = ctx(); const m = liveMatch(ev); mutate(() => { if (m.runningSince) { m.elapsed += Date.now() - m.runningSince; m.runningSince = null; } else m.runningSince = Date.now(); }); },
  async resetTimer() { const { ev } = ctx(); const m = liveMatch(ev); if (!(await confirmBox('Zerar o cronômetro desta partida? Os gols continuam.', { ok: 'Zerar' }))) return; mutate(() => { m.elapsed = 0; m.runningSince = null; m.alerted = false; }); },
  async goal(el) {
    const { g, ev } = ctx(); const m = liveMatch(ev); const tid = el.dataset.tid;
    const scorer = await pickPlayer({ title: `Gol do ${team(ev, tid).name}`, players: lineupLabel(g, ev, m, tid) }); if (!scorer) return;
    const assist = await pickPlayer({ title: 'Quem deu a assistência?', players: lineupLabel(g, ev, m, tid).filter((p) => p.id !== scorer), allowNone: 'Sem assistência' }); if (assist === null) return;
    mutate(() => m.events.push({ id: uid(), type: 'gol', teamId: tid, playerId: scorer, assistId: assist || null, t: L.elapsedOf(m) }));
    const s = L.score(m); const lim = num(g.cfg.goalLimit);
    if (lim > 0 && s[tid] >= lim) { beep(2); toast(`${team(ev, tid).name} chegou a ${lim} gols`); }
  },
  async stat(el) {
    const { g, ev } = ctx(); const m = liveMatch(ev); const type = el.dataset.type;
    const all = [m.a, m.b].flatMap((tid) => lineupLabel(g, ev, m, tid).map((p) => ({ ...p, tid })));
    const pid = await pickPlayer({ title: L.STAT_LABEL[type], players: all }); if (!pid) return;
    const tid = all.find((p) => p.id === pid).tid;
    mutate(() => m.events.push({ id: uid(), type, teamId: tid, playerId: pid, t: L.elapsedOf(m) }));
  },
  delEvent(el) { const { ev } = ctx(); const m = liveMatch(ev); mutate(() => { m.events = m.events.filter((e) => e.id !== el.dataset.eid); }); },
  async endMatch() {
    const { g, ev } = ctx(); const m = liveMatch(ev); const s = L.score(m);
    if (!(await confirmBox(`Encerrar a partida em ${team(ev, m.a).name} ${s[m.a]} x ${s[m.b]} ${team(ev, m.b).name}?`, { ok: 'Encerrar' }))) return;
    mutate(() => {
      if (m.runningSince) { m.elapsed += Date.now() - m.runningSince; m.runningSince = null; }
      m.status = 'encerrada'; m.endedAt = Date.now();
      const nxt = L.nextAfterMatch({ court: [m.a, m.b], queue: ev.queue, streak: ev.streak }, L.winnerOf(m), g.cfg);
      ev.court = nxt.court; ev.queue = nxt.queue; ev.streak = nxt.streak;
    });
    const w = L.winnerOf(m); toast(w ? `${team(ev, w).name} venceu` : 'Empate');
  },
  rate(el) {
    const { g, ev } = ctx(); const v = el.value === '' ? null : Math.min(10, Math.max(0, num(el.value)));
    mutate(() => { if (v == null) delete ev.ratings[el.dataset.pid]; else ev.ratings[el.dataset.pid] = v; }, { silent: true });
    const box = document.getElementById('hlbox'); if (box) box.innerHTML = hlBlock(g, ev).toString(); // atualiza só os destaques e mantém o foco na lista
  },
  shareHl() { const { g, ev } = ctx(); shareText(hlText(g, ev, L.highlights(ev, g.players)), g.name); },
  async shareHlImg() {
    const { g, ev } = ctx(); const hl = L.highlights(ev, g.players);
    const blob = await renderCard({ title: 'Destaques do dia', subtitle: `${g.name}, ${fmtDate(ev.date)}`, rows: hl.map((h) => ({ left: '★', name: `${h.title}: ${h.ids.map((id) => pname(g, id)).join(', ')}`, right: h.text, hot: h.key === 'craque' })), footer: 'Feito no Apito' });
    shareImage(blob, `destaques-${ev.date}.png`, 'Destaques do dia');
  },
  async finishEvent() {
    const { g, ev } = ctx(); if (liveMatch(ev)) { toast('Encerre a partida em andamento antes'); return; }
    const guests = presentIds(ev).map((id) => player(g, id)).filter((p) => p && p.type === 'convidado');
    const fee = num(g.cfg.guestFee);
    const ask = fee > 0 && guests.length ? ` Gerar a cobrança de ${brl(fee)} para ${guests.length} convidado(s)?` : '';
    if (!(await confirmBox(`Encerrar a pelada de ${fmtDate(ev.date)}?${ask}`, { ok: 'Encerrar' }))) return;
    mutate(() => {
      ev.status = 'encerrada';
      if (fee > 0) guests.forEach((p) => { const ref = `diaria:${ev.id}:${p.id}`; if (!g.fin.charges.some((c) => c.ref === ref)) g.fin.charges.push({ id: uid(), ref, playerId: p.id, amount: fee, desc: `Diária ${fmtDateShort(ev.date)}`, due: ev.date, status: 'open', createdAt: Date.now() }); });
    });
    toast('Pelada encerrada'); go(`#/g/${g.id}/pelada/${ev.id}/pos`);
  },
  async reopenEvent() { const { ev } = ctx(); mutate(() => { ev.status = 'aovivo'; }); toast('Pelada reaberta'); },
  async deleteEvent() {
    const { g, ev } = ctx(); if (!(await confirmBox('Excluir esta pelada e todas as partidas e notas dela? Esta ação não pode ser desfeita.', { ok: 'Excluir', danger: true }))) return;
    mutate(() => { g.events = g.events.filter((e) => e.id !== ev.id); }); go(`#/g/${g.id}/pelada`);
  },
});

function g_name() { return curGroup()?.name || 'Apito'; }
function actions_addGuestArrival(g, ev) {
  formSheet({ title: 'Novo convidado', submit: 'Adicionar', fields: [{ name: 'name', label: 'Nome', required: true }, { name: 'position', label: 'Posição', type: 'select', value: 'linha', options: [{ v: 'linha', t: 'Linha' }, { v: 'goleiro', t: 'Goleiro' }] }],
    onSubmit(v) { if (!v.name) return false; const p = newPlayer({ name: v.name, position: v.position, type: 'convidado', baseRating: g.cfg.defaultRating }); mutate(() => { g.players.push(p); ev.arrivals.push(p.id); ev.rsvp[p.id] = { s: 'sim', at: Date.now() }; }); } });
}
