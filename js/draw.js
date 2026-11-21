/*
 * Dağıtım motoru. Arayüzden bağımsız, Node'da da test edilebilir.
 *
 * Çekiliş başlarken tüm dağılım tek seferde, bütün kurallar sağlanacak şekilde
 * rastgele hesaplanır. Çarklar bu sonucu sırayla açıklar. Geri alınca,
 * açıklanmış oyuncular sabit tutularak kalanlar yeniden hesaplanır.
 */
(function (root) {
  'use strict';

  // 4-3-3(4): x/y saha üzerindeki yüzdelik konum (hücum yukarı doğru).
  var SLOTS = [
    { id: 'KL', code: 'KL', group: 'gk', x: 50, y: 91 },
    { id: 'SLB', code: 'SLB', group: 'def', x: 13, y: 70 },
    { id: 'STP1', code: 'STP', group: 'def', x: 37, y: 76 },
    { id: 'STP2', code: 'STP', group: 'def', x: 63, y: 76 },
    { id: 'SGB', code: 'SĞB', group: 'def', x: 87, y: 70 },
    { id: 'MO1', code: 'MO', group: 'front', x: 29, y: 52 },
    { id: 'MO2', code: 'MO', group: 'front', x: 71, y: 52 },
    { id: 'MOO', code: 'MOO', group: 'front', x: 50, y: 37 },
    { id: 'SLK', code: 'SLK', group: 'front', x: 15, y: 20 },
    { id: 'SNT', code: 'SNT', group: 'front', x: 50, y: 12 },
    { id: 'SGK', code: 'SĞK', group: 'front', x: 85, y: 20 }
  ];

  var CODES = ['KL', 'SLB', 'STP', 'SĞB', 'MO', 'MOO', 'SLK', 'SNT', 'SĞK'];
  var FRONT_SIZE = 6;
  var BENCH = 'bench';

  var SLOT_BY_ID = {};
  SLOTS.forEach(function (s, i) { s.order = i; SLOT_BY_ID[s.id] = s; });

  function slotsFor(settings) {
    return settings.humanKeeper ? SLOTS : SLOTS.filter(function (s) { return s.id !== 'KL'; });
  }

  function codeCounts(slots) {
    var c = {};
    slots.forEach(function (s) { c[s.code] = (c[s.code] || 0) + 1; });
    return c;
  }

  function shuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sample(arr, k, rng) { return shuffle(arr, rng).slice(0, k); }

  function range(n) { var r = []; for (var i = 0; i < n; i++) r.push(i); return r; }

  function sizes(n, t) {
    var base = Math.floor(n / t), extra = n % t;
    return { base: base, extra: extra, max: base + (extra ? 1 : 0), min: base };
  }

  /* Takım başına düşecek kişi sayıları (eşit, en fazla 1 fark). */
  function teamSizesFor(n, t) {
    var s = sizes(n, t), out = [];
    for (var i = 0; i < t; i++) out.push(s.base + (i < s.extra ? 1 : 0));
    return out;
  }

  function fixedCode(f) {
    if (!f || f.slot === BENCH) return null;
    return SLOT_BY_ID[f.slot] ? SLOT_BY_ID[f.slot].code : null;
  }

  /* ---------- Takım ataması ---------- */

  function assignTeamsCore(players, settings, fixed, mode, rng) {
    var T = settings.teamCount, N = players.length;
    var sz = sizes(N, T);
    var counts = codeCounts(slotsFor(settings));

    function hardTeam(p) {
      if (fixed[p.id]) return fixed[p.id].team;
      return p.lockTeam != null ? p.lockTeam : null;
    }
    function codeOf(p) {
      if (fixed[p.id]) return fixedCode(fixed[p.id]);
      return p.lockPos || null;
    }

    var hardCount = range(T).map(function () { return 0; });
    for (var i = 0; i < N; i++) {
      var h = hardTeam(players[i]);
      if (h != null) {
        if (h < 0 || h >= T) return null;
        hardCount[h]++;
      }
    }

    var mustBig = [], canBig = [];
    for (var t = 0; t < T; t++) {
      if (hardCount[t] > sz.max) return null;
      if (sz.extra && hardCount[t] === sz.max) mustBig.push(t); else canBig.push(t);
    }
    if (mustBig.length > sz.extra) return null;
    var need = sz.extra - mustBig.length;
    var big = mode === 'sequential' ? canBig.slice(0, need) : shuffle(canBig, rng).slice(0, need);
    var seats = range(T).map(function (t) {
      return sz.base + (mustBig.indexOf(t) >= 0 || big.indexOf(t) >= 0 ? 1 : 0);
    });

    var teamOf = {};
    var codeUse = range(T).map(function () { return {}; });

    players.forEach(function (p) {
      var h = hardTeam(p);
      if (h == null) return;
      teamOf[p.id] = h;
      seats[h]--;
      var c = codeOf(p);
      if (c) codeUse[h][c] = (codeUse[h][c] || 0) + 1;
    });

    for (t = 0; t < T; t++) {
      for (var c in codeUse[t]) if ((counts[c] || 0) < codeUse[t][c]) return null;
    }

    var rest = players.filter(function (p) { return teamOf[p.id] == null; });

    function fits(t, c) { return seats[t] > 0 && (!c || (codeUse[t][c] || 0) < (counts[c] || 0)); }
    function put(p, t, c) { teamOf[p.id] = t; seats[t]--; if (c) codeUse[t][c] = (codeUse[t][c] || 0) + 1; }
    function take(p, t, c) { delete teamOf[p.id]; seats[t]++; if (c) codeUse[t][c]--; }

    if (mode === 'sequential') {
      var ptr = 0;
      for (var k = 0; k < rest.length; k++) {
        var p = rest[k], code = codeOf(p), chosen = -1;
        for (var step = 0; step < T; step++) {
          var cand = (ptr + step) % T;
          if (fits(cand, code)) { chosen = cand; break; }
        }
        if (chosen < 0) return null;
        put(p, chosen, code);
        ptr = (chosen + 1) % T;
      }
      return teamOf;
    }

    // Önce mevkisi sabit olanlar (geri izlemeli), sonra kalan koltuklara serbestler.
    var locked = shuffle(rest.filter(function (p) { return codeOf(p); }), rng);
    var free = rest.filter(function (p) { return !codeOf(p); });

    function bt(idx) {
      if (idx === locked.length) return true;
      var pl = locked[idx], c2 = codeOf(pl);
      var order = shuffle(range(T), rng);
      for (var o = 0; o < order.length; o++) {
        if (fits(order[o], c2)) {
          put(pl, order[o], c2);
          if (bt(idx + 1)) return true;
          take(pl, order[o], c2);
        }
      }
      return false;
    }
    if (!bt(0)) return null;

    var seatList = [];
    for (t = 0; t < T; t++) for (var s = 0; s < seats[t]; s++) seatList.push(t);
    if (seatList.length !== free.length) return null;
    seatList = shuffle(seatList, rng);
    free.forEach(function (pl, i2) { teamOf[pl.id] = seatList[i2]; });
    return teamOf;
  }

  function consistentWithFixed(teamOf, fixed) {
    for (var id in fixed) if (teamOf[id] !== fixed[id].team) return false;
    return true;
  }

  function assignTeams(players, settings, fixed, rng) {
    if (settings.mode === 'sequential') {
      // Sırayla mod deterministik: açıklananları yok sayıp baştan hesaplamak aynı sonucu verir.
      var seq = assignTeamsCore(players, settings, {}, 'sequential', rng);
      if (seq && consistentWithFixed(seq, fixed)) return seq;
    }
    return assignTeamsCore(players, settings, fixed, 'random', rng);
  }

  /* ---------- Mevki ataması ---------- */

  function assignSlots(players, settings, fixed, teamOf, rng) {
    var slots = slotsFor(settings), cap = slots.length, T = settings.teamCount;
    var placement = {};
    var members = range(T).map(function () { return []; });
    for (var i = 0; i < players.length; i++) {
      var tm = teamOf[players[i].id];
      if (tm == null) return null;
      members[tm].push(players[i]);
    }

    for (var t = 0; t < T; t++) {
      var M = members[t], s = M.length;
      var fieldCount = Math.min(s, cap), benchCount = s - fieldCount;
      var used = {}, usedN = 0, fixedBench = 0;

      for (var a = 0; a < M.length; a++) {
        var f = fixed[M[a].id];
        if (!f) continue;
        if (f.team !== t) return null;
        if (f.slot === BENCH) fixedBench++;
        else {
          if (used[f.slot] || !slots.some(function (sl) { return sl.id === f.slot; })) return null;
          used[f.slot] = true; usedN++;
        }
        placement[M[a].id] = { team: t, slot: f.slot };
      }

      var lockedP = M.filter(function (p) { return !fixed[p.id] && p.lockPos; });
      for (var b = 0; b < lockedP.length; b++) {
        var want = lockedP[b].lockPos;
        var opts = slots.filter(function (sl) { return sl.code === want && !used[sl.id]; });
        if (!opts.length) return null;
        var pick = opts[Math.floor(rng() * opts.length)];
        used[pick.id] = true; usedN++;
        placement[lockedP[b].id] = { team: t, slot: pick.id };
      }

      var freeP = M.filter(function (p) { return !fixed[p.id] && !p.lockPos; });
      var fieldFree = fieldCount - usedN, benchFree = benchCount - fixedBench;
      if (fieldFree < 0 || benchFree < 0 || fieldFree + benchFree !== freeP.length) return null;

      // 11'i aşan takımda listede en sonda kalanlar yedek olur.
      var fieldP = freeP.slice(0, freeP.length - benchFree);
      var benchP = freeP.slice(freeP.length - benchFree);
      benchP.forEach(function (p) { placement[p.id] = { team: t, slot: BENCH }; });

      var avail = slots.filter(function (sl) { return !used[sl.id]; });
      var front = avail.filter(function (sl) { return sl.group === 'front'; });
      var pool;

      if (s <= FRONT_SIZE && !settings.defenseOpen) {
        if (front.length < fieldFree) return null;
        pool = sample(front, fieldFree, rng);
      } else if (s <= FRONT_SIZE) {
        pool = sample(avail, fieldFree, rng);
      } else if (fieldFree <= front.length) {
        pool = sample(front, fieldFree, rng);
      } else {
        // Defans zorunlu: önce ön grup, sonra kale (açıksa), sonra rastgele defans.
        pool = front.slice();
        var remain = fieldFree - front.length;
        var gk = avail.filter(function (sl) { return sl.group === 'gk'; });
        var defs = avail.filter(function (sl) { return sl.group === 'def'; });
        if (gk.length && remain > 0) { pool.push(gk[0]); remain--; }
        if (remain > defs.length) return null;
        pool = pool.concat(sample(defs, remain, rng));
      }

      pool = shuffle(pool, rng);
      fieldP.forEach(function (p, idx) { placement[p.id] = { team: t, slot: pool[idx].id }; });
    }
    return placement;
  }

  function solve(players, settings, fixed, rng, tries) {
    rng = rng || Math.random;
    fixed = fixed || {};
    tries = tries || 60;
    if (players.length < settings.teamCount) return null;
    for (var i = 0; i < tries; i++) {
      var teamOf = assignTeams(players, settings, fixed, rng);
      if (!teamOf) continue;
      var placement = assignSlots(players, settings, fixed, teamOf, rng);
      if (placement) return placement;
    }
    return null;
  }

  /* ---------- Doğrulama ---------- */

  function teamLabel(t, names) { return (names && names[t]) || ('Takım ' + (t + 1)); }

  function validate(players, settings, teamNames) {
    var T = settings.teamCount, N = players.length;
    var slots = slotsFor(settings), counts = codeCounts(slots), cap = slots.length;
    var res = { errors: [], rowErrors: {}, warnings: [], sizes: null, forcedDefense: [] };

    function rowErr(p, msg) { if (!res.rowErrors[p.id]) res.rowErrors[p.id] = msg; }

    if (N < T) {
      res.errors.push(N === 0 ? 'Listeye oyuncu ekle.' : 'Bu takım sayısı için en az ' + T + ' oyuncu gerekiyor.');
      return res;
    }

    var sz = sizes(N, T);
    res.sizes = sz;
    var teamSizes = teamSizesFor(N, T);

    players.forEach(function (p) {
      if (p.lockTeam != null && p.lockTeam >= T) rowErr(p, 'Takım ' + (p.lockTeam + 1) + ' yok. Takım sayısını artır ya da sabiti kaldır.');
      if (p.lockPos && !counts[p.lockPos]) rowErr(p, 'Kaleci kapalı, KL sabitlenemez.');
    });

    if (!Object.keys(res.rowErrors).length) {
      var perTeam = range(T).map(function () { return []; });
      players.forEach(function (p) { if (p.lockTeam != null) perTeam[p.lockTeam].push(p); });

      var fullTeams = 0;
      perTeam.forEach(function (list, t) {
        if (list.length > sz.max) {
          list.forEach(function (p) { rowErr(p, teamLabel(t, teamNames) + ' takımına en fazla ' + sz.max + ' kişi sabitlenebilir.'); });
        }
        if (sz.extra && list.length === sz.max) fullTeams++;
        CODES.forEach(function (code) {
          var same = list.filter(function (p) { return p.lockPos === code; });
          if (same.length > (counts[code] || 0)) {
            var msg = counts[code] === 1
              ? teamLabel(t, teamNames) + ' takımında tek ' + code + ' yeri var.'
              : teamLabel(t, teamNames) + ' takımında ' + counts[code] + ' ' + code + ' yeri var.';
            same.forEach(function (p) { rowErr(p, msg); });
          }
        });
      });

      if (sz.extra && fullTeams > sz.extra) {
        res.errors.push('Sabitler yüzünden takımlar eşit bölünemiyor. Bazı takım sabitlerini kaldır.');
      }

      CODES.forEach(function (code) {
        var all = players.filter(function (p) { return p.lockPos === code; });
        var room = T * (counts[code] || 0);
        if (all.length > room) all.forEach(function (p) { rowErr(p, 'Toplamda ' + room + ' ' + code + ' yeri var.'); });
      });
    }

    if (Object.keys(res.rowErrors).length) {
      res.errors.push('İşaretli sabitleri düzelt.');
    } else if (!res.errors.length && !solve(players, settings, {}, Math.random, 80)) {
      res.errors.push('Sabitler birbiriyle çakışıyor. Birkaçını kaldırıp tekrar dene.');
    }

    if (sz.max > cap) {
      var hint = T < 4 ? ' ' + (T + 1) + ' takım daha uygun olabilir.' : '';
      res.warnings.push('Takım başına ' + sz.max + ' kişi düşüyor. ' + cap + ' kişiyi aşanlar yedek olur.' + hint);
    }

    teamSizes.forEach(function (n, t) { if (n > FRONT_SIZE) res.forcedDefense.push(t); });
    return res;
  }

  /* ---------- Açıklama planı ---------- */

  function isFullyLocked(p) { return p.lockTeam != null && p.lockPos != null; }

  function buildPlan(players) {
    return {
      preplaced: players.filter(isFullyLocked).map(function (p) { return p.id; }),
      queue: players.filter(function (p) { return !isFullyLocked(p); }).map(function (p) { return p.id; })
    };
  }

  /* Bu oyuncu için mevki çarkında görünecek boş slotlar (formasyon sırasıyla). */
  function wheelSlotsFor(playerId, players, placement, revealed) {
    var mine = placement[playerId];
    if (!mine || mine.slot === BENCH) return [];
    var ids = {};
    players.forEach(function (p) {
      var pl = placement[p.id];
      if (!pl || pl.team !== mine.team || pl.slot === BENCH) return;
      if (revealed[p.id] && p.id !== playerId) return;
      if (p.lockPos && p.id !== playerId) return; // başkasına ayrılmış
      ids[pl.slot] = true;
    });
    return SLOTS.filter(function (s) { return ids[s.id]; });
  }

  function discordText(players, placement, teamNames, teamCount) {
    var out = [];
    for (var t = 0; t < teamCount; t++) {
      var lines = ['**' + teamLabel(t, teamNames) + '**'];
      var inTeam = players.filter(function (p) { return placement[p.id] && placement[p.id].team === t; });
      SLOTS.forEach(function (s) {
        var who = inTeam.filter(function (p) { return placement[p.id].slot === s.id; })[0];
        if (who) lines.push(s.code + ': ' + who.name);
      });
      var bench = inTeam.filter(function (p) { return placement[p.id].slot === BENCH; });
      if (bench.length) lines.push('Yedek: ' + bench.map(function (p) { return p.name; }).join(', '));
      out.push(lines.join('\n'));
    }
    return out.join('\n\n');
  }

  var api = {
    SLOTS: SLOTS, CODES: CODES, FRONT_SIZE: FRONT_SIZE, BENCH: BENCH, SLOT_BY_ID: SLOT_BY_ID,
    slotsFor: slotsFor, sizes: sizes, teamSizesFor: teamSizesFor,
    solve: solve, validate: validate, buildPlan: buildPlan, wheelSlotsFor: wheelSlotsFor,
    discordText: discordText, shuffle: shuffle, isFullyLocked: isFullyLocked
  };

  root.KarmaDraw = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
