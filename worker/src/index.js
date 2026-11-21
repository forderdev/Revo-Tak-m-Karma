/*
 * Takım Karma için Kick sohbet köprüsü (Cloudflare Worker + Durable Object).
 *
 * GET  /connect?channel=slug  Kanalı bulur, chat.message.sent aboneliğini açar.
 * GET  /ws?b=<id>             Sitenin bağlandığı WebSocket. Sadece !katil / !ayril olaylarını iletir.
 * POST /webhook               Kick'in olay gönderdiği adres. İmza doğrulanmadan hiçbir şey iletilmez.
 *
 * Gizli değerler: KICK_CLIENT_ID, KICK_CLIENT_SECRET (wrangler secret put ile).
 * İsteğe bağlı değişkenler: ALLOWED_CHANNELS (virgülle kanal listesi), ALLOWED_ORIGINS (virgülle site adresleri).
 */
import { DurableObject } from 'cloudflare:workers';
import { commandOf, importKickKey, verifyKickSignature, slugOk } from './lib.js';

const API = 'https://api.kick.com/public/v1';
const TOKEN_URL = 'https://id.kick.com/oauth/token';
const EVENT = 'chat.message.sent';

let token = { value: '', exp: 0 };
let kickKey = { key: null, exp: 0 };
const subscribed = new Map(); // broadcaster id → aboneliği son doğruladığımız zaman

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    try {
      if (url.pathname === '/connect' && request.method === 'GET') return await connect(url, env, headers);
      if (url.pathname === '/ws') return socket(request, url, env);
      if (url.pathname === '/webhook' && request.method === 'POST') return await webhook(request, env, ctx);
      if (url.pathname === '/') return new Response('Takım Karma Kick köprüsü çalışıyor.', { headers });
      return json({ error: 'Bulunamadı.' }, 404, headers);
    } catch (e) {
      console.error(e && e.stack ? e.stack : e);
      return json({ error: 'Sunucuda bir hata oldu, biraz sonra tekrar dene.' }, 500, headers);
    }
  }
};

/* ---------- /connect ---------- */

async function connect(url, env, headers) {
  const slug = String(url.searchParams.get('channel') || '').trim().toLowerCase();
  if (!slugOk(slug)) return json({ error: 'Kanal adını kontrol et.' }, 400, headers);

  const allowed = list(env.ALLOWED_CHANNELS);
  if (allowed.length && !allowed.includes(slug)) {
    return json({ error: 'Bu kanal bu sunucuda açık değil.' }, 403, headers);
  }
  if (!env.KICK_CLIENT_ID || !env.KICK_CLIENT_SECRET) {
    return json({ error: 'Sunucuda Kick uygulama bilgileri eksik.' }, 500, headers);
  }

  const ch = await kick(env, `/channels?slug=${encodeURIComponent(slug)}`);
  const row = ch && Array.isArray(ch.data) ? ch.data[0] : null;
  const id = row && row.broadcaster_user_id;
  if (!id) return json({ error: 'Bu adla bir Kick kanalı bulunamadı.' }, 404, headers);

  const problem = await ensureSubscription(env, id);
  if (problem) return json({ error: problem }, 502, headers);

  return json({ broadcasterUserId: id, slug: row.slug || slug }, 200, headers);
}

async function ensureSubscription(env, id) {
  const last = subscribed.get(id) || 0;
  if (Date.now() - last < 10 * 60 * 1000) return null;

  let has = false;
  try {
    const cur = await kick(env, `/events/subscriptions?broadcaster_user_id=${id}`);
    const rows = cur && Array.isArray(cur.data) ? cur.data : [];
    has = rows.some(s => Number(s.broadcaster_user_id) === Number(id) && s.event === EVENT);
  } catch (e) {
    // Liste okunamazsa aboneliği açmayı deneriz; zaten varsa Kick bunu söyler.
    console.warn(e && e.message);
  }

  if (!has) {
    const res = await kick(env, '/events/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        broadcaster_user_id: Number(id),
        events: [{ name: EVENT, version: 1 }],
        method: 'webhook'
      })
    });
    const made = res && Array.isArray(res.data) ? res.data[0] : null;
    const already = made && made.error && /already|exist/i.test(String(made.error));
    if (!already && (!made || made.error || !made.subscription_id)) {
      return 'Kick sohbet aboneliği açılamadı' + (made && made.error ? `: ${made.error}` : '.');
    }
  }
  subscribed.set(id, Date.now());
  return null;
}

/* ---------- /ws ---------- */

function socket(request, url, env) {
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
    return new Response('WebSocket bekleniyordu.', { status: 426 });
  }
  const b = String(url.searchParams.get('b') || '');
  if (!/^\d{1,15}$/.test(b)) return new Response('Kanal kimliği eksik.', { status: 400 });
  const room = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(b));
  return room.fetch(request);
}

/* ---------- /webhook ---------- */

async function webhook(request, env, ctx) {
  const raw = await request.text();
  const h = request.headers;
  const messageId = h.get('Kick-Event-Message-Id');
  const timestamp = h.get('Kick-Event-Message-Timestamp');
  const signature = h.get('Kick-Event-Signature');
  const type = h.get('Kick-Event-Type');

  if (!(await signatureOk(messageId, timestamp, raw, signature))) {
    return new Response('İmza geçersiz.', { status: 401 });
  }
  if (type !== EVENT) return new Response('ok');

  let body;
  try { body = JSON.parse(raw); } catch (e) { return new Response('ok'); }

  const cmd = commandOf(body.content);
  const sender = body.sender || {};
  const b = body.broadcaster && body.broadcaster.user_id;
  if (!cmd || !sender.username || !b) return new Response('ok');

  const badges = sender.identity && Array.isArray(sender.identity.badges)
    ? sender.identity.badges.map(x => x && x.type).filter(Boolean)
    : [];

  const room = env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName(String(b)));
  ctx.waitUntil(room.fetch('https://room/broadcast', {
    method: 'POST',
    body: JSON.stringify({
      id: body.message_id || messageId,
      type: cmd,
      username: sender.username,
      userId: sender.user_id,
      badges
    })
  }));
  return new Response('ok');
}

async function signatureOk(messageId, timestamp, raw, signature) {
  // Anahtar Kick tarafında değişmiş olabilir; ilk deneme tutmazsa bir kez taze anahtarla dener.
  for (let fresh = 0; fresh < 2; fresh++) {
    const key = await publicKey(fresh === 1);
    if (await verifyKickSignature(key, messageId, timestamp, raw, signature)) return true;
  }
  return false;
}

async function publicKey(force) {
  if (!force && kickKey.key && kickKey.exp > Date.now()) return kickKey.key;
  const r = await fetch(`${API}/public-key`);
  if (!r.ok) return kickKey.key;
  const j = await r.json();
  const pem = j && j.data && j.data.public_key;
  if (!pem) return kickKey.key;
  kickKey = { key: await importKickKey(pem), exp: Date.now() + 6 * 60 * 60 * 1000 };
  return kickKey.key;
}

/* ---------- Kick API ---------- */

async function appToken(env, force) {
  if (!force && token.value && token.exp > Date.now()) return token.value;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.KICK_CLIENT_ID,
      client_secret: env.KICK_CLIENT_SECRET
    })
  });
  if (!r.ok) throw new Error(`Kick token isteği başarısız: ${r.status}`);
  const j = await r.json();
  token = { value: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000 };
  return token.value;
}

async function kick(env, path, init) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const t = await appToken(env, attempt === 1);
    const r = await fetch(API + path, {
      ...(init || {}),
      headers: { Authorization: `Bearer ${t}`, Accept: 'application/json', 'Content-Type': 'application/json' }
    });
    if (r.status === 401 && attempt === 0) continue;
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`Kick API ${path} → ${r.status} ${text.slice(0, 200)}`);
    }
    return r.json();
  }
  return null;
}

/* ---------- Yardımcılar ---------- */

function list(v) {
  return String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = list(env.ALLOWED_ORIGINS);
  const allow = !allowed.length ? '*' : (allowed.includes(origin.toLowerCase()) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

/* ---------- Durable Object: her kanal için bir oda ---------- */

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.seen = [];
    // Sitenin 25 saniyede bir gönderdiği ping, nesneyi uyandırmadan yanıtlanır.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const m = await request.json();
      if (m.id) {
        if (this.seen.includes(m.id)) return new Response('tekrar');
        this.seen.push(m.id);
        if (this.seen.length > 300) this.seen.splice(0, this.seen.length - 300);
      }
      const out = JSON.stringify({ type: m.type, username: m.username, userId: m.userId, badges: m.badges || [] });
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.send(out); } catch (e) { /* kapanmış bağlantı */ }
      }
      return new Response('ok');
    }

    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  webSocketMessage() { /* site sadece dinler */ }

  webSocketClose(ws, code, reason) {
    try { ws.close(code, reason); } catch (e) { /* zaten kapalı */ }
  }

  webSocketError(ws) {
    try { ws.close(1011, 'hata'); } catch (e) { /* zaten kapalı */ }
  }
}
