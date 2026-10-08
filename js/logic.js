// Regras de negócio, sem DOM nem armazenamento: tudo aqui é testável em Node.
import { num, round1, toISO, fromISO, addDays, todayISO } from './util.js';

export const STAT_LABEL = { gol: 'Gol', assistencia: 'Assistência', desarme: 'Desarme', falha: 'Falha', defesa: 'Defesa difícil' };
export const TEAM_COLORS = [
  { name: 'Vermelho', c: '#d93a3a', t: '#ffffff' }, { name: 'Azul', c: '#2f6fed', t: '#ffffff' },
  { name: 'Amarelo', c: '#f2c200', t: '#1c2428' }, { name: 'Preto', c: '#22282b', t: '#ffffff' },
  { name: 'Branco', c: '#ffffff', t: '#1c2428' }, { name: 'Laranja', c: '#ee7a1a', t: '#1c2428' },
  { name: 'Roxo', c: '#7b4dd6', t: '#ffffff' }, { name: 'Rosa', c: '#e0559f', t: '#ffffff' },
];

const isGK = (p) => p.position === 'goleiro';

/* ------------------------------------------------------------------ nota */
// Nota usada no sorteio: nota-base do administrador mesclada com o histórico de avaliações (até 70% de peso)
export function effectiveRating(player, events, cfg = {}) {
  const base = num(player.baseRating, num(cfg.defaultRating, 6));
  const hist = [];
  [...events].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((ev) => {
    const r = ev.ratings && ev.ratings[player.id];
    if (typeof r === 'number') hist.push(r);
  });
  const last = hist.slice(-10);
  if (!last.length) return base;
  const avg = last.reduce((s, x) => s + x, 0) / last.length;
  const w = Math.min(0.7, last.length * 0.1);
  return base * (1 - w) + avg * w;
}

/* -------------------------------------------------------------- presença */
// Confirmados respeitando limites separados de goleiros e jogadores; o excedente entra na fila de espera.
// Mensalistas têm prioridade sobre convidados (opcional); dentro do mesmo grupo vale a ordem de confirmação.
export function attendance(ev, players, cfg) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const maxGK = num(ev.maxGK, num(cfg.maxGK, 3));
  const maxLine = num(ev.maxLine, num(cfg.maxLine, 15));
  const rsvp = ev.rsvp || {};
  const prio = (p) => (cfg.priorityMonthly !== false && p.type === 'mensalista' ? 0 : 1);
  const yes = Object.entries(rsvp).filter(([id, r]) => r.s === 'sim' && byId.has(id)).map(([id, r]) => ({ p: byId.get(id), at: r.at }));
  yes.sort((a, b) => prio(a.p) - prio(b.p) || a.at - b.at);
  const split = (list, max) => ({ ok: list.slice(0, max || Infinity).map((x) => x.p), wait: max ? list.slice(max).map((x) => x.p) : [] });
  const gk = split(yes.filter((x) => isGK(x.p)), maxGK);
  const line = split(yes.filter((x) => !isGK(x.p)), maxLine);
  const declined = Object.entries(rsvp).filter(([id, r]) => r.s === 'nao' && byId.has(id)).map(([id]) => byId.get(id));
  const answered = new Set(Object.keys(rsvp));
  const pending = players.filter((p) => p.active !== false && !answered.has(p.id));
  return { gk, line, declined, pending, maxGK, maxLine, total: gk.ok.length + line.ok.length };
}

/* ---------------------------------------------------------------- sorteio */
// Gerador pseudoaleatório com semente, para sorteios reproduzíveis nos testes
export function seeded(seed = 1) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function shuffle(arr, rnd) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/**
 * players: [{id, position, rating}] já na ordem de chegada.
 * Retorna { teams: [{ids:[...], sum}], reserve: [ids] }.
 * Goleiros são distribuídos primeiro; os jogadores de linha vão para o time de menor soma de notas,
 * e uma busca local de trocas reduz a diferença entre o melhor e o pior time. Quem chegou por último fica de reserva.
 */
export function drawTeams(players, o = {}) {
  const { linePerTeam = 5, gkPerTeam = 1, mode = 'balanced', rnd = Math.random } = o;
  const fullSize = Math.max(1, linePerTeam + gkPerTeam);
  const total = players.length;
  if (total < 2) return { teams: [], reserve: players.map((p) => p.id) };
  const numTeams = o.numTeams || Math.max(2, Math.floor(total / fullSize));
  const slots = numTeams * fullSize;
  const playing = Math.min(total, slots);

  // Quem joga: ordem de chegada, garantindo goleiros suficientes
  let subset = players.slice(0, playing);
  let rest = players.slice(playing);
  const needGK = Math.min(gkPerTeam * numTeams, players.filter(isGK).length);
  let haveGK = subset.filter(isGK).length;
  while (haveGK < needGK) {
    const inGK = rest.findIndex(isGK);
    let out = -1; for (let i = subset.length - 1; i >= 0; i--) if (!isGK(subset[i])) { out = i; break; }
    if (inGK < 0 || out < 0) break;
    const [g] = rest.splice(inGK, 1); const [l] = subset.splice(out, 1, g); rest.push(l); haveGK++;
  }

  // Capacidade de cada time
  const base = Math.floor(playing / numTeams); const extra = playing % numTeams;
  const cap = Array.from({ length: numTeams }, (_, i) => base + (i < extra ? 1 : 0));
  const teams = Array.from({ length: numTeams }, () => ({ ids: [], sum: 0, gks: 0 }));
  const put = (t, p) => { t.ids.push(p.id); t.sum += p.rating; if (isGK(p)) t.gks++; };

  const order = (list) => (mode === 'balanced' ? [...list].sort((a, b) => b.rating - a.rating || rnd() - 0.5) : mode === 'random' ? shuffle(list, rnd) : list);
  let gks = order(subset.filter(isGK));
  const slotGK = gkPerTeam * numTeams;
  let line = subset.filter((p) => !isGK(p));
  if (gks.length > slotGK) { line = line.concat(gks.slice(slotGK)); gks = gks.slice(0, slotGK); }
  // um goleiro por vez, em rodada, respeitando a capacidade
  gks.forEach((g, i) => { const t = teams[i % numTeams]; if (t.ids.length < cap[i % numTeams]) put(t, g); else line.push(g); });

  if (mode === 'balanced') {
    order(line).forEach((p) => {
      const open = teams.map((t, i) => ({ t, i })).filter(({ t, i }) => t.ids.length < cap[i]);
      open.sort((x, y) => x.t.sum - y.t.sum || x.t.ids.length - y.t.ids.length || rnd() - 0.5);
      put(open[0].t, p);
    });
    // trocas locais entre jogadores de linha
    const rating = new Map(subset.map((p) => [p.id, p.rating]));
    const gkIds = new Set(subset.filter(isGK).map((p) => p.id));
    const spread = () => Math.max(...teams.map((t) => t.sum)) - Math.min(...teams.map((t) => t.sum));
    for (let it = 0; it < 200; it++) {
      let best = null; const cur = spread();
      for (let a = 0; a < numTeams; a++) for (let b = a + 1; b < numTeams; b++) {
        teams[a].ids.forEach((ia, xa) => { if (gkIds.has(ia)) return;
          teams[b].ids.forEach((ib, xb) => { if (gkIds.has(ib)) return;
            const d = rating.get(ib) - rating.get(ia);
            teams[a].sum += d; teams[b].sum -= d;
            const s = spread();
            teams[a].sum -= d; teams[b].sum += d;
            if (s < cur - 1e-9 && (!best || s < best.s)) best = { a, b, xa, xb, s, d };
          }); });
      }
      if (!best) break;
      const { a, b, xa, xb, d } = best;
      const tmp = teams[a].ids[xa]; teams[a].ids[xa] = teams[b].ids[xb]; teams[b].ids[xb] = tmp;
      teams[a].sum += d; teams[b].sum -= d;
    }
  } else {
    // chegada ou aleatório: preenche time a time
    let ti = 0;
    (mode === 'random' ? order(line) : line).forEach((p) => {
      while (ti < numTeams && teams[ti].ids.length >= cap[ti]) ti++;
      if (ti < numTeams) put(teams[ti], p);
    });
  }
  return { teams: teams.map((t) => ({ ids: t.ids, sum: round1(t.sum) })), reserve: rest.map((p) => p.id) };
}

/* ----------------------------------------------------------------- rodízio */
// st = { court:[a,b], queue:[...], streak:{id:n} }. winnerId = null para empate.
export function nextAfterMatch(st, winnerId, cfg = {}) {
  const [a, b] = st.court; const queue = [...st.queue]; const streak = { ...st.streak };
  streak[a] = (streak[a] || 0) + 1; streak[b] = (streak[b] || 0) + 1;
  if (!queue.length) return { court: [a, b], queue, streak };
  const rotation = cfg.rotation || 'winner_stays';
  let leave; let single;
  if (winnerId == null) {
    const rule = cfg.drawRule || 'longest_leaves';
    single = rule === 'holder_leaves' ? [a] : rule === 'challenger_leaves' ? [b] : streak[a] > streak[b] ? [a] : [b];
    leave = rule === 'both_leave' ? [a, b] : single;
  } else {
    const loser = winnerId === a ? b : a;
    single = [loser]; leave = single;
    if (rotation === 'both_leave') leave = [loser, winnerId];
    else if (num(cfg.maxConsecutive) > 0 && streak[winnerId] >= num(cfg.maxConsecutive)) leave = [loser, winnerId];
  }
  if (leave.length > queue.length) leave = single.length <= queue.length ? single : leave.slice(0, queue.length);
  const stay = [a, b].filter((x) => !leave.includes(x));
  const entrants = queue.splice(0, 2 - stay.length);
  leave.forEach((x) => { queue.push(x); streak[x] = 0; });
  entrants.forEach((x) => { streak[x] = 0; });
  return { court: [...stay, ...entrants], queue, streak };
}

export const score = (m) => { const s = { [m.a]: 0, [m.b]: 0 }; (m.events || []).forEach((e) => { if (e.type === 'gol' && e.teamId in s) s[e.teamId]++; }); return s; };
export const winnerOf = (m) => { const s = score(m); return s[m.a] > s[m.b] ? m.a : s[m.b] > s[m.a] ? m.b : null; };
export const elapsedOf = (m, now = Date.now()) => (m.elapsed || 0) + (m.runningSince ? now - m.runningSince : 0);

export function matchesPlayed(ev, playerId) {
  return (ev.matches || []).filter((m) => Object.values(m.lineup || {}).some((ids) => ids.includes(playerId))).length;
}

// Escalação de um time para a partida: os jogadores do time, completados com a reserva de quem jogou menos
export function buildLineup(ev, teamId, fullSize, usedElsewhere = []) {
  const team = ev.teams.find((t) => t.id === teamId);
  const ids = [...team.players];
  const missing = Math.max(0, fullSize - ids.length);
  if (!missing) return ids;
  const order = new Map((ev.arrivals || []).map((id, i) => [id, i]));
  const pool = (ev.reserve || []).filter((id) => !ids.includes(id) && !usedElsewhere.includes(id))
    .sort((x, y) => matchesPlayed(ev, x) - matchesPlayed(ev, y) || (order.get(x) ?? 999) - (order.get(y) ?? 999));
  return ids.concat(pool.slice(0, missing));
}

/* ------------------------------------------------------------ estatísticas */
export function periodRange(period, ref = todayISO()) {
  const d = fromISO(ref); const y = d.getFullYear(); const m = d.getMonth();
  if (period === 'semana') { const wd = (d.getDay() + 6) % 7; const from = addDays(ref, -wd); return { from, to: addDays(from, 6) }; }
  if (period === 'mes') return { from: toISO(new Date(y, m, 1)), to: toISO(new Date(y, m + 1, 0)) };
  if (period === 'semestre') return m < 6 ? { from: `${y}-01-01`, to: `${y}-06-30` } : { from: `${y}-07-01`, to: `${y}-12-31` };
  if (period === 'ano') return { from: `${y}-01-01`, to: `${y}-12-31` };
  return { from: '0000-01-01', to: '9999-12-31' };
}
export function shiftRef(period, ref, dir) {
  const d = fromISO(ref);
  if (period === 'semana') return addDays(ref, 7 * dir);
  if (period === 'mes') return toISO(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  if (period === 'semestre') return toISO(new Date(d.getFullYear(), d.getMonth() + 6 * dir, 1));
  if (period === 'ano') return toISO(new Date(d.getFullYear() + dir, 0, 1));
  return ref;
}

const blank = (id) => ({ id, gols: 0, assist: 0, ga: 0, desarmes: 0, falhas: 0, defesas: 0, jogos: 0, v: 0, e: 0, d: 0, pontos: 0, presencas: 0, notaSoma: 0, notaN: 0, notaMedia: null, aproveit: null });

export function aggregate(events, range = { from: '0000-01-01', to: '9999-12-31' }, onlyEnded = true) {
  const map = new Map(); const get = (id) => { if (!map.has(id)) map.set(id, blank(id)); return map.get(id); };
  events.filter((ev) => ev.date >= range.from && ev.date <= range.to && (!onlyEnded || ev.status === 'encerrada')).forEach((ev) => {
    const present = new Set(ev.arrivals || []);
    (ev.matches || []).forEach((m) => {
      if (m.status !== 'encerrada') return;
      Object.values(m.lineup || {}).forEach((ids) => ids.forEach((id) => present.add(id)));
      const w = winnerOf(m);
      Object.entries(m.lineup || {}).forEach(([tid, ids]) => ids.forEach((id) => {
        const s = get(id); s.jogos++;
        if (w == null) { s.e++; s.pontos += 1; } else if (w === tid) { s.v++; s.pontos += 3; } else s.d++;
      }));
      (m.events || []).forEach((e) => {
        if (e.type === 'gol') { get(e.playerId).gols++; if (e.assistId) get(e.assistId).assist++; }
        else if (e.type === 'desarme') get(e.playerId).desarmes++;
        else if (e.type === 'falha') get(e.playerId).falhas++;
        else if (e.type === 'defesa') get(e.playerId).defesas++;
      });
    });
    present.forEach((id) => { get(id).presencas++; });
    Object.entries(ev.ratings || {}).forEach(([id, r]) => { if (typeof r === 'number') { const s = get(id); s.notaSoma += r; s.notaN++; } });
  });
  map.forEach((s) => {
    s.ga = s.gols + s.assist;
    s.notaMedia = s.notaN ? Math.round((s.notaSoma / s.notaN) * 10) / 10 : null;
    s.aproveit = s.jogos ? Math.round((s.pontos / (3 * s.jogos)) * 100) : null;
  });
  return map;
}

export const RANK_STATS = [
  { key: 'gols', label: 'Gols' }, { key: 'assist', label: 'Assistências' }, { key: 'ga', label: 'Participações em gols' },
  { key: 'desarmes', label: 'Desarmes' }, { key: 'defesas', label: 'Defesas difíceis' }, { key: 'falhas', label: 'Falhas' },
  { key: 'notaMedia', label: 'Nota média', min: (s) => s.notaN >= 2, fmt: (v) => v.toFixed(1).replace('.', ',') },
  { key: 'presencas', label: 'Presenças' }, { key: 'v', label: 'Vitórias' }, { key: 'pontos', label: 'Pontos' },
  { key: 'aproveit', label: 'Aproveitamento', min: (s) => s.jogos >= 3, fmt: (v) => `${v}%` },
];
export function ranking(stats, statKey, nameOf) {
  const def = RANK_STATS.find((r) => r.key === statKey) || RANK_STATS[0];
  return [...stats.values()].filter((s) => (def.min ? def.min(s) : true) && s[statKey] != null && s[statKey] > 0)
    .sort((a, b) => b[statKey] - a[statKey] || b.pontos - a.pontos || nameOf(a.id).localeCompare(nameOf(b.id), 'pt-BR'))
    .map((s, i) => ({ pos: i + 1, id: s.id, value: s[statKey], text: def.fmt ? def.fmt(s[statKey]) : String(s[statKey]), s }));
}

// Destaques do dia: craque, artilheiro, garçom, paredão, pereba e xerife
export function highlights(ev, players) {
  const st = aggregate([ev], undefined, false); const byId = new Map(players.map((p) => [p.id, p]));
  const list = [...st.values()].filter((s) => byId.has(s.id));
  const top = (arr, f, minVal = 1) => { const vals = arr.map(f); const m = Math.max(...vals); if (!arr.length || m < minVal) return []; return arr.filter((_, i) => vals[i] === m); };
  const rated = list.filter((s) => s.notaN > 0);
  const out = [];
  const add = (key, title, subtitle, arr, text) => { if (arr.length) out.push({ key, title, subtitle, ids: arr.map((s) => s.id), text: text(arr[0]) }); };
  let craque = top(rated, (s) => s.notaMedia, 0.1);
  if (craque.length > 1) craque = top(craque, (s) => s.ga, 0).length ? top(craque, (s) => s.ga, 0) : craque;
  add('craque', 'Craque', 'maior nota', craque, (s) => `nota ${s.notaMedia.toFixed(1).replace('.', ',')}`);
  add('artilheiro', 'Artilheiro', 'mais gols', top(list, (s) => s.gols), (s) => `${s.gols} gol${s.gols > 1 ? 's' : ''}`);
  add('garcom', 'Garçom', 'mais assistências', top(list, (s) => s.assist), (s) => `${s.assist} assistência${s.assist > 1 ? 's' : ''}`);
  add('paredao', 'Paredão', 'mais defesas difíceis', top(list, (s) => s.defesas), (s) => `${s.defesas} defesa${s.defesas > 1 ? 's' : ''}`);
  add('xerife', 'Xerife', 'mais desarmes', top(list, (s) => s.desarmes), (s) => `${s.desarmes} desarme${s.desarmes > 1 ? 's' : ''}`);
  let pereba = rated.length >= 3 ? (() => { const m = Math.min(...rated.map((s) => s.notaMedia)); const arr = rated.filter((s) => s.notaMedia === m); return arr; })() : [];
  if (pereba.length && craque.some((c) => pereba.some((p) => p.id === c.id))) pereba = [];
  if (!pereba.length) pereba = top(list, (s) => s.falhas);
  add('pereba', 'Pereba', rated.length >= 3 ? 'menor nota' : 'mais falhas', pereba, (s) => (rated.length >= 3 && s.notaN ? `nota ${s.notaMedia.toFixed(1).replace('.', ',')}` : `${s.falhas} falha${s.falhas > 1 ? 's' : ''}`));
  return out;
}

/* ------------------------------------------------------------------ finanças */
export const isOverdue = (c, today = todayISO()) => c.status === 'open' && c.due && c.due < today;

export function walletOf(fin, playerId) {
  const dep = fin.tx.filter((t) => t.playerId === playerId && t.cat === 'credito').reduce((s, t) => s + t.amount, 0);
  const used = fin.charges.filter((c) => c.playerId === playerId && c.status === 'paid' && c.paidWith === 'carteira').reduce((s, c) => s + c.amount, 0);
  return Math.round((dep - used) * 100) / 100;
}
export function financeSummary(fin, today = todayISO()) {
  const entradas = fin.tx.filter((t) => t.kind === 'in').reduce((s, t) => s + t.amount, 0);
  const saidas = fin.tx.filter((t) => t.kind === 'out').reduce((s, t) => s + t.amount, 0);
  const open = fin.charges.filter((c) => c.status === 'open');
  const late = open.filter((c) => isOverdue(c, today));
  const sum = (a) => a.reduce((s, c) => s + c.amount, 0);
  return { entradas, saidas, caixa: entradas - saidas, aReceber: sum(open) - sum(late), emAtraso: sum(late), qtdAtraso: new Set(late.map((c) => c.playerId)).size };
}
export function playerDebts(fin, playerId, today = todayISO()) {
  const open = fin.charges.filter((c) => c.playerId === playerId && c.status === 'open');
  const late = open.filter((c) => isOverdue(c, today));
  const sum = (a) => a.reduce((s, c) => s + c.amount, 0);
  return { open, late, totalOpen: sum(open), totalLate: sum(late) };
}

/* ----------------------------------------------------------------- churrasco */
// Divide o total entre quem vai, por peso; a diferença de centavos vai para os maiores restos
export function splitCost(total, parts) {
  const going = parts.filter((p) => p.going !== false);
  const cents = Math.round(total * 100); const wsum = going.reduce((s, p) => s + num(p.weight, 1), 0);
  if (!going.length || wsum <= 0) return [];
  const raw = going.map((p) => (cents * num(p.weight, 1)) / wsum);
  const base = raw.map(Math.floor); let rest = cents - base.reduce((s, x) => s + x, 0);
  raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((x, y) => y.f - x.f).forEach(({ i }) => { if (rest > 0) { base[i]++; rest--; } });
  return going.map((p, i) => ({ ...p, amount: base[i] / 100 }));
}
