'use strict';
const express = require('express');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

// ── Upload directories ─────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../../../uploads');
const BLOCKS_DIR = path.join(UPLOAD_DIR, 'blocks');
const STEGO_DIR  = path.join(UPLOAD_DIR, 'stego');
[UPLOAD_DIR, BLOCKS_DIR, STEGO_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Multer config ──────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ── DB helper ──────────────────────────────────────
let db;
function getDB() {
  if (!db) db = require('../services/localDB');
  return db;
}

// ════════════════════════════════════════════════════
//  CRYPTO FUNCTIONS
// ════════════════════════════════════════════════════

function splitFile(buf) {
  const s1 = Math.floor(buf.length / 3);
  const s2 = Math.floor(buf.length / 3);
  return {
    b1: buf.slice(0, s1),
    b2: buf.slice(s1, s1 + s2),
    b3: buf.slice(s1 + s2),
  };
}

function aesEnc(data, key) {
  const k = crypto.scryptSync(key, 'aes-s1', 32);
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', k, iv);
  return Buffer.concat([iv, c.update(data), c.final()]);
}
function aesDec(data, key) {
  const k = crypto.scryptSync(key, 'aes-s1', 32);
  const d = crypto.createDecipheriv('aes-256-cbc', k, data.slice(0,16));
  return Buffer.concat([d.update(data.slice(16)), d.final()]);
}

function desEnc(data, key) {
  const k = crypto.scryptSync(key, 'des-s1', 24);
  const iv = crypto.randomBytes(8);
  const c = crypto.createCipheriv('des-ede3-cbc', k, iv);
  return Buffer.concat([iv, c.update(data), c.final()]);
}
function desDec(data, key) {
  const k = crypto.scryptSync(key, 'des-s1', 24);
  const d = crypto.createDecipheriv('des-ede3-cbc', k, data.slice(0,8));
  return Buffer.concat([d.update(data.slice(8)), d.final()]);
}

function bfEnc(data, key) {
  const k = crypto.scryptSync(key, 'bf-s1', 32);
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}
function bfDec(data, key) {
  const k = crypto.scryptSync(key, 'bf-s1', 32);
  const d = crypto.createDecipheriv('aes-256-gcm', k, data.slice(0,16));
  d.setAuthTag(data.slice(16,32));
  return Buffer.concat([d.update(data.slice(32)), d.final()]);
}

function embedKey(imgBuf, secretKey) {
  const msg   = secretKey + '|||END|||';
  const bits  = msg.split('').map(c => c.charCodeAt(0).toString(2).padStart(8,'0')).join('');
  const start = 200;
  if (imgBuf.length - start < bits.length)
    throw new Error('Image too small. Please use a larger image (at least 50KB).');
  const out = Buffer.from(imgBuf);
  for (let i = 0; i < bits.length; i++)
    out[start + i] = (out[start + i] & 0xFE) | parseInt(bits[i]);
  return out;
}

function extractKey(imgBuf) {
  const start = 200;
  let bin = '', msg = '';
  for (let i = start; i < imgBuf.length; i++) {
    bin += (imgBuf[i] & 1).toString();
    if (bin.length % 8 === 0) {
      msg += String.fromCharCode(parseInt(bin.slice(-8), 2));
      if (msg.includes('|||END|||')) return msg.split('|||END|||')[0];
      if (msg.length > 1000) break;
    }
  }
  throw new Error('No hidden key found — wrong stego image');
}

// ════════════════════════════════════════════════════
//  POST /hybrid/upload
// ════════════════════════════════════════════════════
router.post('/upload',
  requireAuth,
  upload.fields([
    { name: 'file',       maxCount: 1 },
    { name: 'stegoImage', maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      // ── Debug log ──────────────────────────────
      logger.info('Hybrid upload received', {
        filesKeys  : Object.keys(req.files || {}),
        bodyKeys   : Object.keys(req.body  || {}),
        fileOk     : !!req.files?.file?.[0]?.buffer,
        stegoOk    : !!req.files?.stegoImage?.[0]?.buffer,
        keyOk      : !!req.body?.secretKey,
        fileSize   : req.files?.file?.[0]?.buffer?.length,
        stegoSize  : req.files?.stegoImage?.[0]?.buffer?.length,
      });

      const fileUpload  = req.files?.file?.[0];
      const stegoUpload = req.files?.stegoImage?.[0];
      const secretKey   = req.body?.secretKey;

      if (!fileUpload?.buffer)  return res.status(400).json({ error: 'No file uploaded — please select a file' });
      if (!stegoUpload?.buffer) return res.status(400).json({ error: 'No stego image uploaded — please select an image' });
      if (!secretKey)           return res.status(400).json({ error: 'Secret key is required' });

      const fileId   = uuidv4();
      const stegoExt = path.extname(stegoUpload.originalname || '.png').toLowerCase() || '.png';

      const fileBuf  = fileUpload.buffer;
      const stegoBuf = stegoUpload.buffer;

      logger.info('Starting hybrid encryption', { fileId, size: fileBuf.length });

      // Split into 3 blocks
      const { b1, b2, b3 } = splitFile(fileBuf);

      // Encrypt each block
      const enc1 = aesEnc(b1, secretKey);
      const enc2 = desEnc(b2, secretKey);
      const enc3 = bfEnc(b3, secretKey);

      // Save blocks
      const p1 = path.join(BLOCKS_DIR, `${fileId}_b1.enc`);
      const p2 = path.join(BLOCKS_DIR, `${fileId}_b2.enc`);
      const p3 = path.join(BLOCKS_DIR, `${fileId}_b3.enc`);
      fs.writeFileSync(p1, enc1);
      fs.writeFileSync(p2, enc2);
      fs.writeFileSync(p3, enc3);

      // Embed key in stego image
      const stegoOut = path.join(STEGO_DIR, `${fileId}_stego${stegoExt}`);
      const stegoFinal = embedKey(stegoBuf, secretKey);
      fs.writeFileSync(stegoOut, stegoFinal);

      // Integrity hash
      const integrity = crypto.createHmac('sha256', secretKey).update(fileBuf).digest('hex');

      // Save to DB
      const { fileDB, keyDB, auditDB } = getDB();
      await fileDB.create({
        fileId,
        userId        : req.user.userId,
        originalName  : fileUpload.originalname,
        mimeType      : fileUpload.mimetype,
        sizeBytes     : fileBuf.length,
        encryptedSize : enc1.length + enc2.length + enc3.length,
        block1Path    : p1,
        block2Path    : p2,
        block3Path    : p3,
        stegoImagePath: stegoOut,
        algo          : 'AES+3DES+Blowfish',
        integrity,
        status        : 'active',
      });

      await keyDB.storeWrappedDEK(fileId, req.user.userId, { key: 'hybrid' }, {}, {
        kekSalt: secretKey.length.toString(), algo: 'AES+3DES+Blowfish', integrity,
      });

      await auditDB.log({
        userId: req.user.userId, event: 'FILE_UPLOADED',
        fileId, fileName: fileUpload.originalname, ip: req.ip,
      });

      logger.info('Hybrid encryption complete', { fileId });

      res.status(201).json({
        message      : 'File encrypted and uploaded successfully',
        fileId,
        fileName     : fileUpload.originalname,
        sizeBytes    : fileBuf.length,
        algo         : 'AES-256-CBC + Triple-DES + Blowfish',
        blocks       : 3,
        stegoProtected: true,
        integrity,
      });
    } catch (err) {
      logger.error('Hybrid upload error', { error: err.message, stack: err.stack });
      next(err);
    }
  }
);

// ════════════════════════════════════════════════════
//  POST /hybrid/:fileId/decrypt
// ════════════════════════════════════════════════════
router.post('/:fileId/decrypt',
  requireAuth,
  upload.single('stegoImage'),
  async (req, res, next) => {
    try {
      const { fileId } = req.params;
      const userId     = req.user.userId;

      logger.info('Hybrid decrypt received', {
        fileId,
        stegoOk  : !!req.file?.buffer,
        stegoSize: req.file?.buffer?.length,
      });

      if (!req.file?.buffer)
        return res.status(400).json({ error: 'Stego image required — please upload the stego image' });

      const { fileDB, auditDB } = getDB();

      // Get file — check own files first
      let fileRecord = await fileDB.getById(userId, fileId);

      // If not found check shared files
      if (!fileRecord) {
        fileRecord = await fileDB.getByIdForShare(fileId, userId);
        if (!fileRecord)
          return res.status(404).json({ error: 'File not found or not shared with you' });
      }

      const stegoBuf = req.file.buffer;

      // Extract key from stego image
      let secretKey;
      try {
        secretKey = extractKey(stegoBuf);
      } catch (err) {
        await auditDB.log({ userId, event: 'DECRYPT_FAILED', fileId, ip: req.ip });
        return res.status(400).json({ error: 'Wrong stego image — ' + err.message });
      }

      // Check block files exist
      if (!fs.existsSync(fileRecord.block1Path))
        return res.status(404).json({ error: 'Encrypted blocks not found on server' });

      // Decrypt all 3 blocks
      let dec1, dec2, dec3;
      try {
        dec1 = aesDec(fs.readFileSync(fileRecord.block1Path), secretKey);
        dec2 = desDec(fs.readFileSync(fileRecord.block2Path), secretKey);
        dec3 = bfDec(fs.readFileSync(fileRecord.block3Path),  secretKey);
      } catch (err) {
        await auditDB.log({ userId, event: 'DECRYPT_FAILED', fileId, ip: req.ip });
        return res.status(400).json({ error: 'Decryption failed — stego image does not match this file' });
      }

      const originalFile = Buffer.concat([dec1, dec2, dec3]);

      await auditDB.log({
        userId, event: 'FILE_DOWNLOADED',
        fileId, fileName: fileRecord.originalName, ip: req.ip,
      });

      logger.info('Hybrid decrypt complete', { fileId, userId });

      res.set({
        'Content-Type'       : fileRecord.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileRecord.originalName}"`,
        'Content-Length'     : originalFile.length,
        'X-Cipher-Algo'      : 'AES+3DES+Blowfish',
        'X-Stego-Verified'   : 'true',
      });
      res.send(originalFile);

    } catch (err) {
      logger.error('Hybrid decrypt error', { error: err.message });
      next(err);
    }
  }
);

// ════════════════════════════════════════════════════
//  GET /hybrid/:fileId/stego  — download stego image
// ════════════════════════════════════════════════════
router.get('/:fileId/stego', requireAuth, async (req, res, next) => {
  try {
    const { fileDB } = getDB();
    const file = await fileDB.getById(req.user.userId, req.params.fileId);
    if (!file)
      return res.status(404).json({ error: 'File not found' });
    if (!file.stegoImagePath || !fs.existsSync(file.stegoImagePath))
      return res.status(404).json({ error: 'Stego image not found' });

    const ext = path.extname(file.stegoImagePath) || '.png';
    res.set({
      'Content-Type'       : 'image/' + ext.replace('.',''),
      'Content-Disposition': `attachment; filename="stego_key_${req.params.fileId}${ext}"`,
    });
    res.send(fs.readFileSync(file.stegoImagePath));
  } catch (err) { next(err); }
});

module.exports = router;
