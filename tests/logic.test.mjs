import assert from 'node:assert/strict';
import * as L from '../js/logic.js';

let n = 0; const t = (name, fn) => { try { fn(); n++; console.log('ok  -', name); } catch (e) { console.error('FALHA -', name, '\n', e.message); process.exitCode = 1; } };
const P = (id, position, rating) => ({ id, position, rating });

t('sorteio equilibrado: times completos, 1 goleiro por time e soma das notas próxima', () => {
  const players = [
    P('g1', 'goleiro', 8), P('g2', 'goleiro', 5), P('g3', 'goleiro', 6),
    ...Array.from({ length: 15 }, (_, i) => P('p' + i, 'linha', 9 - (i % 9) * 0.8)),
  ];
  const r = L.drawTeams(players, { linePerTeam: 5, gkPerTeam: 1, mode: 'balanced', rnd: L.seeded(7) });
  assert.equal(r.teams.length, 3);
  r.teams.forEach((tm) => { assert.equal(tm.ids.length, 6); assert.equal(tm.ids.filter((id) => id.startsWith('g')).length, 1); });
  const sums = r.teams.map((x) => x.sum); assert.ok(Math.max(...sums) - Math.min(...sums) <= 2, 'diferença ' + sums);
  assert.equal(r.reserve.length, 0);
  const all = r.teams.flatMap((x) => x.ids); assert.equal(new Set(all).size, 18);
});

t('sorteio: sobra vai para reserva (últimos a chegar) e goleiro entra mesmo chegando tarde', () => {
  const players = [...Array.from({ length: 11 }, (_, i) => P('p' + i, 'linha', 6)), P('g1', 'goleiro', 6), P('g2', 'goleiro', 6)];
  const r = L.drawTeams(players, { linePerTeam: 4, gkPerTeam: 1, mode: 'balanced', rnd: L.seeded(3) });
  assert.equal(r.teams.length, 2); // 13 / 5 = 2 times
  assert.equal(r.teams.flatMap((x) => x.ids).length, 10);
  assert.equal(r.reserve.length, 3);
  r.teams.forEach((tm) => assert.equal(tm.ids.filter((id) => id.startsWith('g')).length, 1));
});

t('sorteio por chegada preenche em ordem', () => {
  const players = Array.from({ length: 8 }, (_, i) => P('p' + i, 'linha', 5));
  const r = L.drawTeams(players, { linePerTeam: 4, gkPerTeam: 0, mode: 'arrival' });
  assert.deepEqual(r.teams[0].ids, ['p0', 'p1', 'p2', 'p3']); assert.deepEqual(r.teams[1].ids, ['p4', 'p5', 'p6', 'p7']);
});

t('sorteio com poucos jogadores forma 2 times desiguais', () => {
  const players = Array.from({ length: 7 }, (_, i) => P('p' + i, 'linha', 5));
  const r = L.drawTeams(players, { linePerTeam: 5, gkPerTeam: 0, mode: 'balanced', rnd: L.seeded(1) });
  assert.deepEqual(r.teams.map((x) => x.ids.length).sort(), [3, 4]);
});

t('rodízio: vencedor fica, perdedor vai para o fim da fila', () => {
  const r = L.nextAfterMatch({ court: ['A', 'B'], queue: ['C', 'D'], streak: {} }, 'A', { maxConsecutive: 0 });
  assert.deepEqual(r.court, ['A', 'C']); assert.deepEqual(r.queue, ['D', 'B']); assert.equal(r.streak.A, 1);
});

t('rodízio: empate, sai quem está há mais tempo; em igualdade sai o desafiante', () => {
  let r = L.nextAfterMatch({ court: ['A', 'B'], queue: ['C'], streak: { A: 2, B: 0 } }, null, {});
  assert.deepEqual(r.court, ['B', 'C']); assert.deepEqual(r.queue, ['A']);
  r = L.nextAfterMatch({ court: ['A', 'B'], queue: ['C'], streak: {} }, null, {});
  assert.deepEqual(r.court, ['A', 'C']);
});

t('rodízio: limite de partidas seguidas tira o vencedor também', () => {
  const r = L.nextAfterMatch({ court: ['A', 'B'], queue: ['C', 'D'], streak: { A: 1 } }, 'A', { maxConsecutive: 2 });
  assert.deepEqual(r.court, ['C', 'D']); assert.deepEqual(r.queue, ['B', 'A']);
});

t('rodízio: com 3 times o limite não tira o vencedor', () => {
  const r = L.nextAfterMatch({ court: ['A', 'B'], queue: ['C'], streak: { A: 5 } }, 'A', { maxConsecutive: 2 });
  assert.deepEqual(r.court, ['A', 'C']);
});

t('rodízio: com 2 times nada muda', () => {
  const r = L.nextAfterMatch({ court: ['A', 'B'], queue: [], streak: {} }, 'A', {});
  assert.deepEqual(r.court, ['A', 'B']);
});

t('rodízio: todos saem', () => {
  const r = L.nextAfterMatch({ court: ['A', 'B'], queue: ['C', 'D'], streak: {} }, 'A', { rotation: 'both_leave' });
  assert.deepEqual(r.court, ['C', 'D']); assert.deepEqual(r.queue, ['B', 'A']);
});

const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, position: id === 'd' ? 'goleiro' : 'linha' }));
const ev = {
  id: 'e1', date: '2026-10-05', status: 'encerrada', arrivals: ['a', 'b', 'c', 'd'], ratings: { a: 8, b: 6, c: 4, d: 7 },
  matches: [
    { id: 'm1', a: 'T1', b: 'T2', status: 'encerrada', lineup: { T1: ['a', 'd'], T2: ['b', 'c'] }, events: [
      { type: 'gol', teamId: 'T1', playerId: 'a', assistId: 'd' }, { type: 'gol', teamId: 'T1', playerId: 'a' }, { type: 'gol', teamId: 'T2', playerId: 'b' },
      { type: 'defesa', playerId: 'd' }, { type: 'desarme', playerId: 'c' }, { type: 'falha', playerId: 'c' }] },
    { id: 'm2', a: 'T1', b: 'T2', status: 'encerrada', lineup: { T1: ['a', 'd'], T2: ['b', 'c'] }, events: [{ type: 'gol', teamId: 'T2', playerId: 'c' }, { type: 'gol', teamId: 'T1', playerId: 'a' }] },
  ],
};
t('estatísticas: gols, assistências, jogos, pontos e nota média', () => {
  const s = L.aggregate([ev]);
  assert.equal(s.get('a').gols, 3); assert.equal(s.get('d').assist, 1); assert.equal(s.get('a').jogos, 2);
  assert.equal(s.get('a').pontos, 4); // vitória + empate
  assert.equal(s.get('b').pontos, 1); assert.equal(s.get('c').notaMedia, 4); assert.equal(s.get('a').presencas, 1);
});
t('destaques do dia', () => {
  const h = Object.fromEntries(L.highlights(ev, players).map((x) => [x.key, x.ids]));
  assert.deepEqual(h.craque, ['a']); assert.deepEqual(h.artilheiro, ['a']); assert.deepEqual(h.garcom, ['d']);
  assert.deepEqual(h.paredao, ['d']); assert.deepEqual(h.xerife, ['c']); assert.deepEqual(h.pereba, ['c']);
});
t('ranking por período e ordenação', () => {
  const ev2 = { ...ev, id: 'e2', date: '2026-09-01' };
  const inRange = L.aggregate([ev, ev2], L.periodRange('semana', '2026-10-07'));
  assert.equal(inRange.get('a').gols, 3);
  const all = L.ranking(L.aggregate([ev, ev2]), 'gols', (id) => id);
  assert.equal(all[0].id, 'a'); assert.equal(all[0].value, 6); assert.equal(all[0].pos, 1);
});
t('intervalos de período', () => {
  assert.deepEqual(L.periodRange('semana', '2026-10-07'), { from: '2026-10-05', to: '2026-10-11' });
  assert.deepEqual(L.periodRange('mes', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(L.periodRange('semestre', '2026-08-01'), { from: '2026-07-01', to: '2026-12-31' });
  assert.equal(L.shiftRef('mes', '2026-01-15', -1), '2025-12-01');
});

t('presença: limites separados, fila de espera e prioridade de mensalista', () => {
  const pl = [
    { id: 'g1', position: 'goleiro', type: 'mensalista' }, { id: 'g2', position: 'goleiro', type: 'mensalista' },
    { id: 'm1', position: 'linha', type: 'mensalista' }, { id: 'c1', position: 'linha', type: 'convidado' }, { id: 'm2', position: 'linha', type: 'mensalista' },
  ];
  const e = { rsvp: { c1: { s: 'sim', at: 1 }, m1: { s: 'sim', at: 2 }, m2: { s: 'sim', at: 3 }, g1: { s: 'sim', at: 4 }, g2: { s: 'sim', at: 5 } }, maxGK: 1, maxLine: 2 };
  const a = L.attendance(e, pl, { priorityMonthly: true });
  assert.deepEqual(a.line.ok.map((p) => p.id), ['m1', 'm2']); assert.deepEqual(a.line.wait.map((p) => p.id), ['c1']);
  assert.deepEqual(a.gk.ok.map((p) => p.id), ['g1']); assert.deepEqual(a.gk.wait.map((p) => p.id), ['g2']);
  e.rsvp.m1 = { s: 'nao', at: 9 }; // desistência promove quem estava na espera
  const b = L.attendance(e, pl, { priorityMonthly: true });
  assert.deepEqual(b.line.ok.map((p) => p.id), ['m2', 'c1']); assert.equal(b.line.wait.length, 0);
});

t('escalação completa o time com a reserva de quem jogou menos', () => {
  const e = { arrivals: ['x', 'y', 'z'], teams: [{ id: 'T1', players: ['a'] }], reserve: ['x', 'y', 'z'],
    matches: [{ lineup: { T9: ['x'] } }, { lineup: { T9: ['x', 'y'] } }] };
  assert.deepEqual(L.buildLineup(e, 'T1', 3), ['a', 'z', 'y']);
});

t('finanças: carteira, cobranças em atraso sem abater da carteira e caixa', () => {
  const fin = { tx: [
    { kind: 'in', cat: 'credito', amount: 100, playerId: 'p1' }, { kind: 'in', cat: 'mensalidade', amount: 50, playerId: 'p2' }, { kind: 'out', cat: 'quadra', amount: 120 }],
  charges: [
    { id: 'c1', playerId: 'p1', amount: 30, status: 'paid', paidWith: 'carteira', due: '2026-09-10' },
    { id: 'c2', playerId: 'p1', amount: 40, status: 'open', due: '2026-09-10' },
    { id: 'c3', playerId: 'p2', amount: 25, status: 'open', due: '2026-12-10' }] };
  assert.equal(L.walletOf(fin, 'p1'), 70); // atraso não mexe na carteira
  const s = L.financeSummary(fin, '2026-10-07');
  assert.equal(s.caixa, 30); assert.equal(s.emAtraso, 40); assert.equal(s.aReceber, 25); assert.equal(s.qtdAtraso, 1);
  assert.equal(L.playerDebts(fin, 'p1', '2026-10-07').totalLate, 40);
});

t('churrasco: divisão fecha o total ao centavo e respeita pesos', () => {
  const r = L.splitCost(100, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(r.reduce((s, x) => s + x.amount, 0), 100); assert.deepEqual(r.map((x) => x.amount).sort(), [33.33, 33.33, 33.34]);
  const w = L.splitCost(90, [{ id: 1, weight: 1 }, { id: 2, weight: 0.5 }, { id: 3, going: false }]);
  assert.deepEqual(w.map((x) => x.amount), [60, 30]);
});
console.log(`\n${n} testes passaram`);
