// Contexto compartilhado entre as telas: rota atual, grupo atual e registro de ações (data-act)
import { getGroup } from '../store.js';
export const route = { name: 'home' };
export const setRoute = (r) => { Object.keys(route).forEach((k) => delete route[k]); Object.assign(route, r); };
export const curGroup = () => getGroup(route.gid);
export const curEvent = (g = curGroup()) => (g ? g.events.find((e) => e.id === route.eid) : null);
export const actions = {};
export const on = (map) => Object.assign(actions, map);
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
export const pname = (g, id) => g.players.find((p) => p.id === id)?.name ?? '—';
export const player = (g, id) => g.players.find((p) => p.id === id);
