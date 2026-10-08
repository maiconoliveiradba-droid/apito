// Inicialização: rotas, abas, delegação de eventos, instalação, lembretes e service worker
import { $, html, raw, esc, fmtDateLong, fmtDate, b64urlDecode, todayISO } from './util.js';
import { getState, subscribe, mutate, getGroup, newGroup, demoGroup } from './store.js';
import { route, setRoute, curGroup, actions, on, go } from './ui/ctx.js';
import { toast, formSheet } from './ui/common.js';
import { renderPelada, tick } from './ui/pelada.js';
import { renderPlayers } from './ui/players.js';
import { renderRankings } from './ui/rankings.js';
import { renderFinance } from './ui/finance.js';
import { renderMais } from './ui/more.js';

const ICON = {
  pelada: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/>',
  jogadores: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c3 0 5 2 5 5"/>',
  rankings: '<path d="M4 20v-8h5v8M9 20V5h6v15M15 20v-10h5v10"/>',
  caixa: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5v11M9.2 9.3c0-1.2 1.2-2 2.8-2s2.8.8 2.8 2-1.2 1.7-2.8 2-2.8.8-2.8 2 1.2 2 2.8 2 2.8-.8 2.8-2"/>',
  mais: '<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>',
};
const TABS = [['pelada', 'Pelada'], ['jogadores', 'Jogadores'], ['rankings', 'Rankings'], ['caixa', 'Caixa'], ['mais', 'Mais']];

function parse() {
  const seg = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (seg[0] === 'convite') return { name: 'convite', code: seg[1] };
  if (seg[0] === 'g' && seg[1]) {
    const tab = TABS.some((t) => t[0] === seg[2]) ? seg[2] : 'pelada'; const r = { name: 'group', gid: seg[1], tab };
    if (tab === 'pelada') { r.eid = seg[3]; r.stage = seg[4]; } if (tab === 'mais') { r.sub = seg[3]; r.id = seg[4]; }
    return r;
  }
  return { name: 'home' };
}

let lastKey = '';
function render() {
  setRoute(parse());
  const main = $('#main'); const top = $('#top-title'); const back = $('#back'); const tabs = $('#tabs');
  const key = location.hash; const sameRoute = key === lastKey; const y = window.scrollY; lastKey = key;
  let view; let title = 'Apito'; let g;
  if (route.name === 'convite') { title = 'Confirmar presença'; view = renderConvite(); back.hidden = true; tabs.hidden = true; }
  else if (route.name === 'group' && (g = getGroup(route.gid))) {
    title = g.name; back.hidden = false; back.href = '#/'; tabs.hidden = false;
    tabs.innerHTML = TABS.map(([k, t]) => `<a href="#/g/${g.id}/${k}" ${route.tab === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg><span>${t}</span></a>`).join('');
    view = { pelada: renderPelada, jogadores: renderPlayers, rankings: renderRankings, caixa: renderFinance, mais: renderMais }[route.tab](g);
  } else { if (route.name === 'group') { go('#/'); return; } back.hidden = true; tabs.hidden = true; view = renderHome(); }
  top.textContent = title; document.title = route.name === 'home' ? 'Apito' : `${title} · Apito`;
  main.innerHTML = view.toString();
  if (sameRoute) window.scrollTo(0, y); else { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
  document.querySelector('.stages a[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

/* -------------------------------------------------------------- tela inicial */
function renderHome() {
  const groups = getState().groups;
  return html`
    <section class="hero"><h1>Organize a pelada do início ao fim</h1><p>Lista de presença com fila de espera, sorteio equilibrado, placar ao vivo, rankings e caixa do grupo.</p></section>
    ${groups.length ? html`<ul class="list groups">${groups.map((g) => html`<li><a class="row" href="#/g/${g.id}/pelada"><span class="pn"><b>${g.name}</b> <small>${g.players.length} jogadores, ${g.events.filter((e) => e.status === 'encerrada').length} jogos</small></span></a></li>`)}</ul>` : ''}
    <section class="actions"><button class="btn primary big" data-act="newGroup">Criar grupo</button>${groups.length ? '' : html`<button class="btn" data-act="loadDemo">Ver com um grupo de exemplo</button>`}<button class="btn" data-act="importFile">Importar backup</button></section>
    <p class="foot">Seus dados ficam guardados neste aparelho. Para trocar de celular, exporte um backup em Mais.</p>`;
}
on({
  newGroup() { formSheet({ title: 'Novo grupo', submit: 'Criar grupo', fields: [{ name: 'name', label: 'Nome do grupo', required: true, placeholder: 'Pelada de quinta' }], onSubmit(v) { if (!v.name) return false; const g = newGroup(v.name); mutate((s) => s.groups.push(g)); go(`#/g/${g.id}/jogadores`); toast('Grupo criado. Cadastre os jogadores.'); } }); },
  loadDemo() { const g = demoGroup(); mutate((s) => s.groups.push(g)); go(`#/g/${g.id}/pelada`); },
});

/* ------------------------------------------------------ convite (sem servidor) */
function renderConvite() {
  let d; try { d = b64urlDecode(route.code); if (!d.g || !d.d) throw new Error(); } catch (e) { return html`<section class="empty"><h2>Link inválido</h2><p>Peça um novo link para quem organiza a pelada.</p></section>`; }
  return html`<section class="evhead"><div><h2>${d.g}</h2><p>${fmtDateLong(d.d)}, ${d.t}${d.l ? `, ${d.l}` : ''}</p></div></section>
    <section class="block"><h3>Quem é você?</h3>
      <div class="form"><div class="field"><label>Seu nome<select id="inv-name"><option value="">Escolha na lista</option>${(d.p || []).map((n) => html`<option>${n}</option>`)}<option value="__outro">Outro nome...</option></select></label></div>
      <div class="field" id="inv-other" hidden><label>Digite seu nome<input id="inv-other-name" type="text" autocomplete="name"></label></div></div>
      <section class="actions"><button class="btn primary big" data-act="inviteReply" data-r="sim">Vou jogar</button><button class="btn" data-act="inviteReply" data-r="nao">Não vou</button></section>
      <p class="hint">A resposta abre o WhatsApp com a mensagem pronta para quem organiza. É só enviar.</p></section>`;
}
on({
  inviteReply(el) {
    const d = b64urlDecode(route.code); const sel = $('#inv-name').value; const name = sel === '__outro' ? $('#inv-other-name').value.trim() : sel;
    if (!name) { toast('Escolha ou digite seu nome'); return; }
    const txt = el.dataset.r === 'sim' ? `✅ ${name} confirma presença na pelada de ${fmtDate(d.d)} (${d.g}).` : `❌ ${name} não vai na pelada de ${fmtDate(d.d)} (${d.g}).`;
    window.open(`https://wa.me/${String(d.w || '').replace(/\D/g, '')}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
  },
});
document.addEventListener('change', (e) => { if (e.target.id === 'inv-name') $('#inv-other').hidden = e.target.value !== '__outro'; });

/* ------------------------------------------------------ delegação de eventos */
function dispatch(attr, el, ev) {
  const name = el.dataset[attr]; const fn = actions[name];
  if (!fn) return;
  try { const r = fn(el, ev); if (r && r.catch) r.catch(fail); } catch (e) { fail(e); }
}
function fail(e) { console.error(e); toast('Algo deu errado. Tente de novo.'); }
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (el && !el.disabled) { if (el.tagName === 'A') e.preventDefault(); dispatch('act', el, e); } });
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el) dispatch('change', el, e); });
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el) dispatch('input', el, e); });
// atalho: em formulários dentro do sheet, Enter no campo único já envia; nada extra necessário

/* ------------------------------------------------------------ lembretes locais */
async function notify(title, body) {
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) { await reg.showNotification(title, { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png', tag: 'apito-lembrete' }); return; } } catch (e) { /* cai para o construtor */ }
  try { new Notification(title, { body }); } catch (e) { /* sem notificação */ }
}
export function checkReminders() {
  const s = getState(); if (!s.prefs.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  s.groups.forEach((g) => g.events.forEach((ev) => {
    if (ev.status !== 'agendada' || ev.notified) return;
    const when = new Date(`${ev.date}T${ev.time || '20:00'}`).getTime();
    if (now >= when - s.prefs.reminderHours * 3600e3 && now < when + 2 * 3600e3) { mutate(() => { ev.notified = true; }, { silent: true }); notify(`Pelada ${ev.date === todayISO() ? 'hoje' : 'em breve'}: ${g.name}`, `${fmtDateLong(ev.date)}, ${ev.time}${ev.location ? `, ${ev.location}` : ''}`); }
  }));
}

/* ------------------------------------------------------------ PWA: instalar e atualizar */
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__installEvt = e; if (route.name === 'group' && route.tab === 'mais') render(); });
window.addEventListener('appinstalled', () => { window.__installEvt = null; toast('App instalado'); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      let wantReload = false; // só recarrega quando a pessoa aceita a atualização (na primeira instalação não há o que recarregar)
      const offer = (w) => { const b = $('#update'); b.hidden = false; b.querySelector('button').onclick = () => { wantReload = true; w.postMessage('skip'); }; };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => { const w = reg.installing; w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); }); });
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantReload) location.reload(); });
    } catch (e) { console.warn('Service worker indisponível', e); }
  });
}

/* ------------------------------------------------------------------- partida */
window.addEventListener('hashchange', render);
subscribe(render);
render();
setInterval(tick, 1000);
setInterval(checkReminders, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); tick(); } });
checkReminders();
