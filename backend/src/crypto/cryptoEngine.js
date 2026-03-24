'use strict';
/**
 * CipherCloud Crypto Engine
 * ══════════════════════════════════════════════════════════════
 * Algorithms implemented:
 *  1. AES-256-GCM        — authenticated symmetric encryption
 *  2. ChaCha20-Poly1305  — alternative AEAD cipher
 *  3. RSA-4096 OAEP      — asymmetric key wrapping
 *  4. PBKDF2-SHA512      — password-based key derivation
 *  5. HKDF-SHA256        — key expansion / context binding
 *  6. ECDH P-384         — ephemeral key exchange (share links)
 *  7. HMAC-SHA256        — file integrity signatures
 *  8. Envelope encryption — DEK encrypted by KEK (+ KMS layer)
 * ══════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

// ── Constants ────────────────────────────────────────────────
const AES_KEY_SIZE    = 32;   // 256-bit
const AES_IV_SIZE     = 16;   // 128-bit IV
const AES_TAG_LEN     = 16;   // 128-bit GCM auth tag
const CHACHA_KEY_SIZE = 32;   // 256-bit
const CHACHA_NONCE    = 12;   // 96-bit nonce
const RSA_KEY_BITS    = 4096;
const PBKDF2_ITER     = parseInt(process.env.PBKDF2_ITERATIONS) || 310000;
const PBKDF2_LEN      = 32;
const PBKDF2_DIGEST   = 'sha512';
const SALT_SIZE       = 32;
const HMAC_ALGO       = 'sha256';

// ── Utilities ────────────────────────────────────────────────

const randomBytes  = (n) => crypto.randomBytes(n);
const toHex        = (b) => Buffer.isBuffer(b) ? b.toString('hex') : b;
const fromHex      = (h) => Buffer.from(h, 'hex');
const toB64        = (b) => Buffer.isBuffer(b) ? b.toString('base64') : b;
const fromB64      = (s) => Buffer.from(s, 'base64');

/** Constant-time comparison — prevents timing attacks */
function safeCompare(a, b) {
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(String(a));
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ════════════════════════════════════════════════════════
//  1. AES-256-GCM  —  primary symmetric cipher
// ════════════════════════════════════════════════════════

/**
 * Encrypt buffer with AES-256-GCM.
 * AAD (additional authenticated data) is bound into the auth tag
 * so changing metadata also invalidates the ciphertext.
 */
function aesEncrypt(plaintext, key, aad = '') {
  if (!Buffer.isBuffer(key) || key.length !== AES_KEY_SIZE)
    throw new Error(`AES key must be ${AES_KEY_SIZE} bytes`);

  const iv     = randomBytes(AES_IV_SIZE);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  if (aad) cipher.setAAD(Buffer.from(aad, 'utf8'), { plaintextLength: plaintext.length });

  const ct  = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext : toB64(ct),
    iv         : toHex(iv),
    tag        : toHex(tag),
    aad        : aad || null,
    algo       : 'aes-256-gcm',
  };
}

/**
 * Decrypt AES-256-GCM.
 * Throws if auth tag fails — means data was tampered.
 */
function aesDecrypt({ ciphertext, iv, tag, aad = '' }, key) {
  if (!Buffer.isBuffer(key) || key.length !== AES_KEY_SIZE)
    throw new Error(`AES key must be ${AES_KEY_SIZE} bytes`);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, fromHex(iv));
  decipher.setAuthTag(fromHex(tag));

  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));

  try {
    return Buffer.concat([decipher.update(fromB64(ciphertext)), decipher.final()]);
  } catch {
    throw new Error('AES-256-GCM: authentication tag mismatch — file may be tampered');
  }
}

// ════════════════════════════════════════════════════════
//  2. ChaCha20-Poly1305  —  mobile / software fallback
// ════════════════════════════════════════════════════════

function chachaEncrypt(plaintext, key) {
  if (!Buffer.isBuffer(key) || key.length !== CHACHA_KEY_SIZE)
    throw new Error('ChaCha20 key must be 32 bytes');

  const nonce  = randomBytes(CHACHA_NONCE);
  const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  const ct     = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag    = cipher.getAuthTag();

  return { ciphertext: toB64(ct), nonce: toHex(nonce), tag: toHex(tag), algo: 'chacha20-poly1305' };
}

function chachaDecrypt({ ciphertext, nonce, tag }, key) {
  const d = crypto.createDecipheriv('chacha20-poly1305', key, fromHex(nonce), { authTagLength: 16 });
  d.setAuthTag(fromHex(tag));
  try {
    return Buffer.concat([d.update(fromB64(ciphertext)), d.final()]);
  } catch {
    throw new Error('ChaCha20-Poly1305: authentication failed');
  }
}

// ════════════════════════════════════════════════════════
//  3. RSA-4096 OAEP  —  asymmetric key wrapping
// ════════════════════════════════════════════════════════

/** Generate RSA-4096 key pair (async — key gen is slow) */
async function generateRSAKeyPair() {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair('rsa', {
      modulusLength       : RSA_KEY_BITS,
      publicKeyEncoding  : { type: 'spki',  format: 'pem' },
      privateKeyEncoding : { type: 'pkcs8', format: 'pem' },
    }, (err, pub, priv) => {
      if (err) reject(err);
      else resolve({ publicKey: pub, privateKey: priv });
    });
  });
}

/** Wrap a symmetric key (DEK) with an RSA public key */
function rsaWrapKey(symmetricKeyBuf, publicKeyPem) {
  return crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    symmetricKeyBuf
  ).toString('base64');
}

/** Unwrap a wrapped symmetric key with an RSA private key */
function rsaUnwrapKey(wrappedB64, privateKeyPem) {
  return crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(wrappedB64, 'base64')
  );
}

// ════════════════════════════════════════════════════════
//  4. PBKDF2-SHA512  —  password → encryption key
// ════════════════════════════════════════════════════════

/**
 * Derive a 256-bit key from a user password.
 * 310,000 iterations ≈ 1 second on modern hardware.
 * Returns { key (Buffer), salt (hex), iterations, digest }
 */
async function deriveKeyFromPassword(password, salt = null) {
  const saltBuf = salt ? fromHex(salt) : randomBytes(SALT_SIZE);
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, saltBuf, PBKDF2_ITER, PBKDF2_LEN, PBKDF2_DIGEST, (err, key) => {
      if (err) reject(err);
      else resolve({ key, salt: toHex(saltBuf), iterations: PBKDF2_ITER, digest: PBKDF2_DIGEST });
    });
  });
}

/** Hash password for storage: pbkdf2$iter$salt$hash */
async function hashPassword(password) {
  const { key, salt } = await deriveKeyFromPassword(password);
  return `pbkdf2$${PBKDF2_ITER}$${salt}$${toHex(key)}`;
}

/** Verify password against stored PBKDF2 hash */
async function verifyPassword(password, stored) {
  const [, , salt, expectedHex] = stored.split('$');
  const { key } = await deriveKeyFromPassword(password, salt);
  return safeCompare(key, fromHex(expectedHex));
}

// ════════════════════════════════════════════════════════
//  5. HKDF-SHA256  —  key expansion
// ════════════════════════════════════════════════════════

/**
 * Expand key material into a derived key with context binding.
 * Produces different keys for each (purpose, context) pair
 * even from the same root key material.
 */
function hkdfExpand(ikm, salt, info, length = 32) {
  const saltBuf = salt ? (Buffer.isBuffer(salt) ? salt : Buffer.from(salt)) : randomBytes(32);
  const infoBuf = Buffer.from(info || '');
  return crypto.hkdfSync('sha256', Buffer.isBuffer(ikm) ? ikm : Buffer.from(ikm), saltBuf, infoBuf, length);
}

/** Derive a per-file key from a vault master key */
function deriveFileKey(vaultKey, fileId) {
  return Buffer.from(hkdfExpand(vaultKey, null, `ciphercloud-file-${fileId}`, 32));
}

/** Derive a per-vault key from user master key */
function deriveVaultKey(userKey, vaultId) {
  return Buffer.from(hkdfExpand(userKey, null, `ciphercloud-vault-${vaultId}`, 32));
}

// ════════════════════════════════════════════════════════
//  6. ECDH P-384  —  ephemeral key exchange (share links)
// ════════════════════════════════════════════════════════

/** Generate ECDH P-384 ephemeral key pair */
function generateECDHKeyPair() {
  const ecdh = crypto.createECDH('prime384v1');
  ecdh.generateKeys();
  return {
    privateKey : ecdh.getPrivateKey('hex'),
    publicKey  : ecdh.getPublicKey('hex', 'compressed'),
  };
}

/**
 * Compute shared AES key from ECDH exchange.
 * Sender has: senderPrivKey + recipientPubKey → sharedKey
 * Recipient has: recipientPrivKey + senderPubKey → same sharedKey
 * Neither party transmits the shared key over the network.
 */
function computeECDHSharedKey(privateKeyHex, remotePublicKeyHex, context = '') {
  const ecdh = crypto.createECDH('prime384v1');
  ecdh.setPrivateKey(fromHex(privateKeyHex));
  const sharedSecret = ecdh.computeSecret(fromHex(remotePublicKeyHex));
  return Buffer.from(hkdfExpand(sharedSecret, null, `ciphercloud-share-${context}`, 32));
}

// ════════════════════════════════════════════════════════
//  7. HMAC-SHA256  —  integrity signatures
// ════════════════════════════════════════════════════════

/** Compute HMAC-SHA256 over file ciphertext for integrity verification */
function computeHMAC(data, key) {
  const keyBuf = Buffer.isBuffer(key) ? key : fromHex(key);
  return crypto.createHmac(HMAC_ALGO, keyBuf).update(data).digest('hex');
}

function verifyHMAC(data, key, expectedHex) {
  const computed = computeHMAC(data, key);
  return safeCompare(computed, expectedHex);
}

// ════════════════════════════════════════════════════════
//  8. Envelope Encryption  —  DEK + KEK model
// ════════════════════════════════════════════════════════

/**
 * Generate a new Data Encryption Key (DEK).
 * DEK encrypts the actual file content.
 * DEK is then wrapped by a Key Encryption Key (KEK).
 * KEK is derived from the user's password via PBKDF2.
 * KMS re-encrypts the wrapped DEK as a second protection layer.
 */
function generateDEK() {
  return randomBytes(AES_KEY_SIZE);
}

/**
 * Full envelope encrypt: plaintext → ciphertext + wrapped DEK
 * Returns everything needed to decrypt later (except the password).
 */
async function envelopeEncrypt(plaintext, password, fileId, algo = 'aes-256-gcm') {
  // Step 1: Derive KEK from password
  const { key: kek, salt } = await deriveKeyFromPassword(password);

  // Step 2: Generate random DEK
  const dek = generateDEK();

  // Step 3: Derive file-specific key using HKDF
  const fileKey = deriveFileKey(dek, fileId);

  // Step 4: Encrypt plaintext with file key
  let encrypted;
  if (algo === 'chacha20-poly1305') {
    encrypted = chachaEncrypt(plaintext, fileKey);
  } else {
    encrypted = aesEncrypt(plaintext, fileKey, `file:${fileId}`);
  }

  // Step 5: Wrap DEK with KEK (AES-256-GCM wrapping)
  const wrappedDEK = aesEncrypt(dek, kek, `dek:${fileId}`);

  // Step 6: HMAC over ciphertext for integrity
  const hmacKey  = Buffer.from(hkdfExpand(fileKey, null, 'ciphercloud-hmac', 32));
  const integrity = computeHMAC(Buffer.from(encrypted.ciphertext), hmacKey);

  return {
    encrypted,
    wrappedDEK,
    kekSalt    : salt,
    integrity,
    algo,
    version    : '1.0',
  };
}

/**
 * Full envelope decrypt: ciphertext + wrapped DEK + password → plaintext
 */
async function envelopeDecrypt(envelope, password, fileId) {
  const { encrypted, wrappedDEK, kekSalt, integrity, algo } = envelope;

  // Step 1: Re-derive KEK from password
  const { key: kek } = await deriveKeyFromPassword(password, kekSalt);

  // Step 2: Unwrap DEK
  const dek = aesDecrypt(wrappedDEK, kek);

  // Step 3: Re-derive file key
  const fileKey = deriveFileKey(dek, fileId);

  // Step 4: Verify integrity
  const hmacKey = Buffer.from(hkdfExpand(fileKey, null, 'ciphercloud-hmac', 32));
  if (!verifyHMAC(Buffer.from(encrypted.ciphertext), hmacKey, integrity)) {
    throw new Error('Integrity check failed — file may have been tampered with');
  }

  // Step 5: Decrypt
  if (algo === 'chacha20-poly1305') {
    return chachaDecrypt(encrypted, fileKey);
  }
  return aesDecrypt(encrypted, fileKey);
}

// ════════════════════════════════════════════════════════
//  Secure Share Link generation (ECDH based)
// ════════════════════════════════════════════════════════

/**
 * Create a secure, time-limited share token.
 * Uses ECDH to produce a shared key without transmitting it.
 */
function createShareToken(fileId, dekWrapped, expiresInSeconds = 3600) {
  const { privateKey, publicKey } = generateECDHKeyPair();
  const shareId   = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + expiresInSeconds * 1000;

  // Re-wrap DEK for this specific share using ECDH-derived key
  const shareKey  = computeECDHSharedKey(privateKey, publicKey, shareId);
  const sharedDEK = aesEncrypt(Buffer.from(JSON.stringify(dekWrapped)), shareKey, `share:${shareId}`);

  return {
    shareId,
    publicKey,   // stored on server
    privateKey,  // embedded in share link (sent to recipient)
    sharedDEK,
    fileId,
    expiresAt,
    token: toB64(Buffer.from(JSON.stringify({ shareId, privateKey, fileId }))),
  };
}

/** Utility: generate cryptographically secure random token */
function generateSecureToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** Generate a TOTP secret for 2FA */
function generateTOTPSecret() {
  return randomBytes(20).toString('base64').replace(/[^A-Z2-7]/gi, 'A').toUpperCase();
}

module.exports = {
  // AES-256-GCM
  aesEncrypt, aesDecrypt,
  // ChaCha20-Poly1305
  chachaEncrypt, chachaDecrypt,
  // RSA-4096
  generateRSAKeyPair, rsaWrapKey, rsaUnwrapKey,
  // PBKDF2
  deriveKeyFromPassword, hashPassword, verifyPassword,
  // HKDF
  hkdfExpand, deriveFileKey, deriveVaultKey,
  // ECDH
  generateECDHKeyPair, computeECDHSharedKey,
  // HMAC
  computeHMAC, verifyHMAC,
  // Envelope encryption
  generateDEK, envelopeEncrypt, envelopeDecrypt,
  // Share tokens
  createShareToken,
  // Utilities
  generateSecureToken, generateTOTPSecret, safeCompare, randomBytes, toHex, fromHex,
  CONSTANTS: { AES_KEY_SIZE, PBKDF2_ITER, PBKDF2_DIGEST },
};
