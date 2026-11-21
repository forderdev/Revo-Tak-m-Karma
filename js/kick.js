/*
 * Kick sohbet bağlantısı. Sayfa sohbete yazmaz, sadece okur.
 * Akış: Worker /connect ile kanalı bulur ve abonelik açar, sonra /ws üzerinden
 * !katil ve !ayril olaylarını canlı iletir. Kurulum README dosyasında.
 */
(function (root) {
  'use strict';

  // Worker'ı kurduktan sonra adresini buraya yazarsan kimse ayarlardan girmek zorunda kalmaz.
  var DEFAULT_WORKER = '';

  function slugOf(input) {
    var s = String(input || '').trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '').replace(/^(www\.)?kick\.com\//, '').replace(/^@/, '');
    s = s.split(/[/?#]/)[0];
    return /^[a-z0-9_-]{2,30}$/.test(s) ? s : '';
  }

  function baseOf(url) {
    var u = String(url || DEFAULT_WORKER || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//.test(u)) u = 'https://' + u;
    return u;
  }

  function KickChat(handlers) {
    this.h = handlers || {};
    this.ws = null;
    this.manual = false;
    this.tries = 0;
    this.timer = 0;
    this.ping = 0;
    this.base = '';
    this.slug = '';
    this.broadcaster = null;
  }

  KickChat.prototype.status = function (kind, text) {
    if (this.h.onStatus) this.h.onStatus(kind, text);
  };

  KickChat.prototype.connect = function (channel, worker) {
    var self = this;
    this.disconnect(true);
    var slug = slugOf(channel), base = baseOf(worker);
    if (!slug) { this.status('error', 'Kanal adını kontrol et.'); return Promise.resolve(false); }
    if (!base) { this.status('error', 'Önce bağlantı sunucusunun adresini gir.'); return Promise.resolve(false); }
    this.manual = false;
    this.slug = slug;
    this.base = base;
    this.status('connecting', 'Bağlanıyor');

    return fetch(base + '/connect?channel=' + encodeURIComponent(slug))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || !j.broadcasterUserId) throw new Error(j.error || 'Sunucu yanıt vermedi.');
          return j;
        });
      })
      .then(function (j) {
        if (self.manual) return false;
        self.broadcaster = j.broadcasterUserId;
        self.open();
        return true;
      })
      .catch(function (e) {
        self.status('error', e && e.message ? e.message : 'Bağlanamadı.');
        return false;
      });
  };

  KickChat.prototype.open = function () {
    var self = this;
    var url = this.base.replace(/^http/, 'ws') + '/ws?b=' + encodeURIComponent(this.broadcaster);
    var ws;
    try { ws = new WebSocket(url); } catch (e) { this.retry(); return; }
    this.ws = ws;

    ws.onopen = function () {
      self.tries = 0;
      self.status('live', 'Bağlı: ' + self.slug);
      clearInterval(self.ping);
      self.ping = setInterval(function () { if (ws.readyState === 1) ws.send('ping'); }, 25000);
    };
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || !m.username) return;
      if (m.type === 'join' && self.h.onJoin) self.h.onJoin(m);
      if (m.type === 'leave' && self.h.onLeave) self.h.onLeave(m);
    };
    ws.onclose = function () {
      clearInterval(self.ping);
      if (self.ws === ws) self.ws = null;
      if (!self.manual) self.retry();
    };
    ws.onerror = function () { /* onclose ardından gelir */ };
  };

  KickChat.prototype.retry = function () {
    var self = this;
    this.tries++;
    var wait = Math.min(30000, 1000 * Math.pow(2, Math.min(this.tries, 5)));
    this.status('retry', 'Bağlantı koptu, tekrar deneniyor');
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { if (!self.manual) self.open(); }, wait);
  };

  KickChat.prototype.disconnect = function (silent) {
    this.manual = true;
    clearTimeout(this.timer);
    clearInterval(this.ping);
    if (this.ws) { try { this.ws.close(); } catch (e) { /* yok say */ } }
    this.ws = null;
    if (!silent) this.status('off', 'Bağlı değil');
  };

  KickChat.prototype.isActive = function () { return !this.manual; };

  root.KarmaKick = { KickChat: KickChat, slugOf: slugOf, DEFAULT_WORKER: DEFAULT_WORKER };
})(window);
