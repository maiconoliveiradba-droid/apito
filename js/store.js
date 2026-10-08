// Estado do app, salvo no próprio aparelho (localStorage). Nada sai do dispositivo.
import { uid, todayISO, nextWeekday } from './util.js';

const KEY = 'apito.v1';
export const defaultCfg = () => ({
  linePerTeam: 5, gkPerTeam: 1, matchMinutes: 10, goalLimit: 0,
  maxLine: 15, maxGK: 3, priorityMonthly: true,
  drawMode: 'balanced', rotation: 'winner_stays', drawRule: 'longest_leaves', maxConsecutive: 2,
  defaultRating: 6, weekday: 4, time: '20:00', location: '',
  monthlyFee: 0, guestFee: 0, dueDay: 10, adminPhone: '',
});

const blank = () => ({ v: 1, groups: [], prefs: { notify: false, reminderHours: 3 } });
let state = read();
const subs = new Set();

function read() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1 && Array.isArray(s.groups)) return s; } catch (e) { /* dados corrompidos: começa vazio */ }
  return blank();
}
export const getState = () => state;
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { console.warn('Falha ao salvar', e); return false; } }
export function mutate(fn, { silent = false } = {}) { fn(state); save(); if (!silent) subs.forEach((f) => f()); }
export function replaceState(s) { state = s; save(); subs.forEach((f) => f()); }

export const getGroup = (id) => state.groups.find((g) => g.id === id);
export function newGroup(name) {
  return { id: uid(), name, createdAt: Date.now(), cfg: defaultCfg(), players: [], events: [], fin: { tx: [], charges: [] }, churrascos: [] };
}
export function newPlayer(o = {}) {
  return { id: uid(), name: '', position: 'linha', type: 'mensalista', baseRating: 6, phone: '', active: true, createdAt: Date.now(), ...o };
}
export function newEvent(g, o = {}) {
  const date = o.date || nextWeekday(g.cfg.weekday);
  return {
    id: uid(), date, time: g.cfg.time, location: g.cfg.location, maxLine: g.cfg.maxLine, maxGK: g.cfg.maxGK, status: 'agendada',
    rsvp: {}, arrivals: [], teams: [], reserve: [], court: null, queue: [], streak: {}, matches: [], ratings: {}, notes: '', createdAt: Date.now(), ...o,
  };
}

// Grupo de exemplo para conhecer o app sem digitar nada
export function demoGroup() {
  const g = newGroup('Pelada de quinta (exemplo)');
  g.cfg.monthlyFee = 60; g.cfg.guestFee = 20; g.cfg.location = 'Quadra do bairro';
  const names = ['Rafa', 'Bruno', 'Léo', 'Diego', 'Thiago', 'Marcelo', 'Caio', 'Gui', 'Pedro', 'Vitor', 'Lucas', 'André', 'Fabinho', 'Renan'];
  names.forEach((n, i) => g.players.push(newPlayer({ name: n, baseRating: [8, 6, 7, 5, 9, 6, 7, 4, 8, 5, 6, 7, 5, 6][i], type: i < 11 ? 'mensalista' : 'convidado' })));
  ['Jorginho', 'Cássio', 'Neto'].forEach((n, i) => g.players.push(newPlayer({ name: n, position: 'goleiro', baseRating: [7, 6, 5][i] })));
  const ev = newEvent(g, { date: todayISO() });
  g.players.forEach((p, i) => { if (i % 5 !== 4) ev.rsvp[p.id] = { s: 'sim', at: Date.now() + i }; });
  g.events.push(ev);
  return g;
}
