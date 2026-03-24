'use strict';
// ═══════════════════════════════════════════════════════
// FEATURE 14 — FOLDER STRUCTURE
// File: C:\Projects\securevault\backend\src\routes\folders.js
// ═══════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
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

const FOLDER_ICONS  = ['📁','💼','🏠','⭐','🔐','📊','🎨','📚','🎵','🎮'];
const FOLDER_COLORS = ['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];

// ── Get all folders for user ──────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const folders = await q(`SELECT f.*, COUNT(fi.fileId) AS fileCount
      FROM folders f
      LEFT JOIN files fi ON fi.folderId = f.folderId AND fi.status = 'active'
      WHERE f.userId=?
      GROUP BY f.folderId
      ORDER BY f.createdAt ASC`, [userId]);
    res.json({ folders, count: folders.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Create folder ─────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, parentId, color, icon } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Folder name required' });
    if (name.length > 100) return res.status(400).json({ error: 'Name too long (max 100 chars)' });

    // Check duplicate name in same parent
    const existing = await q1('SELECT * FROM folders WHERE userId=? AND name=? AND parentId<=>?',
      [userId, name.trim(), parentId || null]);
    if (existing) return res.status(400).json({ error: 'Folder with this name already exists' });

    const folderId = uuidv4();
    const folderColor = color || FOLDER_COLORS[Math.floor(Math.random() * FOLDER_COLORS.length)];
    const folderIcon  = icon  || '📁';

    await q('INSERT INTO folders (folderId,userId,name,parentId,color,icon) VALUES (?,?,?,?,?,?)',
      [folderId, userId, name.trim(), parentId || null, folderColor, folderIcon]);

    res.json({
      success: true,
      folder: { folderId, name: name.trim(), parentId: parentId || null, color: folderColor, icon: folderIcon },
      message: 'Folder created!'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get folder contents ───────────────────────────────
router.get('/:folderId', requireAuth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const userId = req.user.userId;

    // Handle root folder
    if (folderId === 'root') {
      const files = await q('SELECT * FROM files WHERE userId=? AND (folderId IS NULL OR folderId="") AND status="active" ORDER BY createdAt DESC', [userId]);
      const subfolders = await q('SELECT * FROM folders WHERE userId=? AND parentId IS NULL ORDER BY createdAt ASC', [userId]);
      return res.json({ folder: { folderId: 'root', name: 'Root', path: '/' }, files, subfolders });
    }

    const folder = await q1('SELECT * FROM folders WHERE folderId=? AND userId=?', [folderId, userId]);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const files = await q('SELECT * FROM files WHERE userId=? AND folderId=? AND status="active" ORDER BY createdAt DESC', [userId, folderId]);
    const subfolders = await q('SELECT * FROM folders WHERE userId=? AND parentId=? ORDER BY createdAt ASC', [userId, folderId]);

    // Build breadcrumb path
    const path = await buildPath(folderId, userId);

    res.json({ folder, files, subfolders, path, fileCount: files.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper: build folder breadcrumb path
async function buildPath(folderId, userId) {
  const path = [];
  let current = folderId;
  let safety = 0;
  while (current && safety < 10) {
    const f = await q1('SELECT folderId, name, parentId FROM folders WHERE folderId=? AND userId=?', [current, userId]);
    if (!f) break;
    path.unshift({ folderId: f.folderId, name: f.name });
    current = f.parentId;
    safety++;
  }
  path.unshift({ folderId: 'root', name: '🏠 Root' });
  return path;
}

// ── Rename folder ─────────────────────────────────────
router.patch('/:folderId', requireAuth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const userId = req.user.userId;
    const { name, color, icon } = req.body;

    const folder = await q1('SELECT * FROM folders WHERE folderId=? AND userId=?', [folderId, userId]);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const updates = [];
    const values  = [];
    if (name)  { updates.push('name=?');  values.push(name.trim()); }
    if (color) { updates.push('color=?'); values.push(color); }
    if (icon)  { updates.push('icon=?');  values.push(icon); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    values.push(folderId, userId);
    await q('UPDATE folders SET ' + updates.join(',') + ' WHERE folderId=? AND userId=?', values);

    res.json({ success: true, message: 'Folder updated!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Move file to folder ───────────────────────────────
router.post('/move-file', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fileId, folderId } = req.body;
    if (!fileId) return res.status(400).json({ error: 'fileId required' });

    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=?', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Validate destination folder exists (if not root)
    if (folderId && folderId !== 'root') {
      const folder = await q1('SELECT * FROM folders WHERE folderId=? AND userId=?', [folderId, userId]);
      if (!folder) return res.status(404).json({ error: 'Destination folder not found' });
    }

    await q('UPDATE files SET folderId=? WHERE fileId=? AND userId=?',
      [folderId && folderId !== 'root' ? folderId : null, fileId, userId]);

    res.json({ success: true, message: 'File moved successfully!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Delete folder ─────────────────────────────────────
router.delete('/:folderId', requireAuth, async (req, res) => {
  try {
    const { folderId } = req.params;
    const userId = req.user.userId;
    const { moveFilesTo } = req.query; // optional: move files to another folder

    const folder = await q1('SELECT * FROM folders WHERE folderId=? AND userId=?', [folderId, userId]);
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // Move files to root or specified folder
    await q('UPDATE files SET folderId=? WHERE folderId=? AND userId=?',
      [moveFilesTo || null, folderId, userId]);

    // Move subfolders to parent
    await q('UPDATE folders SET parentId=? WHERE parentId=? AND userId=?',
      [folder.parentId || null, folderId, userId]);

    await q('DELETE FROM folders WHERE folderId=? AND userId=?', [folderId, userId]);

    res.json({ success: true, message: 'Folder deleted. Files moved to root.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get folder tree (for sidebar) ─────────────────────
router.get('/tree/all', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const folders = await q(`SELECT f.folderId, f.name, f.parentId, f.color, f.icon,
      COUNT(fi.fileId) AS fileCount
      FROM folders f
      LEFT JOIN files fi ON fi.folderId = f.folderId AND fi.status='active'
      WHERE f.userId=?
      GROUP BY f.folderId
      ORDER BY f.name ASC`, [userId]);

    // Build tree structure
    const tree = buildTree(folders);
    res.json({ tree, flat: folders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function buildTree(folders, parentId = null) {
  return folders
    .filter(f => (f.parentId || null) === parentId)
    .map(f => ({ ...f, children: buildTree(folders, f.folderId) }));
}

module.exports = router;