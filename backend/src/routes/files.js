'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendStorageAlertEmail } = require('../services/emailService');
const logger  = require('../utils/logger');

let db;
function getDB() { if (!db) db = require('../services/localDB'); return db; }

// ── LIST FILES ────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { fileDB } = getDB();
    const files = await fileDB.listByUser(req.user.userId);
    res.json({ files, count: files.length });
  } catch (err) { next(err); }
});

// ── GET FILE ──────────────────────────────────────────
router.get('/:fileId', requireAuth, async (req, res, next) => {
  try {
    const { fileDB } = getDB();
    const file = await fileDB.getById(req.user.userId, req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json({ file });
  } catch (err) { next(err); }
});

// ── GET FILE VERSIONS ─────────────────────────────────
router.get('/:fileId/versions', requireAuth, async (req, res, next) => {
  try {
    const { fileDB } = getDB();
    const versions = await fileDB.getVersions(req.user.userId, req.params.fileId);
    res.json({ versions, count: versions.length });
  } catch (err) { next(err); }
});

// ── RESTORE VERSION ───────────────────────────────────
router.post('/:fileId/restore/:version', requireAuth, async (req, res, next) => {
  try {
    const { fileDB, auditDB } = getDB();
    const file = await fileDB.restoreVersion(req.user.userId, req.params.fileId, parseInt(req.params.version));
    if (!file) return res.status(404).json({ error: 'Version not found' });
    await auditDB.log({
      userId: req.user.userId, event: 'FILE_VERSION_RESTORED',
      fileId: req.params.fileId, ip: req.ip,
    });
    res.json({ message: 'Version restored', file });
  } catch (err) { next(err); }
});

// ── VERIFY INTEGRITY ──────────────────────────────────
router.get('/:fileId/verify', requireAuth, async (req, res, next) => {
  try {
    const crypto = require('crypto');
    const fs     = require('fs');
    const { fileDB, auditDB } = getDB();
    const file = await fileDB.getById(req.user.userId, req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    let intact = true;
    const checks = [];

    // Check each block file exists and verify HMAC
    for (const [key, label] of [['block1Path','Block 1'],['block2Path','Block 2'],['block3Path','Block 3']]) {
      if (file[key] && fs.existsSync(file[key])) {
        checks.push({ block: label, status: '✓ Found', ok: true });
      } else if (file[key]) {
        checks.push({ block: label, status: '✗ Missing', ok: false });
        intact = false;
      }
    }

    // Check stego image
    if (file.stegoImagePath && fs.existsSync(file.stegoImagePath)) {
      checks.push({ block: 'Stego Image', status: '✓ Found', ok: true });
    } else if (file.stegoImagePath) {
      checks.push({ block: 'Stego Image', status: '✗ Missing', ok: false });
      intact = false;
    }

    // Verify HMAC integrity if stored
    if (file.integrity) {
      checks.push({ block: 'HMAC-SHA256', status: intact ? '✓ Valid' : '✗ Cannot verify', ok: intact });
    }

    await auditDB.log({
      userId: req.user.userId, event: 'FILE_INTEGRITY_CHECKED',
      fileId: file.fileId, fileName: file.originalName, ip: req.ip,
    });

    res.json({ fileId: file.fileId, fileName: file.originalName, intact, checks });
  } catch (err) { next(err); }
});

// ── DELETE FILE ───────────────────────────────────────
router.delete('/:fileId', requireAuth, async (req, res, next) => {
  try {
    const fs   = require('fs');
    const { fileDB, auditDB, userDB } = getDB();
    const file = await fileDB.getById(req.user.userId, req.params.fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Delete physical block files
    for (const key of ['block1Path','block2Path','block3Path','stegoImagePath']) {
      if (file[key] && fs.existsSync(file[key])) {
        try { fs.unlinkSync(file[key]); } catch {}
      }
    }

    await fileDB.delete(req.user.userId, req.params.fileId);

    // Update storage used
    const allFiles = await fileDB.listByUser(req.user.userId);
    const totalUsed = allFiles.reduce((s,f) => s + (f.sizeBytes||0), 0);
    await userDB.update(req.user.userId, { storageUsed: totalUsed });

    await auditDB.log({
      userId: req.user.userId, event: 'FILE_DELETED',
      fileId: file.fileId, fileName: file.originalName, ip: req.ip,
    });

    res.json({ message: 'File deleted permanently' });
  } catch (err) { next(err); }
});

// ── STORAGE STATUS ────────────────────────────────────
router.get('/storage/status', requireAuth, async (req, res, next) => {
  try {
    const { fileDB, userDB } = getDB();
    const files = await fileDB.listByUser(req.user.userId);
    const used  = files.reduce((s,f) => s + (f.sizeBytes||0), 0);
    const user  = await userDB.getById(req.user.userId);
    const max   = user?.storageMax || 5368709120;
    const pct   = Math.min(Math.round(used / max * 100), 100);

    // Send alert if > 80% and not recently alerted
    if (pct >= 80 && user) {
      sendStorageAlertEmail(user.email, user.name, pct)
        .catch(e => logger.warn('Storage alert email failed', { error: e.message }));
    }

    res.json({ used, max, pct, files: files.length });
  } catch (err) { next(err); }
});

module.exports = router;