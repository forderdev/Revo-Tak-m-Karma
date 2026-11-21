/*
 * Worker'dan bağımsız küçük yardımcılar. Node ile de test edilebilsin diye ayrı dosyada.
 */

// Sohbet mesajının ilk kelimesine bakar. !katil / !katıl → join, !ayril / !ayrıl → leave.
// Büyük harf, Türkçe İ/ı ve noktalı i farkları önemsenmez.
export function commandOf(text) {
  const first = String(text || '').trim().split(/\s+/)[0] || '';
  const w = first
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/̇/g, '');
  if (w === '!katil') return 'join';
  if (w === '!ayril') return 'leave';
  return null;
}

export function pemToDer(pem) {
  const b64 = String(pem)
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  return base64ToBytes(b64);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function importKickKey(pem) {
  return crypto.subtle.importKey(
    'spki',
    pemToDer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

// Kick imzası: base64( RSA-SHA256( `${messageId}.${timestamp}.${rawBody}` ) )
export async function verifyKickSignature(key, messageId, timestamp, rawBody, signatureB64) {
  if (!key || !messageId || !timestamp || !signatureB64) return false;
  let sig;
  try { sig = base64ToBytes(signatureB64); } catch (e) { return false; }
  const data = new TextEncoder().encode(`${messageId}.${timestamp}.${rawBody}`);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
}

export function slugOk(slug) {
  return /^[a-z0-9_-]{2,30}$/.test(slug);
}
