'use strict';
// ═══════════════════════════════════════════════════════
// FEATURE 12 — END-TO-END ENCRYPTION
// File: C:\Projects\securevault\backend\src\routes\e2e.js
// ═══════════════════════════════════════════════════════
// How it works:
// 1. Client generates AES key in browser (Web Crypto API)
// 2. Client encrypts file in browser BEFORE sending
// 3. Server only ever receives encrypted bytes
// 4. Server stores encrypted data — never sees plaintext
// 5. Decryption also happens in browser
// ═══════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');

let _pool = null;
async function q(sql, p = []) {
  if (!_pool) {
    const db = require('../services/localDB');
    // Try all possible ways pool might be exported
    _pool = db.pool || db.default?.pool || db.getPool?.() || null;
    if (!_pool) {
      // Last resort — create pool directly
      const mysql = require('mysql2/promise');
      _pool = mysql.createPool({
        host:     process.env.DB_HOST     || 'localhost',
        port:     process.env.DB_PORT     || 3306,
        database: process.env.DB_NAME     || 'ciphercloud',
        user:     process.env.DB_USER     || 'root',
        password: process.env.DB_PASSWORD || '',
      });
    }
  }
  const [rows] = await _pool.query(sql, p);
  return rows;
}
async function q1(sql, p = []) { return (await q(sql, p))[0] || null; }

let db;
function getDB() { if (!db) db = require('../services/localDB'); return db; }
async function q(sql, p=[]) {
  const dbModule = getDB();
  const pool = dbModule.pool || (dbModule.default && dbModule.default.pool);
  if (!pool) throw new Error('Database pool not available');
  const [r] = await pool.query(sql, p);
  return r;
}
async function q1(sql, p=[]) { return (await q(sql,p))[0]||null; }

// ── Get E2E status for user ───────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await q1('SELECT * FROM users WHERE userId=?', [userId]);
    res.json({
      e2eEnabled: !!(user && user.e2eEnabled),
      userId,
      message: 'E2E encryption adds an extra layer of client-side encryption'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Generate server-side E2E key material ────────────
router.post('/generate-key', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    // Generate a random salt for this user's E2E key derivation
    const salt = crypto.randomBytes(32).toString('hex');
    const iv   = crypto.randomBytes(16).toString('hex');

    // Store salt in user record (used for PBKDF2 key derivation on client)
    try {
      await q('ALTER TABLE users ADD COLUMN e2eSalt VARCHAR(64)', []);
    } catch(e) {} // ignore if already exists

    await q('UPDATE users SET e2eSalt=? WHERE userId=?', [salt, userId]);

    res.json({
      success: true,
      salt,
      iv,
      iterations: 100000,
      algorithm: 'AES-256-GCM',
      message: 'Use these params with Web Crypto API to derive your E2E key'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get E2E params for user (salt etc) ───────────────
router.get('/params', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    // Try to get e2eSalt column
    let salt = null;
    try {
      const user = await q1('SELECT e2eSalt FROM users WHERE userId=?', [userId]);
      salt = user?.e2eSalt || null;
    } catch(e) {}

    if (!salt) {
      // Auto-generate if not exists
      salt = crypto.randomBytes(32).toString('hex');
      try {
        await q('ALTER TABLE users ADD COLUMN e2eSalt VARCHAR(64)', []);
      } catch(e) {}
      await q('UPDATE users SET e2eSalt=? WHERE userId=?', [salt, userId]);
    }

    res.json({
      salt,
      iterations: 100000,
      keyLength: 256,
      algorithm: 'AES-GCM',
      hashAlgorithm: 'SHA-256'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Store E2E encrypted file metadata ────────────────
router.post('/store-meta', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fileId, encryptedMeta, iv } = req.body;
    if (!fileId || !encryptedMeta) return res.status(400).json({ error: 'fileId and encryptedMeta required' });

    // Store encrypted metadata (only owner can read it)
    const metaId = uuidv4();
    try {
      await q('CREATE TABLE IF NOT EXISTS e2e_metadata (metaId VARCHAR(36) PRIMARY KEY, fileId VARCHAR(36), userId VARCHAR(36), encryptedMeta TEXT, iv VARCHAR(64), createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)', []);
    } catch(e) {}

    await q('INSERT INTO e2e_metadata (metaId,fileId,userId,encryptedMeta,iv) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE encryptedMeta=VALUES(encryptedMeta), iv=VALUES(iv)',
      [metaId, fileId, userId, encryptedMeta, iv || '']);

    res.json({ success: true, metaId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get E2E encrypted metadata ────────────────────────
router.get('/meta/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    let meta = null;
    try {
      meta = await q1('SELECT * FROM e2e_metadata WHERE fileId=? AND userId=?', [fileId, userId]);
    } catch(e) {}

    if (!meta) return res.status(404).json({ error: 'No E2E metadata found' });
    res.json({ encryptedMeta: meta.encryptedMeta, iv: meta.iv });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── E2E encryption info / explainer ──────────────────
router.get('/info', requireAuth, async (req, res) => {
  res.json({
    feature: 'End-to-End Encryption',
    description: 'Files are encrypted in your browser before leaving your device',
    howItWorks: [
      '1. You enter a passphrase in your browser',
      '2. Browser derives AES-256 key using PBKDF2 (100,000 iterations)',
      '3. File is encrypted using AES-GCM in your browser',
      '4. Only encrypted bytes are sent to the server',
      '5. Server never sees your file or passphrase',
      '6. Decryption happens in your browser using the same passphrase'
    ],
    algorithms: {
      keyDerivation: 'PBKDF2-SHA256 (100,000 iterations)',
      encryption: 'AES-256-GCM',
      authentication: 'GCM Auth Tag (128-bit)'
    },
    security: 'Even if the server is compromised, your files remain encrypted'
  });
});

module.exports = router;