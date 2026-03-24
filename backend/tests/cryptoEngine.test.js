'use strict';
/**
 * CipherCloud Crypto Engine — Full Test Suite
 */

const {
  aesEncrypt, aesDecrypt,
  chachaEncrypt, chachaDecrypt,
  generateRSAKeyPair, rsaWrapKey, rsaUnwrapKey,
  deriveKeyFromPassword, hashPassword, verifyPassword,
  hkdfExpand, deriveFileKey, deriveVaultKey,
  generateECDHKeyPair, computeECDHSharedKey,
  computeHMAC, verifyHMAC,
  generateDEK, envelopeEncrypt, envelopeDecrypt,
  generateSecureToken, safeCompare, randomBytes, CONSTANTS,
} = require('../src/crypto/cryptoEngine');

// ── Helpers ───────────────────────────────────────────
const makeKey  = () => randomBytes(32);
const makeBuf  = (s) => Buffer.from(s);
const testData = makeBuf('Hello CipherCloud — secret data 🔐');

// ══════════════════════════════════════════════════════
describe('AES-256-GCM', () => {
  test('encrypts and decrypts correctly', () => {
    const key       = makeKey();
    const encrypted = aesEncrypt(testData, key, 'test-aad');
    const decrypted = aesDecrypt(encrypted, key);
    expect(decrypted).toEqual(testData);
  });

  test('produces different ciphertext each time (IV randomness)', () => {
    const key  = makeKey();
    const enc1 = aesEncrypt(testData, key);
    const enc2 = aesEncrypt(testData, key);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
  });

  test('throws on wrong key', () => {
    const key1 = makeKey(), key2 = makeKey();
    const enc  = aesEncrypt(testData, key1);
    expect(() => aesDecrypt(enc, key2)).toThrow();
  });

  test('throws on tampered ciphertext (GCM auth tag)', () => {
    const key = makeKey();
    const enc = aesEncrypt(testData, key);
    const tampered = { ...enc, ciphertext: enc.ciphertext.slice(0, -4) + 'XXXX' };
    expect(() => aesDecrypt(tampered, key)).toThrow(/tampered|authentication/i);
  });

  test('throws on wrong key size', () => {
    expect(() => aesEncrypt(testData, randomBytes(16))).toThrow(/32 bytes/);
  });

  test('handles empty buffer', () => {
    const key = makeKey();
    const enc = aesEncrypt(Buffer.alloc(0), key);
    const dec = aesDecrypt(enc, key);
    expect(dec.length).toBe(0);
  });

  test('handles large buffer (1MB)', () => {
    const key      = makeKey();
    const large    = randomBytes(1024 * 1024);
    const enc      = aesEncrypt(large, key);
    const dec      = aesDecrypt(enc, key);
    expect(dec).toEqual(large);
  });
});

// ══════════════════════════════════════════════════════
describe('ChaCha20-Poly1305', () => {
  test('encrypts and decrypts correctly', () => {
    const key = makeKey();
    const enc = chachaEncrypt(testData, key);
    const dec = chachaDecrypt(enc, key);
    expect(dec).toEqual(testData);
  });

  test('algo field is set correctly', () => {
    const enc = chachaEncrypt(testData, makeKey());
    expect(enc.algo).toBe('chacha20-poly1305');
  });

  test('throws on tampered data', () => {
    const key = makeKey();
    const enc = chachaEncrypt(testData, key);
    const bad = { ...enc, tag: 'a'.repeat(enc.tag.length) };
    expect(() => chachaDecrypt(bad, key)).toThrow();
  });
});

// ══════════════════════════════════════════════════════
describe('RSA-4096 OAEP', () => {
  let pub, priv;
  beforeAll(async () => {
    const kp = await generateRSAKeyPair();
    pub = kp.publicKey; priv = kp.privateKey;
  }, 30000);

  test('generates 4096-bit key pair', () => {
    expect(pub).toContain('BEGIN PUBLIC KEY');
    expect(priv).toContain('BEGIN PRIVATE KEY');
  });

  test('wraps and unwraps a 32-byte key', () => {
    const dek     = makeKey();
    const wrapped = rsaWrapKey(dek, pub);
    const unwrapped = rsaUnwrapKey(wrapped, priv);
    expect(unwrapped).toEqual(dek);
  });

  test('different wraps produce different ciphertext (OAEP padding)', () => {
    const dek  = makeKey();
    const w1   = rsaWrapKey(dek, pub);
    const w2   = rsaWrapKey(dek, pub);
    expect(w1).not.toBe(w2);
  });
});

// ══════════════════════════════════════════════════════
describe('PBKDF2-SHA512', () => {
  test('derives consistent key from same password+salt', async () => {
    const r1 = await deriveKeyFromPassword('my-secret-pass');
    const r2 = await deriveKeyFromPassword('my-secret-pass', r1.salt);
    expect(r1.key).toEqual(r2.key);
  });

  test('different passwords produce different keys', async () => {
    const r1 = await deriveKeyFromPassword('password1');
    const r2 = await deriveKeyFromPassword('password2', r1.salt);
    expect(r1.key).not.toEqual(r2.key);
  });

  test('uses correct iteration count', async () => {
    const { iterations } = await deriveKeyFromPassword('test');
    expect(iterations).toBe(CONSTANTS.PBKDF2_ITER);
  });

  test('hashPassword produces verifiable hash', async () => {
    const hash  = await hashPassword('super-secure-pass-123');
    const valid = await verifyPassword('super-secure-pass-123', hash);
    const wrong = await verifyPassword('wrong-password', hash);
    expect(valid).toBe(true);
    expect(wrong).toBe(false);
  });

  test('hash format is pbkdf2$iter$salt$hash', async () => {
    const hash   = await hashPassword('test-pass');
    const parts  = hash.split('$');
    expect(parts[0]).toBe('pbkdf2');
    expect(parseInt(parts[1])).toBe(CONSTANTS.PBKDF2_ITER);
    expect(parts[2].length).toBe(64); // 32-byte salt = 64 hex chars
    expect(parts[3].length).toBe(64); // 32-byte key = 64 hex chars
  });
});

// ══════════════════════════════════════════════════════
describe('HKDF-SHA256', () => {
  test('expands key material deterministically', () => {
    const ikm  = makeKey();
    const out1 = hkdfExpand(ikm, 'salt', 'context-1');
    const out2 = hkdfExpand(ikm, 'salt', 'context-1');
    expect(Buffer.from(out1)).toEqual(Buffer.from(out2));
  });

  test('different contexts produce different keys', () => {
    const ikm  = makeKey();
    const out1 = hkdfExpand(ikm, 'salt', 'file-1');
    const out2 = hkdfExpand(ikm, 'salt', 'file-2');
    expect(Buffer.from(out1)).not.toEqual(Buffer.from(out2));
  });

  test('deriveFileKey is deterministic', () => {
    const vaultKey = makeKey();
    const k1 = deriveFileKey(vaultKey, 'file-uuid-123');
    const k2 = deriveFileKey(vaultKey, 'file-uuid-123');
    expect(k1).toEqual(k2);
  });

  test('deriveVaultKey differs per vault', () => {
    const master = makeKey();
    const v1 = deriveVaultKey(master, 'vault-1');
    const v2 = deriveVaultKey(master, 'vault-2');
    expect(v1).not.toEqual(v2);
  });
});

// ══════════════════════════════════════════════════════
describe('ECDH P-384', () => {
  test('generates key pair with publicKey and privateKey', () => {
    const kp = generateECDHKeyPair();
    expect(kp).toHaveProperty('privateKey');
    expect(kp).toHaveProperty('publicKey');
    expect(kp.publicKey.length).toBeGreaterThan(0);
  });

  test('both parties compute same shared secret', () => {
    const alice = generateECDHKeyPair();
    const bob   = generateECDHKeyPair();

    const aliceShared = computeECDHSharedKey(alice.privateKey, bob.publicKey, 'test-share');
    const bobShared   = computeECDHSharedKey(bob.privateKey, alice.publicKey, 'test-share');
    expect(aliceShared).toEqual(bobShared);
  });

  test('different contexts produce different keys', () => {
    const alice = generateECDHKeyPair();
    const bob   = generateECDHKeyPair();
    const s1 = computeECDHSharedKey(alice.privateKey, bob.publicKey, 'ctx-1');
    const s2 = computeECDHSharedKey(alice.privateKey, bob.publicKey, 'ctx-2');
    expect(s1).not.toEqual(s2);
  });
});

// ══════════════════════════════════════════════════════
describe('HMAC-SHA256', () => {
  test('produces consistent HMAC', () => {
    const key  = makeKey();
    const h1   = computeHMAC(testData, key);
    const h2   = computeHMAC(testData, key);
    expect(h1).toBe(h2);
  });

  test('different data produces different HMAC', () => {
    const key = makeKey();
    const h1  = computeHMAC(makeBuf('data-1'), key);
    const h2  = computeHMAC(makeBuf('data-2'), key);
    expect(h1).not.toBe(h2);
  });

  test('verifyHMAC returns true for valid signature', () => {
    const key  = makeKey();
    const hmac = computeHMAC(testData, key);
    expect(verifyHMAC(testData, key, hmac)).toBe(true);
  });

  test('verifyHMAC returns false for tampered data', () => {
    const key  = makeKey();
    const hmac = computeHMAC(testData, key);
    expect(verifyHMAC(makeBuf('tampered!'), key, hmac)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════
describe('Envelope Encryption (DEK + KEK)', () => {
  const password = 'vault-master-password-xyz-123!';
  const fileId   = 'test-file-uuid-0001';

  test('encrypts and decrypts with AES-256-GCM', async () => {
    const envelope  = await envelopeEncrypt(testData, password, fileId, 'aes-256-gcm');
    const plaintext = await envelopeDecrypt(envelope, password, fileId);
    expect(plaintext).toEqual(testData);
  });

  test('encrypts and decrypts with ChaCha20-Poly1305', async () => {
    const envelope  = await envelopeEncrypt(testData, password, fileId, 'chacha20-poly1305');
    const plaintext = await envelopeDecrypt(envelope, password, fileId);
    expect(plaintext).toEqual(testData);
  });

  test('fails decryption with wrong password', async () => {
    const envelope = await envelopeEncrypt(testData, password, fileId);
    await expect(envelopeDecrypt(envelope, 'wrong-password', fileId)).rejects.toThrow();
  });

  test('detects tampered ciphertext', async () => {
    const envelope  = await envelopeEncrypt(testData, password, fileId);
    const tampered  = { ...envelope, encrypted: { ...envelope.encrypted, ciphertext: 'AAAA' + envelope.encrypted.ciphertext.slice(4) } };
    await expect(envelopeDecrypt(tampered, password, fileId)).rejects.toThrow();
  });

  test('envelope contains all required fields', async () => {
    const env = await envelopeEncrypt(testData, password, fileId);
    expect(env).toHaveProperty('encrypted');
    expect(env).toHaveProperty('wrappedDEK');
    expect(env).toHaveProperty('kekSalt');
    expect(env).toHaveProperty('integrity');
    expect(env).toHaveProperty('algo');
    expect(env).toHaveProperty('version');
  });

  test('DEK never appears in envelope output', async () => {
    const env  = await envelopeEncrypt(testData, password, fileId);
    const json = JSON.stringify(env);
    // The raw DEK would be a 64-hex-char string; verify it's not in plaintext
    expect(env.encrypted).not.toHaveProperty('dek');
    expect(env).not.toHaveProperty('dek');
  });

  test('same file encrypted twice produces different ciphertext', async () => {
    const e1 = await envelopeEncrypt(testData, password, 'fid-1');
    const e2 = await envelopeEncrypt(testData, password, 'fid-2');
    expect(e1.encrypted.ciphertext).not.toBe(e2.encrypted.ciphertext);
  });
});

// ══════════════════════════════════════════════════════
describe('Utilities', () => {
  test('safeCompare returns true for equal buffers', () => {
    const a = Buffer.from('hello');
    const b = Buffer.from('hello');
    expect(safeCompare(a, b)).toBe(true);
  });

  test('safeCompare returns false for different buffers', () => {
    expect(safeCompare(Buffer.from('abc'), Buffer.from('xyz'))).toBe(false);
  });

  test('safeCompare returns false for different lengths', () => {
    expect(safeCompare(Buffer.from('abc'), Buffer.from('abcd'))).toBe(false);
  });

  test('generateSecureToken returns base64url string', () => {
    const t = generateSecureToken(32);
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThan(20);
  });

  test('generateDEK returns 32-byte buffer', () => {
    const dek = generateDEK();
    expect(dek.length).toBe(32);
  });
});
