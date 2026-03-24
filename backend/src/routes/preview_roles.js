'use strict';
// ═══════════════════════════════════════════════════════
// FEATURE 15 — FILE PREVIEW
// FEATURE 16 — ROLE BASED ACCESS
// File: C:\Projects\securevault\backend\src\routes\preview_roles.js
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

// ════════════════════════════════════════════════════
// FEATURE 15 — FILE PREVIEW
// ════════════════════════════════════════════════════

// Get preview info for a file
router.get('/preview/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const file = await q1(`SELECT f.*, u.name AS ownerName 
      FROM files f LEFT JOIN users u ON u.userId = f.userId
      WHERE f.fileId=? AND (f.userId=? OR EXISTS (
        SELECT 1 FROM share_links s WHERE s.fileId=f.fileId AND s.recipientId=? AND s.status='accepted'
      )) AND f.status='active'`, [fileId, userId, userId]);

    if (!file) return res.status(404).json({ error: 'File not found or access denied' });

    const ext = (file.originalName || '').split('.').pop().toLowerCase();
    const previewTypes = {
      image: ['jpg','jpeg','png','gif','webp','svg','bmp'],
      pdf:   ['pdf'],
      text:  ['txt','md','csv','json','xml','html','css','js','ts','py','java','c','cpp'],
      video: ['mp4','webm','ogg'],
      audio: ['mp3','wav','ogg','m4a']
    };

    let previewType = 'none';
    let previewable = false;
    for (const [type, exts] of Object.entries(previewTypes)) {
      if (exts.includes(ext)) { previewType = type; previewable = true; break; }
    }

    res.json({
      fileId: file.fileId,
      fileName: file.originalName,
      fileSize: file.sizeBytes,
      mimeType: file.mimeType,
      extension: ext,
      previewable,
      previewType,
      algo: file.algo,
      owner: file.ownerName,
      createdAt: file.createdAt,
      note: previewable
        ? 'This file can be previewed after decryption'
        : 'This file type does not support preview — download to view'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generate a preview token (short-lived, for viewing decrypted content)
router.post('/preview/:fileId/token', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=? AND status="active"', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Generate a short-lived token (expires in 5 minutes)
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Store in memory or temp table (simple implementation)
    try {
      await q('CREATE TABLE IF NOT EXISTS preview_tokens (token VARCHAR(64) PRIMARY KEY, fileId VARCHAR(36), userId VARCHAR(36), expiresAt DATETIME)', []);
    } catch(e) {}

    await q('DELETE FROM preview_tokens WHERE userId=? AND fileId=?', [userId, fileId]);
    await q('INSERT INTO preview_tokens (token, fileId, userId, expiresAt) VALUES (?,?,?,?)',
      [token, fileId, userId, expiresAt.toISOString().slice(0,19).replace('T',' ')]);

    // Clean up expired tokens
    await q('DELETE FROM preview_tokens WHERE expiresAt < NOW()', []);

    res.json({
      token,
      expiresAt,
      expiresIn: '5 minutes',
      usage: 'Use this token to request a preview of the decrypted file'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get file type icons and preview metadata
router.get('/preview-meta/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await q1('SELECT fileId, originalName, sizeBytes, mimeType FROM files WHERE fileId=?', [fileId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const ext = (file.originalName || '').split('.').pop().toLowerCase();
    const icons = {
      pdf: '📄', jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼',
      txt: '📝', md: '📝', csv: '📊', json: '⚙️', xml: '⚙️',
      mp4: '🎬', webm: '🎬', mp3: '🎵', wav: '🎵',
      zip: '🗜', tar: '🗜', gz: '🗜',
      js: '💻', ts: '💻', py: '🐍', java: '☕'
    };

    res.json({
      fileId: file.fileId,
      name: file.originalName,
      icon: icons[ext] || '📁',
      extension: ext.toUpperCase(),
      size: file.sizeBytes,
      mimeType: file.mimeType
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════
// FEATURE 16 — ROLE BASED ACCESS CONTROL
// ════════════════════════════════════════════════════

const ROLES = {
  owner:  { canView: true,  canDownload: true,  canShare: true,  canDelete: true  },
  editor: { canView: true,  canDownload: true,  canShare: true,  canDelete: false },
  viewer: { canView: true,  canDownload: false, canShare: false, canDelete: false },
  none:   { canView: false, canDownload: false, canShare: false, canDelete: false }
};

// Grant permission to a user for a file
router.post('/permissions/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const grantedBy = req.user.userId;
    const { targetEmail, role, expiresInDays } = req.body;

    if (!targetEmail) return res.status(400).json({ error: 'targetEmail required' });
    if (!role || !ROLES[role]) return res.status(400).json({ error: 'Invalid role. Use: owner, editor, viewer' });

    // Verify granter owns the file
    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=? AND status="active"', [fileId, grantedBy]);
    if (!file) return res.status(403).json({ error: 'Only file owner can grant permissions' });

    // Find target user
    const targetUser = await q1('SELECT userId, name, email FROM users WHERE email=?', [targetEmail]);
    if (!targetUser) return res.status(404).json({ error: 'User not found with that email' });

    const rolePerms = ROLES[role];
    let expiresAt = null;
    if (expiresInDays) expiresAt = new Date(Date.now() + expiresInDays * 86400000);

    const permId = uuidv4();
    await q(`INSERT INTO file_permissions 
      (permId, fileId, userId, grantedBy, role, canView, canDownload, canShare, canDelete, expiresAt)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE 
      role=VALUES(role), canView=VALUES(canView), canDownload=VALUES(canDownload),
      canShare=VALUES(canShare), canDelete=VALUES(canDelete), expiresAt=VALUES(expiresAt)`,
      [permId, fileId, targetUser.userId, grantedBy, role,
       rolePerms.canView, rolePerms.canDownload, rolePerms.canShare, rolePerms.canDelete,
       expiresAt ? expiresAt.toISOString().slice(0,19).replace('T',' ') : null]);

    res.json({
      success: true,
      message: `${role} access granted to ${targetUser.name}`,
      permission: {
        user: targetUser.name,
        email: targetUser.email,
        role,
        permissions: rolePerms,
        expiresAt
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get all permissions for a file
router.get('/permissions/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=?', [fileId, userId]);
    if (!file) return res.status(403).json({ error: 'Access denied' });

    const perms = await q(`SELECT p.*, u.name AS userName, u.email AS userEmail,
      g.name AS grantedByName
      FROM file_permissions p
      LEFT JOIN users u ON u.userId = p.userId
      LEFT JOIN users g ON g.userId = p.grantedBy
      WHERE p.fileId=?
      ORDER BY p.createdAt DESC`, [fileId]);

    res.json({
      fileId,
      fileName: file.originalName,
      owner: userId,
      permissions: perms,
      count: perms.length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Check if user has permission for a file
router.get('/permissions/:fileId/check', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const { action } = req.query; // view, download, share, delete

    // Check if owner
    const file = await q1('SELECT * FROM files WHERE fileId=? AND status="active"', [fileId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    if (file.userId === userId) {
      return res.json({ allowed: true, role: 'owner', reason: 'File owner' });
    }

    // Check explicit permission
    const perm = await q1('SELECT * FROM file_permissions WHERE fileId=? AND userId=? AND (expiresAt IS NULL OR expiresAt > NOW())', [fileId, userId]);

    if (!perm) return res.json({ allowed: false, role: 'none', reason: 'No permission granted' });

    const actionMap = { view: 'canView', download: 'canDownload', share: 'canShare', delete: 'canDelete' };
    const col = actionMap[action];
    const allowed = col ? !!perm[col] : perm.canView;

    res.json({
      allowed,
      role: perm.role,
      permissions: {
        canView: perm.canView,
        canDownload: perm.canDownload,
        canShare: perm.canShare,
        canDelete: perm.canDelete
      },
      expiresAt: perm.expiresAt
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Revoke permission
router.delete('/permissions/:fileId/:targetUserId', requireAuth, async (req, res) => {
  try {
    const { fileId, targetUserId } = req.params;
    const userId = req.user.userId;

    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=?', [fileId, userId]);
    if (!file) return res.status(403).json({ error: 'Only file owner can revoke permissions' });

    await q('DELETE FROM file_permissions WHERE fileId=? AND userId=?', [fileId, targetUserId]);

    res.json({ success: true, message: 'Permission revoked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get files shared with me (via permissions)
router.get('/my-permissions', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const perms = await q(`SELECT p.*, f.originalName, f.sizeBytes, f.algo, f.createdAt AS fileCreatedAt,
      u.name AS ownerName, u.email AS ownerEmail
      FROM file_permissions p
      LEFT JOIN files f ON f.fileId = p.fileId
      LEFT JOIN users u ON u.userId = f.userId
      WHERE p.userId=? AND f.status='active' AND (p.expiresAt IS NULL OR p.expiresAt > NOW())
      ORDER BY p.createdAt DESC`, [userId]);

    res.json({ permissions: perms, count: perms.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;