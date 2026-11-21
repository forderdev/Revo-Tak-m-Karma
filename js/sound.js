/*
 * Sesler WebAudio ile üretilir, dosya yok.
 * Tık: çarkın çivisine çarpan dil. Duruş: kısa iki nota. Bitiş: küçük arpej.
 */
(function (root) {
  'use strict';

  var ctx = null, master = null, noise = null;
  var enabled = true, lastTick = 0;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    var len = Math.floor(ctx.sampleRate * 0.03);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noise.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    return ctx;
  }

  function ready() {
    if (!enabled) return null;
    var c = ensure();
    if (!c) return null;
    if (c.state === 'suspended') c.resume();
    return c.state === 'closed' ? null : c;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function tick(strength) {
    var c = ready();
    if (!c) return;
    var now = c.currentTime;
    if (now - lastTick < 0.028) return;
    lastTick = now;
    var k = strength == null ? 1 : Math.max(0.25, Math.min(1, strength));

    var src = c.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    var bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2300 + Math.random() * 600;
    bp.Q.value = 2.5;
    var g = c.createGain();
    g.gain.value = 0.7 * k;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(now);
  }

  function tone(freq, at, dur, vol, type) {
    var c = ready();
    if (!c) return;
    var t0 = c.currentTime + at;
    var o = c.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function land() {
    tone(98, 0, 0.16, 0.35, 'sine');
    tone(587.33, 0, 0.32, 0.16, 'triangle');
    tone(880, 0.075, 0.5, 0.13, 'sine');
  }

  function done() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      tone(f, i * 0.09, 0.55, 0.12, 'triangle');
    });
  }

  root.KarmaSound = {
    unlock: unlock,
    tick: tick,
    land: land,
    done: done,
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; }
  };
})(window);
