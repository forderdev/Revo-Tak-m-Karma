/*
 * Arayüz: kurulum ekranı, çekiliş sahnesi, kayıt ve Kick bağlantısı.
 */
(function () {
  'use strict';

  var D = window.KarmaDraw, Sound = window.KarmaSound, Wheel = window.KarmaWheel, Kick = window.KarmaKick;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'takim-karma:v1';
  var BENCH = D.BENCH;

  var SPEEDS = {
    slow: { team: 4500, pos: 5500, gap: 2400 },
    normal: { team: 3000, pos: 4000, gap: 1500 },
    fast: { team: 1600, pos: 2000, gap: 800 }
  };

  var POS_NAMES = {
    KL: 'Kaleci', SLB: 'Sol bek', STP: 'Stoper', 'SĞB': 'Sağ bek', MO: 'Merkez orta saha',
    MOO: 'Ofansif orta saha', SLK: 'Sol kanat', SNT: 'Santrfor', 'SĞK': 'Sağ kanat'
  };

  var LOCK_SVG = '<svg class="pin" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 5V3.8a3 3 0 0 1 6 0V5h.5c.3 0 .5.2.5.5v5c0 .3-.2.5-.5.5h-7a.5.5 0 0 1-.5-.5v-5c0-.3.2-.5.5-.5zm1.5 0h3V3.8a1.5 1.5 0 0 0-3 0z"/></svg>';

  // Dikey saha (hücum yukarı). Yatay sahada aynı çizim döndürülür, hücum sağa.
  var PITCH_LINES =
    '<rect x="0.5" y="0.5" width="67" height="99"/>' +
    '<line x1="0" y1="50" x2="68" y2="50"/>' +
    '<circle cx="34" cy="50" r="8.7"/><circle class="spot" cx="34" cy="50" r="0.7"/>' +
    '<rect x="13.85" y="0.5" width="40.3" height="15.2"/><rect x="24.85" y="0.5" width="18.3" height="4.7"/>' +
    '<circle class="spot" cx="34" cy="10.5" r="0.6"/><path d="M27.03 15.7A8.7 8.7 0 0 0 40.97 15.7"/>' +
    '<rect x="13.85" y="84.3" width="40.3" height="15.2"/><rect x="24.85" y="94.8" width="18.3" height="4.7"/>' +
    '<circle class="spot" cx="34" cy="89.5" r="0.6"/><path d="M27.03 84.3A8.7 8.7 0 0 1 40.97 84.3"/>';
  var PITCH_SVG =
    '<svg class="lines-v" viewBox="0 0 68 100" preserveAspectRatio="none" aria-hidden="true">' + PITCH_LINES + '</svg>' +
    '<svg class="lines-h" viewBox="0 0 100 68" preserveAspectRatio="none" aria-hidden="true"><g transform="translate(100 0) rotate(90)">' + PITCH_LINES + '</g></svg>';
  var PITCH_RATIO = 0.68;

  /* ---------- Durum ve kayıt ---------- */

  function defaults() {
    return {
      players: [],
      settings: { teamCount: 2, mode: 'random', humanKeeper: true, defenseOpen: false },
      speed: 'normal',
      teamNames: ['', '', '', ''],
      sound: true,
      theme: 'dark',
      kick: { channel: '', worker: '', joinOpen: true, wanted: false },
      draw: null
    };
  }

  function cleanPlayer(p) {
    if (!p || typeof p.name !== 'string' || !p.name.trim()) return null;
    return {
      id: String(p.id || newId()),
      name: p.name.slice(0, 24),
      lockTeam: Number.isInteger(p.lockTeam) && p.lockTeam >= 0 && p.lockTeam < 4 ? p.lockTeam : null,
      lockPos: D.CODES.indexOf(p.lockPos) >= 0 ? p.lockPos : null,
      src: p.src === 'kick' ? 'kick' : undefined,
      kickId: p.kickId != null ? p.kickId : undefined
    };
  }

  function load() {
    var s = defaults();
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.players)) s.players = raw.players.map(cleanPlayer).filter(Boolean);
        if (raw.settings) {
          var st = raw.settings;
          if ([1, 2, 3, 4].indexOf(st.teamCount) >= 0) s.settings.teamCount = st.teamCount;
          if (st.mode === 'sequential') s.settings.mode = 'sequential';
          s.settings.humanKeeper = st.humanKeeper !== false;
          s.settings.defenseOpen = st.defenseOpen === true;
        }
        if (SPEEDS[raw.speed]) s.speed = raw.speed;
        if (Array.isArray(raw.teamNames)) s.teamNames = [0, 1, 2, 3].map(function (i) { return String(raw.teamNames[i] || '').slice(0, 20); });
        s.sound = raw.sound !== false;
        s.theme = raw.theme === 'light' ? 'light' : 'dark';
        if (raw.kick) {
          s.kick.channel = String(raw.kick.channel || '');
          s.kick.worker = String(raw.kick.worker || '');
          s.kick.joinOpen = raw.kick.joinOpen !== false;
          s.kick.wanted = raw.kick.wanted === true;
        }
        if (raw.draw && raw.draw.placement && Array.isArray(raw.draw.queue)) s.draw = raw.draw;
      }
    } catch (e) { /* bozuk kayıt: varsayılanlar */ }
    return s;
  }

  var saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* dolu ya da kapalı */ }
    }, 60);
  }

  var seq = 0;
  function newId() { return 'p' + Date.now().toString(36) + (seq++).toString(36); }

  var state = load();

  /* ---------- Yardımcılar ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s).trim().replace(/\s+/g, ' '); }
  function keyOf(s) { return norm(s).toLocaleLowerCase('tr'); }
  function range(n) { var r = []; for (var i = 0; i < n; i++) r.push(i); return r; }
  function teamName(t) { return norm(state.teamNames[t] || '') || 'Takım ' + (t + 1); }
  function teamLabels() { return range(state.settings.teamCount).map(teamName); }
  function joinTr(list) {
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ' ve ' + list[list.length - 1];
  }

  var toastTimer = 0;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* İki adımlı onay: ilk basışta etiket değişir, 3 sn içinde ikinci basış onaylar. */
  function confirmable(btn, askText, action, needed) {
    var original = btn.textContent, armed = 0;
    btn.addEventListener('click', function () {
      if (needed && !needed()) { action(); return; }
      if (armed) {
        clearTimeout(armed); armed = 0;
        btn.textContent = original;
        action();
        return;
      }
      btn.textContent = askText;
      armed = setTimeout(function () { armed = 0; btn.textContent = original; }, 3000);
    });
  }

  /* ---------- Tema ve ses ---------- */

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    if (wheel) wheel.refreshColors();
  }

  function applySound() {
    $('soundToggle').setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    $('soundToggle').title = state.sound ? 'Sesi kapat' : 'Sesi aç';
    Sound.setEnabled(state.sound);
  }

  $('themeToggle').addEventListener('click', function () {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    save();
  });
  $('soundToggle').addEventListener('click', function () {
    state.sound = !state.sound;
    applySound();
    if (state.sound) Sound.unlock();
    save();
  });
  ['pointerdown', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { Sound.unlock(); }, { once: true, capture: true });
  });

  /* ---------- Oyuncu listesi ---------- */

  function cleanName(raw) {
    var s = String(raw).replace(/^\s*(?:\d{1,3}\s*[.):-]|[-*•])\s*/, '');
    return norm(s).slice(0, 24);
  }

  function addNames(list, extra) {
    var have = {};
    state.players.forEach(function (p) { have[keyOf(p.name)] = true; });
    var added = [], dup = 0;
    list.forEach(function (raw) {
      var name = cleanName(raw);
      if (!name) return;
      var k = keyOf(name);
      if (have[k]) { dup++; return; }
      have[k] = true;
      var p = { id: newId(), name: name, lockTeam: null, lockPos: null };
      if (extra) Object.keys(extra).forEach(function (key) { p[key] = extra[key]; });
      state.players.push(p);
      added.push(name);
    });
    return { added: added, dup: dup };
  }

  function addNote(res) {
    var parts = [];
    if (res.added.length === 1) parts.push(res.added[0] + ' eklendi.');
    else if (res.added.length > 1) parts.push(res.added.length + ' kişi eklendi.');
    if (res.dup) parts.push(res.added.length ? res.dup + ' isim zaten listedeydi.' : (res.dup === 1 ? 'Bu isim zaten listede.' : 'Bu isimler zaten listede.'));
    $('addNote').textContent = parts.join(' ');
  }

  function splitNames(text) { return String(text).split(/[\r\n\t,;]+/); }

  $('addForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var input = $('addInput');
    var res = addNames(splitNames(input.value));
    if (res.added.length || res.dup) addNote(res);
    if (res.added.length) input.value = '';
    afterRosterChange();
  });

  $('addInput').addEventListener('paste', function (e) {
    var text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\r\n\t]/.test(text)) return;
    e.preventDefault();
    var res = addNames(splitNames(text));
    addNote(res);
    afterRosterChange();
  });

  confirmable($('clearPlayers'), 'Emin misin? Tekrar bas', function () {
    state.players = [];
    $('addNote').textContent = 'Liste temizlendi.';
    afterRosterChange();
  });

  function rowHTML(p, i, T, err) {
    var teamOpts = '<option value="">Rastgele</option>' + range(T).map(function (t) {
      return '<option value="' + t + '"' + (p.lockTeam === t ? ' selected' : '') + '>' + esc(teamName(t)) + '</option>';
    }).join('');
    if (p.lockTeam != null && p.lockTeam >= T) {
      teamOpts += '<option value="' + p.lockTeam + '" selected>Takım ' + (p.lockTeam + 1) + ' (yok)</option>';
    }
    var posOpts = '<option value="">Rastgele</option>' + D.CODES.map(function (c) {
      return '<option value="' + c + '"' + (p.lockPos === c ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
    return '<li class="p-row' + (err ? ' has-error' : '') + '" data-id="' + esc(p.id) + '">' +
      '<span class="p-idx">' + (i + 1) + '</span>' +
      '<span class="p-namecell"><input class="p-name" data-f="name" value="' + esc(p.name) + '" maxlength="24" spellcheck="false" aria-label="' + (i + 1) + '. oyuncunun adı">' +
      (p.src === 'kick' ? '<span class="src" title="Kick sohbetinden katıldı">Kick</span>' : '') + '</span>' +
      (T === 1 ? '' : '<select class="lock lock-team' + (p.lockTeam != null ? ' is-locked' : '') + '" data-f="team" aria-label="' + esc(p.name) + ' için takım">' + teamOpts + '</select>') +
      '<select class="lock lock-pos' + (p.lockPos ? ' is-locked' : '') + '" data-f="pos" aria-label="' + esc(p.name) + ' için mevki">' + posOpts + '</select>' +
      '<button class="p-remove" type="button" data-f="remove" aria-label="' + esc(p.name) + ' listeden çıkar" title="Listeden çıkar"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>' +
      (err ? '<p class="p-error">' + esc(err) + '</p>' : '') +
      '</li>';
  }

  var validation = null;

  function renderRoster() {
    var T = state.settings.teamCount;
    var list = $('players');
    var active = document.activeElement, focusId = null, focusF = null;
    if (active && list.contains(active)) {
      var row = active.closest('.p-row');
      focusId = row && row.dataset.id;
      focusF = active.dataset.f;
    }
    list.innerHTML = state.players.map(function (p, i) {
      return rowHTML(p, i, T, validation && validation.rowErrors[p.id]);
    }).join('');
    var n = state.players.length;
    $('playerCount').textContent = n;
    $('emptyRoster').hidden = n > 0;
    document.querySelector('.roster-cols').hidden = n === 0;
    if (focusId) {
      var again = list.querySelector('.p-row[data-id="' + focusId + '"] [data-f="' + focusF + '"]');
      if (again) again.focus();
    }
  }

  $('players').addEventListener('change', function (e) {
    var el = e.target, row = el.closest('.p-row');
    if (!row) return;
    var p = state.players.find(function (x) { return x.id === row.dataset.id; });
    if (!p) return;
    var f = el.dataset.f;
    if (f === 'name') {
      var name = cleanName(el.value);
      var clash = state.players.some(function (x) { return x !== p && keyOf(x.name) === keyOf(name); });
      if (!name || clash) {
        el.value = p.name;
        if (clash) $('addNote').textContent = name + ' zaten listede.';
        return;
      }
      p.name = name;
    } else if (f === 'team') {
      p.lockTeam = el.value === '' ? null : Number(el.value);
    } else if (f === 'pos') {
      p.lockPos = el.value || null;
    }
    afterRosterChange();
  });

  $('players').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.dataset.f === 'name') e.target.blur();
  });

  $('players').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-f="remove"]');
    if (!btn) return;
    var row = btn.closest('.p-row');
    var idx = state.players.findIndex(function (x) { return x.id === row.dataset.id; });
    if (idx < 0) return;
    var gone = state.players.splice(idx, 1)[0];
    $('addNote').textContent = gone.name + ' çıkarıldı.';
    afterRosterChange();
    var next = $('players').querySelectorAll('.p-remove')[Math.min(idx, state.players.length - 1)];
    if (next) next.focus(); else $('addInput').focus();
  });

  function afterRosterChange() {
    save();
    renderSetup();
    renderWaiting();
  }

  /* ---------- Ayarlar ---------- */

  function setSeg(id, value) {
    $(id).querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.dataset.value) === String(value) ? 'true' : 'false');
    });
  }

  function bindSeg(id, apply) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('button[data-value]');
      if (!b) return;
      apply(b.dataset.value);
      save();
      renderSetup();
    });
    $(id).addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var btns = Array.prototype.slice.call($(id).querySelectorAll('button'));
      var i = btns.findIndex(function (b) { return b.getAttribute('aria-checked') === 'true'; });
      var n = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
      n.click();
      n.focus();
    });
  }

  bindSeg('teamCount', function (v) { state.settings.teamCount = Number(v); });
  bindSeg('mode', function (v) { state.settings.mode = v === 'sequential' ? 'sequential' : 'random'; });
  bindSeg('speed', function (v) { if (SPEEDS[v]) state.speed = v; });

  function bindSwitch(id, get, set) {
    $(id).addEventListener('click', function () {
      if ($(id).disabled) return;
      set(!get());
      save();
      renderSetup();
    });
  }
  bindSwitch('keeperSwitch', function () { return state.settings.humanKeeper; }, function (v) { state.settings.humanKeeper = v; });
  bindSwitch('defenseSwitch', function () { return state.settings.defenseOpen; }, function (v) { state.settings.defenseOpen = v; });
  bindSwitch('joinSwitch', function () { return state.kick.joinOpen; }, function (v) { state.kick.joinOpen = v; });

  var renderedTeamInputs = 0;
  function renderTeamNames() {
    var T = state.settings.teamCount, box = $('teamNames');
    if (renderedTeamInputs !== T) {
      box.innerHTML = range(T).map(function (t) {
        return '<div class="team-name-row"><span class="swatch kit-' + t + '" aria-hidden="true"></span>' +
          '<input class="field" data-team="' + t + '" maxlength="20" spellcheck="false" placeholder="Takım ' + (t + 1) + '" aria-label="' + (t + 1) + '. takımın adı" value="' + esc(state.teamNames[t] || '') + '"></div>';
      }).join('');
      renderedTeamInputs = T;
    }
  }

  $('teamNames').addEventListener('input', function (e) {
    var t = Number(e.target.dataset.team);
    state.teamNames[t] = e.target.value;
    save();
  });
  $('teamNames').addEventListener('change', function () { renderSetup(); });

  function renderSetup() {
    var s = state.settings, T = s.teamCount, N = state.players.length;
    validation = D.validate(state.players, s, teamLabels());

    setSeg('teamCount', T);
    setSeg('mode', s.mode);
    $('setup').dataset.teams = T;
    $('modeGroup').hidden = T === 1;
    setSeg('speed', state.speed);
    renderTeamNames();

    $('modeHelp').textContent = s.mode === 'random'
      ? 'Herkes rastgele bir takıma düşer, takımlar yine eşit kalır.'
      : 'Listedeki sıraya göre: 1. oyuncu ' + teamName(0) + ', 2. oyuncu ' + teamName(1) + ', sonra başa döner.';

    $('keeperSwitch').setAttribute('aria-checked', String(s.humanKeeper));

    var sizes = N >= T ? D.teamSizesFor(N, T) : [];
    var forced = sizes.filter(function (n) { return n > D.FRONT_SIZE; });
    var allForced = sizes.length > 0 && forced.length === sizes.length;
    var dsw = $('defenseSwitch');
    dsw.disabled = allForced;
    dsw.setAttribute('aria-checked', String(allForced ? true : s.defenseOpen));
    var help;
    if (allForced) help = (T === 1 ? 'Takım' : 'Takımlar') + ' 6 kişiyi geçtiği için defans zaten doluyor. Önce orta saha ve hücum, sonra ' + (s.humanKeeper ? 'kale ve ' : '') + 'defans dolar.';
    else if (s.defenseOpen) help = 'Herkes ' + (s.humanKeeper ? 'kale dahil ' : '') + 'bütün mevkilere düşebilir.';
    else help = 'Kapalıyken 6 kişiye kadar olan takımlar sadece orta saha ve hücuma dağılır.';
    if (forced.length && !allForced) help += ' ' + forced[0] + ' kişilik takımda defans her durumda dolar.';
    $('defenseHelp').textContent = help;

    $('joinSwitch').setAttribute('aria-checked', String(state.kick.joinOpen));

    if (N >= T) {
      var uniq = sizes.slice().sort(function (a, b) { return b - a; });
      $('summary').textContent = T === 1
        ? N + ' oyuncu, tek takım. Sadece mevki çarkı döner.'
        : N + ' oyuncu, ' + T + ' takım: ' + joinTr(uniq.map(String)) + ' kişi';
    } else {
      $('summary').textContent = N ? N + ' oyuncu' : '';
    }

    var msgs = validation.errors.map(function (m) { return '<li class="is-error">' + esc(m) + '</li>'; })
      .concat(validation.warnings.map(function (m) { return '<li>' + esc(m) + '</li>'; }));
    $('messages').innerHTML = msgs.join('');
    $('startBtn').disabled = validation.errors.length > 0;

    renderRoster();
  }

  $('startBtn').addEventListener('click', function () { startDraw(); });

  /* ---------- Kick ---------- */

  var kick = new Kick.KickChat({
    onStatus: function (kind, text) {
      var el = $('kickStatus');
      el.textContent = text;
      el.classList.toggle('is-live', kind === 'live');
      var on = kind === 'live' || kind === 'connecting' || kind === 'retry';
      $('kickConnect').textContent = on ? 'Bağlantıyı kes' : 'Bağlan';
    },
    onJoin: function (m) {
      if (!state.kick.joinOpen) return;
      var exists = state.players.some(function (p) {
        return (p.kickId != null && p.kickId === m.userId) || keyOf(p.name) === keyOf(m.username);
      });
      if (exists) return;
      var res = addNames([m.username], { src: 'kick', kickId: m.userId });
      if (!res.added.length) return;
      if (state.draw) toast(res.added[0] + ' sonraki çekilişe katılacak');
      else $('addNote').textContent = res.added[0] + ' Kick sohbetinden katıldı.';
      afterRosterChange();
    },
    onLeave: function (m) {
      var idx = state.players.findIndex(function (p) {
        return p.src === 'kick' && ((p.kickId != null && p.kickId === m.userId) || keyOf(p.name) === keyOf(m.username));
      });
      if (idx < 0) return;
      var gone = state.players.splice(idx, 1)[0];
      if (!state.draw) $('addNote').textContent = gone.name + ' listeden ayrıldı.';
      afterRosterChange();
    }
  });

  $('kickChannel').value = state.kick.channel;
  $('kickWorker').value = state.kick.worker;
  $('kickChannel').addEventListener('input', function (e) { state.kick.channel = e.target.value.trim(); save(); });
  $('kickWorker').addEventListener('input', function (e) { state.kick.worker = e.target.value.trim(); save(); });

  function kickConnect() {
    if (!Kick.DEFAULT_WORKER && !state.kick.worker) $('kickAdv').open = true;
    kick.connect(state.kick.channel, state.kick.worker).then(function (ok) {
      state.kick.wanted = ok;
      save();
    });
  }

  $('kickConnect').addEventListener('click', function () {
    if (kick.isActive()) {
      kick.disconnect();
      state.kick.wanted = false;
      save();
    } else kickConnect();
  });
  $('kickChannel').addEventListener('keydown', function (e) { if (e.key === 'Enter') kickConnect(); });

  /* ---------- Çekiliş ---------- */

  var wheel = new Wheel($('wheel'), {
    pointer: $('pointer'),
    onTick: function (k) { Sound.tick(k); }
  });

  var busy = false, spinning = false, instant = false, skipAllMode = false, auto = false;
  var autoTimer = 0, drawToken = 0, wheelMode = null;
  var teamEls = [];
  var wakers = [];

  function pause(ms) {
    if (instant || ms <= 0) return Promise.resolve();
    return new Promise(function (resolve) {
      var t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        var i = wakers.indexOf(done);
        if (i >= 0) wakers.splice(i, 1);
        resolve();
      }
      wakers.push(done);
    });
  }
  function wakeAll() { wakers.slice().forEach(function (f) { f(); }); }

  function startDraw() {
    validation = D.validate(state.players, state.settings, teamLabels());
    if (validation.errors.length) {
      showSetup();
      return;
    }
    var single = state.settings.teamCount === 1;
    var players = state.players.map(function (p) {
      return { id: p.id, name: p.name, lockTeam: single ? null : p.lockTeam, lockPos: p.lockPos };
    });
    var settings = {
      teamCount: state.settings.teamCount,
      mode: state.settings.mode,
      humanKeeper: state.settings.humanKeeper,
      defenseOpen: state.settings.defenseOpen
    };
    var placement = D.solve(players, settings);
    if (!placement) {
      showSetup();
      $('messages').innerHTML = '<li class="is-error">Bu sabitlerle dağıtım bulunamadı. Birkaç sabiti kaldır.</li>';
      return;
    }
    var plan = D.buildPlan(players, settings.teamCount);
    var revealed = {};
    plan.preplaced.forEach(function (id) { revealed[id] = true; });
    state.draw = {
      players: players,
      settings: settings,
      names: teamLabels(),
      placement: placement,
      revealed: revealed,
      preplaced: plan.preplaced,
      queue: plan.queue,
      pos: 0,
      history: [],
      done: false
    };
    save();
    showStage();
  }

  function playerOf(id) {
    return state.draw.players.find(function (p) { return p.id === id; });
  }

  function showSetup() {
    drawToken++;
    wheel.finish();
    busy = spinning = instant = skipAllMode = auto = false;
    clearTimeout(autoTimer);
    wakeAll();
    $('app').dataset.view = 'setup';
    $('setup').hidden = false;
    $('stage').hidden = true;
    $('backToSetup').hidden = true;
    $('progress').hidden = true;
    renderSetup();
  }

  function showStage() {
    drawToken++;
    busy = spinning = instant = skipAllMode = auto = false;
    clearTimeout(autoTimer);
    $('app').dataset.view = 'stage';
    $('setup').hidden = true;
    $('stage').hidden = false;
    $('backToSetup').hidden = false;
    $('progress').hidden = false;
    buildTeams();
    wheelMode = null;
    idleWheel(false);
    var d = state.draw;
    if (!d.done && d.pos >= d.queue.length) {
      finish(true);
      return;
    }
    showIdle();
    updateStage();
    renderWaiting();
    window.scrollTo(0, 0);
  }

  /* --- Saha --- */

  var pitchObserver = window.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) { fitPitch(en.target); });
  }) : null;

  /* Kutuya hangi yönde daha büyük sığıyorsa saha o yönde çizilir. */
  function fitPitch(box) {
    var pitch = box.firstElementChild;
    var W = box.clientWidth, H = box.clientHeight;
    if (!W) return;
    if (!H) H = W / PITCH_RATIO;
    var vShort = Math.min(W, H * PITCH_RATIO);   // dikey sahanın kısa kenarı
    var hShort = Math.min(H, W * PITCH_RATIO);   // yatay sahanın kısa kenarı
    var horizontal = hShort > vShort * 1.08;
    var short = horizontal ? hShort : vShort, long = short / PITCH_RATIO;
    pitch.dataset.orient = horizontal ? 'h' : 'v';
    pitch.style.width = (horizontal ? long : short) + 'px';
    pitch.style.height = (horizontal ? short : long) + 'px';
    pitch.style.setProperty('--chip', Math.max(22, short * 0.11) + 'px');
    pitch.style.setProperty('--who', Math.max(11, short * 0.043) + 'px');
  }

  function teamHTML(t) {
    var d = state.draw;
    return '<div class="team" data-team="' + t + '">' +
      '<div class="team-head"><span class="swatch kit-' + t + '" aria-hidden="true"></span>' +
      '<h2 class="team-name">' + esc(d.names[t]) + '</h2><span class="team-count"></span></div>' +
      '<div class="pitch-box"><div class="pitch">' + PITCH_SVG + '<div class="slots"></div></div></div>' +
      '<p class="bench"></p></div>';
  }

  function buildTeams() {
    var T = state.draw.settings.teamCount, left = [], right = [];
    $('stage').dataset.teams = T;
    range(T).forEach(function (t) { (t % 2 === 0 ? left : right).push(t); });
    [['teamsLeft', left], ['teamsRight', right]].forEach(function (pair) {
      var el = $(pair[0]);
      el.style.setProperty('--rows', pair[1].length);
      el.innerHTML = pair[1].map(teamHTML).join('');
    });
    teamEls = [];
    document.querySelectorAll('#stage .team').forEach(function (el) {
      var t = Number(el.dataset.team);
      teamEls[t] = {
        root: el,
        slots: el.querySelector('.slots'),
        bench: el.querySelector('.bench'),
        count: el.querySelector('.team-count'),
        box: el.querySelector('.pitch-box')
      };
      if (pitchObserver) pitchObserver.observe(teamEls[t].box);
      fitPitch(teamEls[t].box);
    });
    renderPitches();
  }

  function renderPitch(t, justId) {
    var d = state.draw, el = teamEls[t];
    if (!el) return;
    var members = d.players.filter(function (p) { return d.placement[p.id] && d.placement[p.id].team === t; });
    var shown = members.filter(function (p) { return d.revealed[p.id]; });
    var bySlot = {};
    shown.forEach(function (p) {
      var s = d.placement[p.id].slot;
      if (s !== BENCH) bySlot[s] = p;
    });
    el.slots.innerHTML = D.SLOTS.map(function (s) {
      var p = bySlot[s.id], cls = 'slot', chip = 'chip', who = '';
      if (p) {
        cls += ' is-filled';
        chip += ' kit-' + t;
        who = esc(p.name) + (p.lockTeam != null || p.lockPos ? LOCK_SVG : '');
        if (p.id === justId) cls += ' just-placed';
      } else if ((s.id === 'KL' && !d.settings.humanKeeper) || d.done) {
        cls += ' is-ai';
        who = 'AI';
      } else cls += ' is-open';
      return '<div class="' + cls + '" style="--x:' + s.x + ';--y:' + s.y + '"' + (p ? ' title="' + esc(p.name) + '"' : '') + '>' +
        '<span class="' + chip + '"><span class="plate">' + s.code + '</span></span>' +
        '<span class="who">' + who + '</span></div>';
    }).join('');
    var bench = shown.filter(function (p) { return d.placement[p.id].slot === BENCH; });
    el.bench.innerHTML = bench.length
      ? '<b>Yedek</b>' + bench.map(function (p) { return esc(p.name); }).join(', ')
      : '';
    el.count.textContent = shown.length + '/' + members.length;
  }

  function renderPitches(justId) {
    range(state.draw.settings.teamCount).forEach(function (t) { renderPitch(t, justId); });
  }

  function setActiveTeam(t) {
    $('stage').classList.toggle('has-active', t != null);
    teamEls.forEach(function (el, i) { if (el) el.root.classList.toggle('is-active', i === t); });
  }

  /* --- Çark içeriği --- */

  function teamSlices() {
    var d = state.draw, T = d.settings.teamCount, per = 12 / T, out = [];
    for (var r = 0; r < per; r++) for (var t = 0; t < T; t++) out.push({ label: d.names[t], kit: t, team: t });
    return out;
  }

  function swapAnim() {
    var wrap = $('wheelWrap');
    wrap.classList.remove('is-swapping');
    void wrap.offsetWidth;
    wrap.classList.add('is-swapping');
  }

  function setTeamWheel(animate) {
    if (wheelMode === 'team') { wheel.setSlices(wheel.slices); return; }
    wheel.setSlices(teamSlices());
    wheelMode = 'team';
    if (animate && !instant) swapAnim();
  }

  function setPosWheel(slots, team, quiet) {
    var n = slots.length;
    var slices = slots.map(function (s, i) {
      var tone = i % 2 === 0 ? 'fg' : 'alt';
      if (n > 1 && n % 2 === 1 && i === n - 1) tone = 'bg';
      return { label: s.code, tone: tone, slot: s.id };
    });
    wheel.setSlices(slices, { hubKit: team });
    wheelMode = 'pos';
    if (!instant && !quiet) swapAnim();
  }

  function isSingle() { return state.draw.settings.teamCount === 1; }

  /* Çark şu an tam bu mevkileri mi gösteriyor? */
  function showsSlots(slots) {
    if (wheelMode !== 'pos' || !wheel.slices || wheel.slices.length !== slots.length) return false;
    return slots.every(function (s, i) { return wheel.slices[i].slot === s.id; });
  }

  /* Sıradaki oyuncu beklerken çarkta ne dursun. Tek takımda takım çarkı yok, mevki çarkı bekler. */
  function idleWheel(animate) {
    if (!isSingle()) { setTeamWheel(animate); return; }
    var d = state.draw;
    for (var i = d.pos; i < d.queue.length; i++) {
      var slots = D.wheelSlotsFor(d.queue[i], d.players, d.placement, d.revealed);
      if (slots.length) {
        if (!showsSlots(slots)) setPosWheel(slots, 0, !animate);
        return;
      }
    }
    if (!wheel.slices || !wheel.slices.length) setTeamWheel(false);
  }

  function pickTeamSlice(team) {
    var opts = [];
    wheel.slices.forEach(function (s, i) { if (s.team === team) opts.push(i); });
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function spin(idx, ms) {
    if (instant) {
      wheel.jumpTo(idx);
      wheel.highlight(idx);
      return Promise.resolve();
    }
    spinning = true;
    updateStage();
    return wheel.spinTo(idx, ms).then(function () {
      spinning = false;
      wheel.highlight(idx);
      if (!instant) Sound.land();
      updateStage();
    });
  }

  /* --- Orta bölüm --- */

  function fitName() {
    var el = $('nowName');
    el.style.fontSize = '';
    if (!el.offsetParent) return;
    var size = parseFloat(getComputedStyle(el).fontSize), guard = 0;
    while (el.scrollWidth > el.clientWidth + 1 && size > 20 && guard++ < 40) {
      size *= 0.92;
      el.style.fontSize = size + 'px';
    }
  }

  function showName(p) {
    $('nowName').textContent = p ? p.name : '';
    fitName();
  }

  function retrigger(el) {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  function showTeamToken(t, fixed) {
    var el = $('tokTeam');
    el.innerHTML = '<span class="swatch kit-' + t + '" aria-hidden="true"></span>' + esc(state.draw.names[t]) +
      (fixed ? ' <small>sabit</small>' : '');
    el.hidden = false;
    if (!instant) retrigger(el);
  }

  function showPosToken(slotId, fixed) {
    var el = $('tokPos');
    if (slotId === BENCH) el.innerHTML = 'YDK <small>Yedek</small>';
    else {
      var code = D.SLOT_BY_ID[slotId].code;
      el.innerHTML = esc(code) + ' <small>' + POS_NAMES[code] + (fixed ? ', sabit' : '') + '</small>';
    }
    el.hidden = false;
    if (!instant) retrigger(el);
  }

  function hideTokens() {
    $('tokTeam').hidden = true;
    $('tokPos').hidden = true;
  }

  /* Sıradaki oyuncuyu çarka hazırla. */
  function showIdle() {
    var d = state.draw;
    var id = d.queue[d.pos];
    showName(id ? playerOf(id) : null);
    hideTokens();
    setActiveTeam(null);
    idleWheel(true);
    renderUpNext(d.pos + 1);
  }

  function renderUpNext(from) {
    var d = state.draw;
    var rest = d.queue.slice(from).map(function (id) { return playerOf(id).name; });
    var el = $('upNext');
    if (!rest.length || d.done) { el.innerHTML = ''; return; }
    var html = 'Sonra <b>' + esc(rest[0]) + '</b>';
    if (rest.length > 1) html += ', ' + rest.slice(1, 3).map(esc).join(', ');
    if (rest.length > 3) html += ' ve ' + (rest.length - 3) + ' kişi daha';
    el.innerHTML = html;
  }

  function renderWaiting() {
    var el = $('waitingNote'), d = state.draw;
    if (!d) { el.hidden = true; return; }
    var inDraw = {};
    d.players.forEach(function (p) { inDraw[p.id] = true; });
    var waiting = state.players.filter(function (p) { return !inDraw[p.id]; });
    el.hidden = !waiting.length;
    el.textContent = waiting.length
      ? 'Sonraki çekilişe katılacak: ' + waiting.map(function (p) { return p.name; }).join(', ')
      : '';
  }

  function updateStage() {
    var d = state.draw;
    if (!d) return;
    var total = d.players.length;
    var shown = Object.keys(d.revealed).length;
    $('progress').textContent = shown + ' / ' + total;

    $('wheelZone').hidden = d.done;
    $('controls').hidden = d.done;
    $('donePanel').hidden = !d.done;
    $('doneTitle').textContent = d.settings.teamCount === 1 ? 'Takım hazır' : 'Takımlar hazır';
    $('upNext').hidden = d.done;
    document.querySelector('#stage .now').hidden = d.done;

    var left = d.pos < d.queue.length;
    $('spinBtn').disabled = busy || auto || !left;
    $('skipBtn').disabled = !left && !busy;
    $('skipAllBtn').disabled = !left && !busy;
    $('autoBtn').setAttribute('aria-pressed', String(auto));
    $('autoBtn').disabled = !left;
    $('undoBtn').disabled = busy || !d.history.length;
    $('undoDone').disabled = !d.history.length;
  }

  /* --- Açıklama akışı --- */

  function revealNext(fast) {
    var d = state.draw;
    if (!d || d.done || busy) return;
    if (d.pos >= d.queue.length) { finish(); return; }
    busy = true;
    instant = !!fast || skipAllMode;
    clearTimeout(autoTimer);
    var token = drawToken;
    updateStage();
    revealOne(d, d.queue[d.pos], token).then(function () {
      if (token !== drawToken) return;
      busy = false;
      afterReveal();
    }, function (err) {
      busy = false;
      instant = false;
      console.error(err);
      updateStage();
    });
  }

  function revealOne(d, id, token) {
    var p = playerOf(id), target = d.placement[id], sp = SPEEDS[state.speed];
    var alive = function () { return token === drawToken; };

    renderUpNext(d.pos + 1);
    showName(p);
    hideTokens();
    setActiveTeam(null);

    var chain = Promise.resolve();
    if (isSingle()) {
      // Tek takım: takım belli, doğrudan mevkiye geçilir.
    } else if (p.lockTeam == null) {
      chain = chain.then(function () {
        var swapping = wheelMode !== 'team';
        setTeamWheel(true);
        return pause(swapping ? 320 : 0);
      }).then(function () {
        if (!alive()) return;
        return spin(pickTeamSlice(target.team), sp.team);
      }).then(function () {
        if (!alive()) return;
        showTeamToken(target.team, false);
        setActiveTeam(target.team);
        return pause(550);
      });
    } else {
      chain = chain.then(function () {
        showTeamToken(target.team, true);
        setActiveTeam(target.team);
        if (!instant) Sound.land();
        return pause(700);
      });
    }

    return chain.then(function () {
      if (!alive()) return;
      if (target.slot === BENCH || p.lockPos) {
        showPosToken(target.slot, !!p.lockPos);
        if (!instant) Sound.land();
        return pause(250);
      }
      var slots = D.wheelSlotsFor(id, d.players, d.placement, d.revealed);
      var idx = slots.findIndex(function (s) { return s.id === target.slot; });
      var ready = showsSlots(slots);
      if (ready) wheel.setSlices(wheel.slices, { hubKit: wheel.hubKit }); else setPosWheel(slots, target.team);
      return pause(ready ? 0 : 320).then(function () {
        if (!alive()) return;
        return spin(idx, sp.pos);
      }).then(function () {
        if (!alive()) return;
        showPosToken(target.slot, false);
      });
    }).then(function () {
      if (!alive()) return;
      d.revealed[id] = true;
      d.history.push(id);
      d.pos++;
      renderPitch(target.team, skipAllMode ? null : id);
      save();
    });
  }

  function afterReveal() {
    var d = state.draw;
    if (d.pos >= d.queue.length) {
      updateStage();
      var t = drawToken;
      pause(skipAllMode ? 0 : 900).then(function () { if (t === drawToken) finish(); });
      return;
    }
    if (skipAllMode) { revealNext(true); return; }
    instant = false;
    renderUpNext(d.pos);
    updateStage();
    if (auto) autoTimer = setTimeout(function () { revealNext(); }, SPEEDS[state.speed].gap);
  }

  function finish(silent) {
    var d = state.draw;
    d.done = true;
    skipAllMode = false;
    instant = false;
    auto = false;
    clearTimeout(autoTimer);
    save();
    setActiveTeam(null);
    renderPitches();
    updateStage();
    if (!silent) Sound.done();
  }

  function skip() {
    var d = state.draw;
    if (!d || d.done) return;
    if (busy) {
      instant = true;
      wheel.finish();
      wakeAll();
    } else revealNext(true);
  }

  function skipAll() {
    var d = state.draw;
    if (!d || d.done) return;
    auto = false;
    clearTimeout(autoTimer);
    skipAllMode = true;
    if (busy) {
      instant = true;
      wheel.finish();
      wakeAll();
    } else revealNext(true);
  }

  function toggleAuto() {
    var d = state.draw;
    if (!d || d.done) return;
    auto = !auto;
    clearTimeout(autoTimer);
    updateStage();
    if (auto && !busy) revealNext();
  }

  function undo() {
    var d = state.draw;
    if (!d || busy || !d.history.length) return;
    var id = d.history.pop();
    delete d.revealed[id];
    d.pos = d.queue.indexOf(id);
    d.done = false;
    auto = false;
    clearTimeout(autoTimer);

    var fixed = {};
    Object.keys(d.revealed).forEach(function (rid) { fixed[rid] = d.placement[rid]; });
    var old = d.placement[id], best = null;
    for (var i = 0; i < 30; i++) {
      var pl = D.solve(d.players, d.settings, fixed);
      if (!pl) continue;
      best = best || pl;
      if (pl[id].team !== old.team || pl[id].slot !== old.slot) { best = pl; break; }
    }
    if (best) d.placement = best;
    save();
    renderPitches();
    wheelMode = null;
    showIdle();
    updateStage();
    toast(playerOf(id).name + ' yeniden çekilecek');
  }

  $('spinBtn').addEventListener('click', function () { revealNext(); });
  $('skipBtn').addEventListener('click', skip);
  $('skipAllBtn').addEventListener('click', skipAll);
  $('autoBtn').addEventListener('click', toggleAuto);
  $('undoBtn').addEventListener('click', undo);
  $('undoDone').addEventListener('click', undo);

  $('redraw').addEventListener('click', function () { startDraw(); });

  $('copyDiscord').addEventListener('click', function () {
    var d = state.draw;
    if (!d) return;
    var text = D.discordText(d.players, d.placement, d.names, d.settings.teamCount);
    copyText(text).then(function (ok) {
      toast(ok ? 'Kopyalandı. Discord\'a yapıştırabilirsin.' : 'Kopyalanamadı. Tarayıcı izin vermedi.');
    });
  });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  var backBtn = $('backToSetup');
  // Bitmiş çekilişte onay istemeye gerek yok.
  confirmable(backBtn, 'Çekiliş silinsin mi? Tekrar bas', function () {
    state.draw = null;
    save();
    showSetup();
  }, function () { return state.draw && !state.draw.done; });

  document.addEventListener('keydown', function (e) {
    if ($('app').dataset.view !== 'stage' || e.repeat) return;
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!busy && !auto) revealNext();
    }
  });

  /* --- Çark ve sahaların boyutu --- */

  function fitWheel() {
    var zone = $('wheelZone'), wrap = $('wheelWrap');
    var w = zone.clientWidth, h = zone.clientHeight;
    if (!w) return;
    var s = Math.floor(Math.max(200, h ? Math.min(w, h) : w) * 0.96);
    wrap.style.width = s + 'px';
    wrap.style.height = s + 'px';
  }

  if (window.ResizeObserver) new ResizeObserver(function () { fitWheel(); fitName(); }).observe($('wheelZone'));
  window.addEventListener('resize', function () { fitWheel(); fitName(); });

  /* ---------- Başlangıç ---------- */

  applyTheme();
  applySound();
  if (state.draw) showStage(); else showSetup();
  fitWheel();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitName);
  if (state.kick.wanted && state.kick.channel) kickConnect();
})();
