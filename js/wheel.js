/*
 * Canvas çark. Sonucu kendisi seçmez: spinTo(index) ile istenen dilimde durur.
 * Dilim: { label, kit }  takım çarkı (kit 0-3 forma deseni)
 *        { label, tone }  mevki çarkı ('fg' | 'alt' | 'bg')
 */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)');

  function easeOut(t) { return 1 - Math.pow(1 - t, 4); }
  function mod(a, n) { return ((a % n) + n) % n; }

  function Wheel(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pointer = opts.pointer || null;
    this.onTick = opts.onTick || null;
    this.slices = [];
    this.hubKit = null;
    this.rot = Math.random() * TAU;
    this.size = 0;
    this.dpr = 1;
    this.hl = -1;
    this.hlA = 0;
    this.pAng = 0;
    this.anim = null;
    this.raf = 0;
    this.lastBoundary = 0;
    this.colors = null;
    this.refreshColors();

    var self = this;
    var host = canvas.parentElement;
    if (root.ResizeObserver) {
      new ResizeObserver(function () { self.resize(); }).observe(host);
    } else {
      root.addEventListener('resize', function () { self.resize(); });
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { self.draw(); });
    this.resize();
  }

  Wheel.prototype.refreshColors = function () {
    var cs = getComputedStyle(document.documentElement);
    var v = function (n, d) { return (cs.getPropertyValue(n) || '').trim() || d; };
    this.colors = { fg: v('--fg', '#fff'), bg: v('--bg', '#242424'), alt: v('--alt', '#7d7d7d') };
    this.draw();
  };

  Wheel.prototype.resize = function () {
    var host = this.canvas.parentElement;
    var w = host.clientWidth;
    if (!w) return;
    var dpr = Math.min(root.devicePixelRatio || 1, 2.5);
    if (w === this.size && dpr === this.dpr) return;
    this.size = w;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(w * dpr);
    this.draw();
  };

  Wheel.prototype.setSlices = function (slices, opts) {
    opts = opts || {};
    this.slices = slices.slice();
    this.hubKit = opts.hubKit == null ? null : opts.hubKit;
    this.hl = -1;
    this.hlA = 0;
    this.lastBoundary = this.boundary();
    this.draw();
  };

  Wheel.prototype.sliceAngle = function () { return TAU / Math.max(1, this.slices.length); };

  Wheel.prototype.boundary = function () { return Math.floor(this.rot / this.sliceAngle()); };

  /* İbre tepede. Dilim i, tepeden saat yönünde i * a açısıyla başlar. */
  Wheel.prototype.indexAtPointer = function () {
    var a = this.sliceAngle();
    return Math.floor(mod(-this.rot, TAU) / a) % Math.max(1, this.slices.length);
  };

  Wheel.prototype.targetRot = function (index, turns) {
    var a = this.sliceAngle();
    var u = 0.18 + Math.random() * 0.64; // dilim kenarına yakın durmasın
    var want = mod(-(index + u) * a, TAU);
    var delta = mod(want - mod(this.rot, TAU), TAU);
    return this.rot + turns * TAU + delta;
  };

  Wheel.prototype.spinTo = function (index, duration) {
    var self = this;
    this.finish();
    this.hl = -1;
    this.hlA = 0;
    var reduced = reduceMotion && reduceMotion.matches;
    var ms = reduced ? Math.min(duration, 700) : duration;
    var turns = reduced ? 1 : Math.max(2, Math.round(ms / 1000 * 1.4)) + (Math.random() < 0.5 ? 0 : 1);
    if (this.slices.length <= 1) turns = Math.max(1, Math.round(turns / 2));
    var to = this.targetRot(index, turns);

    return new Promise(function (resolve) {
      self.anim = { from: self.rot, to: to, start: performance.now(), ms: ms, resolve: resolve, index: index };
      self.lastBoundary = self.boundary();
      self.loop();
    });
  };

  /* Dönüşü hemen bitir (Atla). */
  Wheel.prototype.finish = function () {
    var a = this.anim;
    if (!a) return;
    this.anim = null;
    this.rot = a.to;
    this.lastBoundary = this.boundary();
    this.draw();
    a.resolve();
  };

  /* Animasyonsuz doğrudan dilime git. */
  Wheel.prototype.jumpTo = function (index) {
    this.finish();
    this.rot = this.targetRot(index, 0);
    this.lastBoundary = this.boundary();
    this.draw();
  };

  Wheel.prototype.highlight = function (index) {
    var s = this.slices[index];
    // Mevki çarkında kazanan dilim beyaza döner, kalanlar kararır.
    if (s && s.tone && s.tone !== 'fg') {
      this.slices = this.slices.slice();
      this.slices[index] = Object.assign({}, s, { tone: 'fg' });
    }
    this.hl = index;
    this.hlA = 0;
    this.hlStart = performance.now();
    this.loop();
  };

  Wheel.prototype.loop = function () {
    if (this.raf) return;
    var self = this, last = performance.now();
    var step = function (now) {
      self.raf = 0;
      var dt = Math.min(64, now - last);
      last = now;
      var busy = false;

      var a = self.anim;
      if (a) {
        var t = Math.min(1, (now - a.start) / a.ms);
        self.rot = a.from + (a.to - a.from) * easeOut(t);
        var b = self.boundary();
        if (b !== self.lastBoundary) {
          var speed = (a.to - a.from) * 4 * Math.pow(1 - t, 3) / a.ms * 1000 / TAU; // tur/sn
          self.lastBoundary = b;
          self.pAng = -Math.min(30, 14 + speed * 3);
          if (self.onTick) self.onTick(Math.min(1, 0.35 + speed / 4));
        }
        if (t >= 1) {
          self.anim = null;
          self.rot = a.to;
          a.resolve();
        } else busy = true;
      }

      if (Math.abs(self.pAng) > 0.1) {
        self.pAng *= Math.pow(0.8, dt / 16.7);
        busy = true;
      } else self.pAng = 0;
      if (self.pointer) self.pointer.style.transform = 'translateX(-50%) rotate(' + self.pAng.toFixed(2) + 'deg)';

      if (self.hl >= 0 && self.hlA < 1) {
        self.hlA = Math.min(1, (now - self.hlStart) / 220);
        busy = true;
      }

      self.draw();
      if (busy) self.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  };

  /* ---------- Çizim ---------- */

  Wheel.prototype.slicePath = function (c, R, start, end) {
    c.beginPath();
    if (this.slices.length === 1) {
      c.arc(0, 0, R, 0, TAU);
    } else {
      c.moveTo(0, 0);
      c.arc(0, 0, R, start, end);
      c.closePath();
    }
  };

  Wheel.prototype.paintKit = function (c, kit, R, mid, inset, path) {
    var col = this.colors;
    path();
    if (kit === 0) {
      c.fillStyle = col.fg;
      c.fill();
      return;
    }
    c.fillStyle = col.bg;
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = col.fg;
    var w = R * 0.05;
    if (kit === 2) {
      // Çubuklar: dilim ekseni boyunca uzanan şeritler.
      c.rotate(mid);
      for (var y = -R - w / 2; y < R; y += w * 2) c.fillRect(0, y, R, w);
    } else if (kit === 3) {
      // Çemberler: merkezden dışa halkalar.
      c.lineWidth = w;
      c.strokeStyle = col.fg;
      for (var r = R * 0.2 + w / 2; r < R; r += w * 2) {
        c.beginPath();
        c.arc(0, 0, r, 0, TAU);
        c.stroke();
      }
    }
    c.restore();
    path();
    c.save();
    c.clip();
    c.lineWidth = inset * 2;
    c.strokeStyle = col.fg;
    c.stroke();
    c.restore();
  };

  Wheel.prototype.label = function (c, s, R, mid, a) {
    var col = this.colors;
    var text = String(s.label || '').toLocaleUpperCase('tr');
    if (!text) return;
    var hubR = R * 0.22, outer = R * 0.86;
    var room = outer - hubR - R * 0.04;
    var chord = this.slices.length === 1 ? R : 2 * (R * 0.6) * Math.sin(Math.min(a, Math.PI) / 2);
    var size = Math.max(10, Math.min(R * 0.15, chord * 0.62));

    c.save();
    c.rotate(this.slices.length === 1 ? -Math.PI / 2 : mid);
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    var setFont = function (px) {
      c.font = '800 ' + px + 'px Archivo, "Arial Narrow", Arial, sans-serif';
      if ('fontStretch' in c) c.fontStretch = 'extra-condensed';
    };
    setFont(size);
    var wText = c.measureText(text).width;
    if (wText > room) {
      size = Math.max(9, size * room / wText);
      setFont(size);
      wText = c.measureText(text).width;
    }

    var plate = s.kit === 2 || s.kit === 3;
    var ink;
    if (s.kit != null) ink = s.kit === 0 ? col.bg : col.fg;
    else ink = s.tone === 'fg' ? col.bg : col.fg;

    if (plate) {
      var padX = size * 0.28, h = size * 1.08;
      c.fillStyle = col.bg;
      roundRect(c, outer - wText - padX, -h / 2, wText + padX * 2, h, size * 0.16);
      c.fill();
    }
    c.fillStyle = ink;
    c.fillText(text, outer, size * 0.04);
    c.restore();
  };

  Wheel.prototype.draw = function () {
    var c = this.ctx, W = this.size;
    if (!W || !this.colors) return;
    var col = this.colors;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, W);
    var R = W / 2 - Math.max(3, W * 0.012);
    var n = this.slices.length;
    c.save();
    c.translate(W / 2, W / 2);

    if (!n) {
      c.beginPath();
      c.arc(0, 0, R, 0, TAU);
      c.strokeStyle = col.fg;
      c.lineWidth = 2;
      c.stroke();
      c.restore();
      return;
    }

    var a = TAU / n, inset = Math.max(1.5, R * 0.012);
    for (var i = 0; i < n; i++) {
      var s = this.slices[i];
      var start = -Math.PI / 2 + this.rot + i * a, end = start + a, mid = start + a / 2;
      var path = this.slicePath.bind(this, c, R, start, end);
      if (s.kit != null) this.paintKit(c, s.kit, R, mid, inset, path);
      else if (s.tone === 'bg') this.paintKit(c, 1, R, mid, inset, path);
      else { path(); c.fillStyle = s.tone === 'alt' ? col.alt : col.fg; c.fill(); }
    }

    // Dilim ayraçları
    if (n > 1) {
      c.strokeStyle = col.bg;
      c.lineWidth = Math.max(2, R * 0.014);
      for (i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + this.rot + i * a;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(ang) * R, Math.sin(ang) * R);
        c.stroke();
      }
    }

    for (i = 0; i < n; i++) {
      var st = -Math.PI / 2 + this.rot + i * a;
      this.label(c, this.slices[i], R, st + a / 2, a);
    }

    // Kazanan dışındakileri karart
    if (this.hl >= 0 && this.hlA > 0 && n > 1) {
      c.globalAlpha = 0.64 * this.hlA;
      c.fillStyle = col.bg;
      for (i = 0; i < n; i++) {
        if (i === this.hl) continue;
        var s0 = -Math.PI / 2 + this.rot + i * a;
        this.slicePath(c, R, s0, s0 + a);
        c.fill();
      }
      c.globalAlpha = 1;
    }

    // Dış çember ve çiviler
    c.beginPath();
    c.arc(0, 0, R, 0, TAU);
    c.strokeStyle = col.fg;
    c.lineWidth = Math.max(2, R * 0.018);
    c.stroke();
    if (n > 1) {
      var pegR = Math.max(2, R * 0.022), pegAt = R - pegR * 2.4;
      for (i = 0; i < n; i++) {
        var pa = -Math.PI / 2 + this.rot + i * a;
        c.beginPath();
        c.arc(Math.cos(pa) * pegAt, Math.sin(pa) * pegAt, pegR, 0, TAU);
        c.fillStyle = col.bg;
        c.fill();
        c.lineWidth = Math.max(1.2, pegR * 0.5);
        c.strokeStyle = col.fg;
        c.stroke();
      }
    }

    // Göbek: mevki çarkında takımın forması
    var hub = R * 0.2;
    c.beginPath();
    c.arc(0, 0, hub, 0, TAU);
    c.fillStyle = col.bg;
    c.fill();
    c.lineWidth = Math.max(2, R * 0.016);
    c.strokeStyle = col.fg;
    c.stroke();
    if (this.hubKit != null) {
      var k = this.hubKit, ir = hub * 0.68;
      c.save();
      c.beginPath();
      c.arc(0, 0, ir, 0, TAU);
      c.clip();
      c.fillStyle = k === 0 ? col.fg : col.bg;
      c.fillRect(-ir, -ir, ir * 2, ir * 2);
      c.fillStyle = col.fg;
      var sw = ir / 3.5;
      if (k === 2) for (var x = -ir + sw / 2; x < ir; x += sw * 2) c.fillRect(x, -ir, sw, ir * 2);
      if (k === 3) for (var y = -ir + sw / 2; y < ir; y += sw * 2) c.fillRect(-ir, y, ir * 2, sw);
      c.restore();
      c.beginPath();
      c.arc(0, 0, ir, 0, TAU);
      c.lineWidth = Math.max(1.5, R * 0.01);
      c.strokeStyle = col.fg;
      c.stroke();
    } else {
      c.beginPath();
      c.arc(0, 0, R * 0.035, 0, TAU);
      c.fillStyle = col.fg;
      c.fill();
    }
    c.restore();
  };

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  root.KarmaWheel = Wheel;
})(window);
