'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();

const crypto = require('../crypto/cryptoEngine');
const { keyDB, fileDB, auditDB } = require('../services/localDB');
const { requireAuth } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const logger = require('../utils/logger');

// ── GET /keys ─────────────────────────────────────────
// List all encryption key metadata for the current user
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const files = await fileDB.listByUser(req.user.userId);
    const keys  = await Promise.all(
      files.map(async (f) => {
        const k = await keyDB.getWrappedDEK(f.fileId, req.user.userId).catch(() => null);
        return k ? {
          fileId     : f.fileId,
          fileName   : f.originalName,
          algo       : k.algo,
          keyVersion : k.keyVersion,
          createdAt  : k.createdAt,
          rotatedAt  : k.rotatedAt || null,
        } : null;
      })
    );
    res.json({ keys: keys.filter(Boolean) });
  } catch (err) { next(err); }
});

// ── POST /keys/:fileId/rotate ─────────────────────────
// Re-encrypt the DEK with a new KEK (key rotation)
router.post('/:fileId/rotate', requireAuth, async (req, res, next) => {
  const { fileId } = req.params;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'currentPassword and newPassword required' });

  try {
    const file      = await fileDB.getById(req.user.userId, fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const keyRecord = await keyDB.getWrappedDEK(fileId, req.user.userId);
    if (!keyRecord) return res.status(404).json({ error: 'Key not found' });

    // Unwrap DEK with current password
    const { key: currentKEK } = await crypto.deriveKeyFromPassword(currentPassword, keyRecord.kekSalt);
    let dek;
    try {
      dek = crypto.aesDecrypt(keyRecord.wrappedDEK, currentKEK);
    } catch {
      return res.status(401).json({ error: 'Current password incorrect', code: 'WRONG_PASSWORD' });
    }

    // Re-wrap DEK with new password
    const { key: newKEK, salt: newSalt } = await crypto.deriveKeyFromPassword(newPassword);
    const newWrappedDEK = crypto.aesEncrypt(dek, newKEK, `dek:${fileId}`);
    dek.fill(0); // zero out plaintext DEK from memory

    await keyDB.rotateKey(fileId, req.user.userId, newWrappedDEK, keyRecord.kmsWrappedDEK);
    await auditDB.log({ userId: req.user.userId, event: 'KEY_ROTATED', fileId, ip: req.ip });

    logger.info('Key rotated', { fileId, userId: req.user.userId });
    res.json({ message: 'Encryption key rotated successfully', fileId, rotatedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ── POST /keys/rsa/generate ───────────────────────────
// Generate a new RSA-4096 key pair for the user
router.post('/rsa/generate', requireAuth, async (req, res, next) => {
  try {
    logger.info('Generating RSA-4096 key pair', { userId: req.user.userId });
    const { publicKey, privateKey } = await crypto.generateRSAKeyPair();

    await auditDB.log({ userId: req.user.userId, event: 'RSA_KEYPAIR_GENERATED', ip: req.ip });
    // IMPORTANT: private key is returned ONCE — user must store it securely
    res.json({
      publicKey,
      privateKey,
      keyType : 'RSA-4096',
      warning : 'Store the private key securely. It will NOT be stored on our servers.',
    });
  } catch (err) { next(err); }
});

// ── POST /keys/ecdh/generate ──────────────────────────
// Generate an ephemeral ECDH P-384 key pair
router.post('/ecdh/generate', requireAuth, async (req, res, next) => {
  try {
    const keyPair = crypto.generateECDHKeyPair();
    res.json({ ...keyPair, curve: 'P-384', usage: 'Ephemeral key exchange for secure sharing' });
  } catch (err) { next(err); }
});

// ── GET /keys/audit ───────────────────────────────────
router.get('/audit', requireAuth, async (req, res, next) => {
  try {
    const { auditDB } = require('../services/localDB');
    const logs = await auditDB.getByUser(req.user.userId, parseInt(req.query.limit) || 50);
    res.json({ logs, count: logs.length });
  } catch (err) { next(err); }
});

module.exports = router;
