'use strict';
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendFileShareEmail, sendShareStatusEmail } = require('../services/emailService');
const QRCode  = require('qrcode');
const logger  = require('../utils/logger');

let db;
function getDB() { if (!db) db = require('../services/localDB'); return db; }

// ── SEND SHARE ───────────────────────────────────────
router.post('/send', requireAuth, async (req, res, next) => {
  try {
    const { fileId, recipientEmail } = req.body;
    if (!fileId || !recipientEmail)
      return res.status(400).json({ error: 'fileId and recipientEmail required' });

    const { fileDB, userDB, shareDB, auditDB } = getDB();
    const file = await fileDB.getById(req.user.userId, fileId);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const recipient = await userDB.getByEmail(recipientEmail);
    if (!recipient) return res.status(404).json({ error: 'Recipient not found in SecureVault' });
    if (recipient.userId === req.user.userId)
      return res.status(400).json({ error: 'Cannot share with yourself' });

    const shareId = uuidv4();
    await shareDB.create({
      shareId, fileId,
      senderId   : req.user.userId,
      recipientId: recipient.userId,
      status     : 'pending',
      stegoImagePath: file.stegoImagePath,
    });

    await auditDB.log({
      userId: req.user.userId, event: 'FILE_SHARED',
      fileId, fileName: file.originalName, ip: req.ip,
    });

    // Send email notification
    sendFileShareEmail(recipient.email, recipient.name, req.user.name, file.originalName)
      .catch(e => logger.warn('Share email failed', { error: e.message }));

    res.status(201).json({ message: 'File shared', shareId, recipientName: recipient.name, status: 'pending' });
  } catch (err) { next(err); }
});

// ── RECEIVED ─────────────────────────────────────────
router.get('/received', requireAuth, async (req, res, next) => {
  try {
    const { shareDB } = getDB();
    const shares = await shareDB.getReceivedByUser(req.user.userId);
    res.json({ shares, count: shares.length });
  } catch (err) { next(err); }
});

// ── SENT ─────────────────────────────────────────────
router.get('/sent', requireAuth, async (req, res, next) => {
  try {
    const { shareDB } = getDB();
    const shares = await shareDB.getSentByUser(req.user.userId);
    res.json({ shares, count: shares.length });
  } catch (err) { next(err); }
});

// ── ACCEPT ───────────────────────────────────────────
router.post('/:shareId/accept', requireAuth, async (req, res, next) => {
  try {
    const { shareDB, fileDB, userDB, auditDB } = getDB();
    const share = await shareDB.getById(req.params.shareId);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.recipientId !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });
    if (share.status !== 'pending') return res.status(400).json({ error: 'Share already ' + share.status });

    await shareDB.updateStatus(req.params.shareId, 'accepted');
    await auditDB.log({ userId: req.user.userId, event: 'SHARE_ACCEPTED', fileId: share.fileId, ip: req.ip });

    // Notify sender
    const sender = await userDB.getById(share.senderId);
    const file   = await fileDB.getById(share.senderId, share.fileId).catch(() => null);
    if (sender && file) {
      sendShareStatusEmail(sender.email, sender.name, req.user.name, file.originalName, 'accepted')
        .catch(e => logger.warn('Share status email failed', { error: e.message }));
    }

    res.json({ message: 'Share accepted', status: 'accepted' });
  } catch (err) { next(err); }
});

// ── REJECT ───────────────────────────────────────────
router.post('/:shareId/reject', requireAuth, async (req, res, next) => {
  try {
    const { shareDB, fileDB, userDB, auditDB } = getDB();
    const share = await shareDB.getById(req.params.shareId);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.recipientId !== req.user.userId) return res.status(403).json({ error: 'Not authorized' });

    await shareDB.updateStatus(req.params.shareId, 'rejected');
    await auditDB.log({ userId: req.user.userId, event: 'SHARE_REJECTED', fileId: share.fileId, ip: req.ip });

    // Notify sender
    const sender = await userDB.getById(share.senderId);
    const file   = await fileDB.getById(share.senderId, share.fileId).catch(() => null);
    if (sender && file) {
      sendShareStatusEmail(sender.email, sender.name, req.user.name, file.originalName, 'rejected')
        .catch(e => logger.warn('Share status email failed', { error: e.message }));
    }

    res.json({ message: 'Share rejected', status: 'rejected' });
  } catch (err) { next(err); }
});

// ── STEGO DOWNLOAD ───────────────────────────────────
router.get('/:shareId/stego', requireAuth, async (req, res, next) => {
  try {
    const fs   = require('fs');
    const path = require('path');
    const { shareDB } = getDB();
    const share = await shareDB.getById(req.params.shareId);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.recipientId !== req.user.userId && share.senderId !== req.user.userId)
      return res.status(403).json({ error: 'Not authorized' });
    if (!share.stegoImagePath || !fs.existsSync(share.stegoImagePath))
      return res.status(404).json({ error: 'Stego image not found' });
    res.download(share.stegoImagePath, 'stego_key.png');
  } catch (err) { next(err); }
});

// ── QR CODE for share ─────────────────────────────────
router.get('/:shareId/qr', requireAuth, async (req, res, next) => {
  try {
    const { shareDB } = getDB();
    const share = await shareDB.getById(req.params.shareId);
    if (!share) return res.status(404).json({ error: 'Share not found' });
    if (share.senderId !== req.user.userId && share.recipientId !== req.user.userId)
      return res.status(403).json({ error: 'Not authorized' });

    const qrData = JSON.stringify({
      shareId : share.shareId,
      fileId  : share.fileId,
      type    : 'securevault-share',
      url     : `${process.env.FRONTEND_URL}/index.html#received`,
    });

    const qrDataURL = await QRCode.toDataURL(qrData, {
      width: 300, margin: 2,
      color: { dark: '#4f46e5', light: '#ffffff' },
    });

    res.json({ qr: qrDataURL, shareId: share.shareId });
  } catch (err) { next(err); }
});

module.exports = router;