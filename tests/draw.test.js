// node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/draw.js');

const S = (o) => Object.assign({ teamCount: 2, mode: 'random', humanKeeper: true, defenseOpen: false }, o || {});
const P = (n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ id: 'p' + i, name: 'Oyuncu ' + (i + 1), lockTeam: null, lockPos: null }, (extra && extra[i]) || {}));
const group = (slot) => (slot === D.BENCH ? 'bench' : D.SLOT_BY_ID[slot].group);
const teamMembers = (pl, t) => Object.keys(pl).filter((id) => pl[id].team === t);

function checkInvariants(players, settings, pl) {
  const T = settings.teamCount;
  const sizes = Array(T).fill(0);
  players.forEach((p) => { assert.ok(pl[p.id], 'herkes yerleşmeli'); sizes[pl[p.id].team]++; });
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'takımlar dengeli');
  for (let t = 0; t < T; t++) {
    const slots = teamMembers(pl, t).map((id) => pl[id].slot).filter((s) => s !== D.BENCH);
    assert.equal(new Set(slots).size, slots.length, 'aynı slot iki kez kullanılmaz');
    if (!settings.humanKeeper) assert.ok(!slots.includes('KL'), 'kaleci kapalıyken KL yok');
  }
  players.forEach((p) => {
    if (p.lockTeam != null) assert.equal(pl[p.id].team, p.lockTeam, 'takım sabiti');
    if (p.lockPos) assert.equal(D.SLOT_BY_ID[pl[p.id].slot].code, p.lockPos, 'mevki sabiti');
  });
  return sizes;
}

test('12 kişi, 2 takım, defans kapalı: herkes ön grupta', () => {
  const players = P(12), settings = S();
  for (let i = 0; i < 200; i++) {
    const pl = D.solve(players, settings);
    const sizes = checkInvariants(players, settings, pl);
    assert.deepEqual(sizes, [6, 6]);
    Object.values(pl).forEach((x) => assert.equal(group(x.slot), 'front'));
  }
});

test('12 kişi, defans açık: zamanla arka slotlar da çıkar', () => {
  const players = P(12), settings = S({ defenseOpen: true });
  const groups = new Set();
  for (let i = 0; i < 300; i++) {
    const pl = D.solve(players, settings);
    checkInvariants(players, settings, pl);
    Object.values(pl).forEach((x) => groups.add(group(x.slot)));
  }
  assert.ok(groups.has('def') && groups.has('gk') && groups.has('front'));
});

test('16 kişi (8-8): 6 ön + KL + 1 defans', () => {
  const players = P(16), settings = S();
  for (let i = 0; i < 200; i++) {
    const pl = D.solve(players, settings);
    checkInvariants(players, settings, pl);
    for (let t = 0; t < 2; t++) {
      const g = teamMembers(pl, t).map((id) => group(pl[id].slot));
      assert.equal(g.filter((x) => x === 'front').length, 6);
      assert.equal(g.filter((x) => x === 'gk').length, 1);
      assert.equal(g.filter((x) => x === 'def').length, 1);
    }
  }
});

test('kaleci kapalı, 8-8: 6 ön + 2 defans', () => {
  const players = P(16), settings = S({ humanKeeper: false });
  const pl = D.solve(players, settings);
  checkInvariants(players, settings, pl);
  for (let t = 0; t < 2; t++) {
    const g = teamMembers(pl, t).map((id) => group(pl[id].slot));
    assert.equal(g.filter((x) => x === 'front').length, 6);
    assert.equal(g.filter((x) => x === 'def').length, 2);
  }
});

test('13 kişi (7-6), defans kapalı: 7 kişilik takımda KL dolu, 6 kişilikte sadece ön', () => {
  const players = P(13), settings = S();
  for (let i = 0; i < 100; i++) {
    const pl = D.solve(players, settings);
    const sizes = checkInvariants(players, settings, pl);
    const big = sizes[0] === 7 ? 0 : 1;
    const small = 1 - big;
    assert.ok(teamMembers(pl, big).some((id) => pl[id].slot === 'KL'));
    teamMembers(pl, small).forEach((id) => assert.equal(group(pl[id].slot), 'front'));
  }
});

test('25 kişi, 2 takım: fazlalar listede sonda kalanlardan yedek olur', () => {
  const players = P(25), settings = S();
  const pl = D.solve(players, settings);
  const sizes = checkInvariants(players, settings, pl);
  assert.deepEqual(sizes.slice().sort(), [12, 13]);
  for (let t = 0; t < 2; t++) {
    const ids = players.filter((p) => pl[p.id].team === t).map((p) => p.id);
    const bench = ids.filter((id) => pl[id].slot === D.BENCH);
    assert.equal(bench.length, ids.length - 11);
    assert.deepEqual(bench, ids.slice(ids.length - bench.length));
  }
});

test('sırayla mod: 1→T1, 2→T2, 3→T1 ...', () => {
  const players = P(7), settings = S({ mode: 'sequential' });
  const pl = D.solve(players, settings);
  checkInvariants(players, settings, pl);
  assert.deepEqual(players.map((p) => pl[p.id].team), [0, 1, 0, 1, 0, 1, 0]);
});

test('sırayla mod + takım sabiti: dolu takım atlanır', () => {
  const players = P(6, { 0: { lockTeam: 1 }, 1: { lockTeam: 1 } });
  const settings = S({ mode: 'sequential', teamCount: 2 });
  const pl = D.solve(players, settings);
  checkInvariants(players, settings, pl);
  assert.deepEqual(players.map((p) => pl[p.id].team), [1, 1, 0, 1, 0, 0]);
});

test('sabitler: takım, mevki ve ikisi birden', () => {
  const players = P(14, { 0: { lockTeam: 1 }, 1: { lockPos: 'SNT' }, 2: { lockTeam: 0, lockPos: 'STP' }, 3: { lockPos: 'KL' } });
  const settings = S();
  for (let i = 0; i < 200; i++) checkInvariants(players, settings, D.solve(players, settings));
});

test('mevki sabiti defans kapalıyken de geçerli', () => {
  const players = P(12, { 4: { lockPos: 'STP' } });
  const settings = S();
  for (let i = 0; i < 50; i++) {
    const pl = D.solve(players, settings);
    checkInvariants(players, settings, pl);
    assert.equal(D.SLOT_BY_ID[pl.p4.slot].code, 'STP');
  }
});

test('doğrulama hataları', () => {
  const T2 = S();
  assert.ok(D.validate(P(1), T2).errors.length);
  let v = D.validate(P(4, { 0: { lockTeam: 0 }, 1: { lockTeam: 0 }, 2: { lockTeam: 0 } }), T2);
  assert.ok(Object.keys(v.rowErrors).length === 3);
  v = D.validate(P(6, { 0: { lockTeam: 0, lockPos: 'SNT' }, 1: { lockTeam: 0, lockPos: 'SNT' } }), T2);
  assert.ok(v.rowErrors.p0 && v.rowErrors.p1);
  v = D.validate(P(6, { 0: { lockPos: 'KL' } }), S({ humanKeeper: false }));
  assert.ok(v.rowErrors.p0);
  v = D.validate(P(8, { 0: { lockPos: 'SNT' }, 1: { lockPos: 'SNT' }, 2: { lockPos: 'SNT' } }), T2);
  assert.ok(v.rowErrors.p0 && v.rowErrors.p2);
  v = D.validate(P(6, { 0: { lockTeam: 3 } }), T2);
  assert.ok(v.rowErrors.p0);
  // 5 kişi 2 takım: 3-2. İki takıma da 3 sabit olamaz.
  v = D.validate(P(5, { 0: { lockTeam: 0 }, 1: { lockTeam: 0 }, 2: { lockTeam: 0 }, 3: { lockTeam: 1 } }), T2);
  assert.equal(v.errors.length, 0);
  v = D.validate(P(6, { 0: { lockTeam: 0 }, 1: { lockTeam: 0 }, 2: { lockTeam: 0 }, 3: { lockTeam: 0 } }), T2);
  assert.ok(Object.keys(v.rowErrors).length);
  assert.equal(D.validate(P(12), T2).errors.length, 0);
  assert.ok(D.validate(P(25), T2).warnings.length);
});

test('geri al: açıklananlar sabit kalır, kalanlar yeniden çekilir', () => {
  const players = P(15, { 3: { lockPos: 'SNT' } });
  for (const mode of ['random', 'sequential']) {
    const settings = S({ mode, teamCount: 3 });
    const first = D.solve(players, settings);
    const fixed = {};
    players.slice(0, 7).forEach((p) => { fixed[p.id] = first[p.id]; });
    for (let i = 0; i < 100; i++) {
      const again = D.solve(players, settings, fixed);
      checkInvariants(players, settings, again);
      Object.keys(fixed).forEach((id) => assert.deepEqual(again[id], fixed[id]));
    }
  }
});

test('adalet: 7 kişilik takımda KL herkese eşit şansla düşer', () => {
  const players = P(14), settings = S();
  const hits = {};
  const RUNS = 6000;
  for (let i = 0; i < RUNS; i++) {
    const pl = D.solve(players, settings);
    Object.keys(pl).forEach((id) => { if (pl[id].slot === 'KL') hits[id] = (hits[id] || 0) + 1; });
  }
  // Her oyuncu ~ 2/14 olasılıkla KL olur.
  players.forEach((p) => {
    const rate = (hits[p.id] || 0) / RUNS;
    assert.ok(Math.abs(rate - 1 / 7) < 0.03, p.id + ' KL oranı ' + rate);
  });
});

test('adalet: rastgele modda takım dağılımı dengeli', () => {
  const players = P(10), settings = S();
  const inTeam0 = {};
  const RUNS = 4000;
  for (let i = 0; i < RUNS; i++) {
    const pl = D.solve(players, settings);
    players.forEach((p) => { if (pl[p.id].team === 0) inTeam0[p.id] = (inTeam0[p.id] || 0) + 1; });
  }
  players.forEach((p) => assert.ok(Math.abs(inTeam0[p.id] / RUNS - 0.5) < 0.04));
});

test('mevki çarkı: sadece boş ve ayrılmamış slotlar', () => {
  const players = P(12, { 5: { lockPos: 'SNT' } });
  const settings = S();
  const pl = D.solve(players, settings);
  const t = pl.p0.team;
  const revealed = {};
  const slots = D.wheelSlotsFor('p0', players, pl, revealed);
  assert.ok(slots.some((s) => s.id === pl.p0.slot));
  if (pl.p5.team === t) assert.ok(!slots.some((s) => s.id === pl.p5.slot));
  revealed.p0 = true;
  const next = players.find((p) => p.id !== 'p0' && p.id !== 'p5' && pl[p.id].team === t);
  assert.ok(!D.wheelSlotsFor(next.id, players, pl, revealed).some((s) => s.id === pl.p0.slot));
});

test('discord metni', () => {
  const players = P(4);
  const pl = D.solve(players, S());
  const txt = D.discordText(players, pl, ['Kırmızılar', 'Beyazlar'], 2);
  assert.match(txt, /\*\*Kırmızılar\*\*/);
  assert.match(txt, /Oyuncu 1/);
});

/* ---------- Tek takım ---------- */

test('tek takım, 5 kişi: herkes takım 0, defans kapalıyken ön grupta', () => {
  const players = P(5), settings = S({ teamCount: 1 });
  for (let i = 0; i < 100; i++) {
    const pl = D.solve(players, settings);
    assert.ok(pl);
    players.forEach((p) => {
      assert.equal(pl[p.id].team, 0);
      assert.equal(group(pl[p.id].slot), 'front');
    });
    const slots = players.map((p) => pl[p.id].slot);
    assert.equal(new Set(slots).size, 5);
  }
});

test('tek takım, 8 kişi: önce ön grup, sonra kale, sonra defans', () => {
  const players = P(8), settings = S({ teamCount: 1 });
  for (let i = 0; i < 100; i++) {
    const pl = D.solve(players, settings);
    const groups = players.map((p) => group(pl[p.id].slot));
    assert.equal(groups.filter((g) => g === 'front').length, 6);
    assert.equal(groups.filter((g) => g === 'gk').length, 1);
    assert.equal(groups.filter((g) => g === 'def').length, 1);
  }
});

test('tek takım: kayıtlı takım kilitleri yok sayılır, hata çıkmaz', () => {
  const players = P(6, { 0: { lockTeam: 3 }, 1: { lockTeam: 1, lockPos: 'SNT' } });
  const settings = S({ teamCount: 1 });
  const v = D.validate(players, settings);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.rowErrors, {});
  const pl = D.solve(players, settings);
  assert.ok(pl);
  players.forEach((p) => assert.equal(pl[p.id].team, 0));
  assert.equal(pl.p1.slot, 'SNT');
});

test('tek takım: mevkisi kilitli olan baştan yerleşir, gerisi sırada bekler', () => {
  const players = P(4, { 2: { lockPos: 'MOO' }, 3: { lockTeam: 0 } });
  const plan = D.buildPlan(players, 1);
  assert.deepEqual(plan.preplaced, ['p2']);
  assert.deepEqual(plan.queue, ['p0', 'p1', 'p3']);
  // Çok takımlıda sadece mevki kilidi yetmez.
  assert.deepEqual(D.buildPlan(players, 2).preplaced, []);
});

test('tek takım, 14 kişi: 11 sahada, listede son 3 yedek ve uyarı', () => {
  const players = P(14), settings = S({ teamCount: 1 });
  const v = D.validate(players, settings);
  assert.deepEqual(v.errors, []);
  assert.match(v.warnings[0], /^Takımda 14 kişi var\. 11 kişiyi aşanlar yedek olur\. 2 takım/);
  const pl = D.solve(players, settings);
  assert.deepEqual(['p11', 'p12', 'p13'].map((id) => pl[id].slot), [D.BENCH, D.BENCH, D.BENCH]);
  assert.equal(players.filter((p) => pl[p.id].slot !== D.BENCH).length, 11);
});

test('tek takım, mevki çarkı: açıklanan ve kilitli yerler çarkta görünmez', () => {
  const players = P(6, { 5: { lockPos: 'SNT' } });
  const settings = S({ teamCount: 1 });
  const pl = D.solve(players, settings);
  const revealed = { p5: true, p0: true };
  const ids = D.wheelSlotsFor('p1', players, pl, revealed).map((s) => s.id);
  assert.equal(ids.length, 4);
  assert.ok(!ids.includes('SNT'));
  assert.ok(!ids.includes(pl.p0.slot));
  assert.ok(ids.includes(pl.p1.slot));
});
