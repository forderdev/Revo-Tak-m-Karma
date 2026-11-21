import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { commandOf, importKickKey, verifyKickSignature, slugOk } from '../worker/src/lib.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test('commandOf: katıl/ayrıl yazımları', () => {
  for (const s of ['!katil', '!katıl', '!KATIL', '!KATİL', '  !Katıl  hadi', '!KaTiL']) assert.equal(commandOf(s), 'join', s);
  for (const s of ['!ayril', '!ayrıl', '!AYRIL', '!AYRİL']) assert.equal(commandOf(s), 'leave', s);
  for (const s of ['katil', '!katilim', 'selam !katil', '', null, '!']) assert.equal(commandOf(s), null, String(s));
});

test('slugOk', () => {
  assert.ok(slugOk('revo_tv'));
  assert.ok(!slugOk('a'));
  assert.ok(!slugOk('kick.com/revo'));
});

test('Kick imzası doğrulanır, değiştirilmiş gövde reddedilir', async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']
  );
  const spki = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey)).toString('base64');
  const pem = `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----\n`;
  const key = await importKickKey(pem);

  const id = '01JH0000TEST', ts = '2026-11-21T12:00:00Z', body = '{"content":"!katıl"}';
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey,
    new TextEncoder().encode(`${id}.${ts}.${body}`))).toString('base64');

  assert.equal(await verifyKickSignature(key, id, ts, body, sig), true);
  assert.equal(await verifyKickSignature(key, id, ts, body.replace('katıl', 'ayrıl'), sig), false);
  assert.equal(await verifyKickSignature(key, id, 'baska', body, sig), false);
  assert.equal(await verifyKickSignature(key, id, ts, body, 'bozuk!!'), false);
  assert.equal(await verifyKickSignature(key, null, ts, body, sig), false);
});
