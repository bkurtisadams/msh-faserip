import assert from 'node:assert/strict';

globalThis.foundry = { applications: { api: {} }, utils: {} };
globalThis.game = {};
globalThis.Hooks = { on() {}, once() {} };
const { KarmaSheet } = await import('../scripts/karma.js');

const mk = (realDate, timestamp, d) => ({ realDate, timestamp, description: d });
const saved = [
  mk('11/12/2026', '2026-11-12T20:00:00Z', 'evening'),
  mk('11/10/2026', '2026-11-10T09:00:00Z', 'two days ago'),
  mk('11/12/2026', '2026-11-12T08:00:00Z', 'morning'),
];
const names = list => list.map(e => e.description);

assert.deepEqual(names(KarmaSheet.sortHistory([...saved], true)), ['evening', 'morning', 'two days ago'], 'newest first within and across days');
assert.deepEqual(names(KarmaSheet.sortHistory([...saved], false)), ['two days ago', 'morning', 'evening']);

const same = [mk('11/12/2026', '2026-11-12T10:00:00Z', 'first'), mk('11/12/2026', '2026-11-12T10:00:00Z', 'second')];
assert.deepEqual(names(KarmaSheet.sortHistory([...same], true)), ['second', 'first'], 'same time: later save is newer');

const shown = KarmaSheet.sortHistory(saved.map(e => ({ ...e })), true);
const [moved] = shown.splice(1, 1);
shown.splice(0, 0, moved);
KarmaSheet._restampDay(shown, '11/12/2026', true);
assert.deepEqual(names(KarmaSheet.sortHistory([...shown], true)), ['morning', 'evening', 'two days ago'], 'a drag within a day survives re-sorting');

console.log('karma history sort tests passed');
