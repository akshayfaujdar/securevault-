'use strict';
// ═══════════════════════════════════════════════════════
// SECUREVAULT PHASE 1 — ALL NEW FEATURES ROUTE
// File: C:\Projects\securevault\backend\src\routes\phase1.js
// ═══════════════════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const zlib     = require('zlib');
const fs       = require('fs');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');

let db;
function getDB() {
  if (!db) db = require('../services/localDB');
  return db;
}

// ─── Helper: query MySQL ─────────────────────────────
async function q(sql, params = []) {
  const { pool } = getDB();
  const [rows] = await pool.query(sql, params);
  return rows;
}
async function q1(sql, params = []) {
  const rows = await q(sql, params);
  return rows[0] || null;
}

// ════════════════════════════════════════════════════
// FEATURE 1 — FILE SELF-DESTRUCT
// ════════════════════════════════════════════════════

// Set self-destruct on a file
router.post('/self-destruct/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { maxDownloads, expiresInHours, expiresInDays } = req.body;
    const userId = req.user.userId;

    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=? AND status="active"', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    let expiresAt = null;
    if (expiresInHours) {
      expiresAt = new Date(Date.now() + expiresInHours * 3600000);
    } else if (expiresInDays) {
      expiresAt = new Date(Date.now() + expiresInDays * 86400000);
    }

    await q(`UPDATE files SET 
      selfDestruct=1, 
      maxDownloads=?, 
      downloadCount=0,
      expiresAt=?
      WHERE fileId=? AND userId=?`,
      [maxDownloads || null, expiresAt ? expiresAt.toISOString().slice(0,19).replace('T',' ') : null, fileId, userId]
    );

    res.json({
      success: true,
      message: 'Self-destruct set!',
      maxDownloads: maxDownloads || null,
      expiresAt: expiresAt || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove self-destruct from a file
router.delete('/self-destruct/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    await q('UPDATE files SET selfDestruct=0, maxDownloads=NULL, expiresAt=NULL, downloadCount=0 WHERE fileId=? AND userId=?', [fileId, userId]);
    res.json({ success: true, message: 'Self-destruct removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check and trigger self-destruct (called after each download)
router.post('/self-destruct/:fileId/check', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await q1('SELECT * FROM files WHERE fileId=? AND status="active"', [fileId]);
    if (!file || !file.selfDestruct) return res.json({ destroyed: false });

    let shouldDestroy = false;
    let reason = '';

    // Check download limit
    if (file.maxDownloads && file.downloadCount >= file.maxDownloads) {
      shouldDestroy = true;
      reason = 'Max downloads reached';
    }

    // Check expiry
    if (file.expiresAt && new Date() > new Date(file.expiresAt)) {
      shouldDestroy = true;
      reason = 'File expired';
    }

    if (shouldDestroy) {
      await q('UPDATE files SET status="destroyed", deletedAt=NOW(), deleteReason=? WHERE fileId=?', [reason, fileId]);
      // Delete physical files
      try {
        if (file.block1Path && fs.existsSync(file.block1Path)) fs.unlinkSync(file.block1Path);
        if (file.block2Path && fs.existsSync(file.block2Path)) fs.unlinkSync(file.block2Path);
        if (file.block3Path && fs.existsSync(file.block3Path)) fs.unlinkSync(file.block3Path);
        if (file.stegoImagePath && fs.existsSync(file.stegoImagePath)) fs.unlinkSync(file.stegoImagePath);
      } catch(e) {}
      return res.json({ destroyed: true, reason });
    }

    res.json({ destroyed: false, downloadsLeft: file.maxDownloads ? file.maxDownloads - file.downloadCount : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get self-destruct status
router.get('/self-destruct/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const file = await q1('SELECT fileId,originalName,selfDestruct,maxDownloads,downloadCount,expiresAt FROM files WHERE fileId=? AND userId=?', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.json({
      selfDestruct: !!file.selfDestruct,
      maxDownloads: file.maxDownloads,
      downloadCount: file.downloadCount,
      expiresAt: file.expiresAt,
      downloadsLeft: file.maxDownloads ? file.maxDownloads - file.downloadCount : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════
// FEATURE 2 — HONEYPOT FILES
// ════════════════════════════════════════════════════

// Create a honeypot file
router.post('/honeypot', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, description } = req.body;

    const fileId = uuidv4();
    const fakeName = name || 'passwords_backup.txt';

    await q(`INSERT INTO files 
      (fileId, userId, originalName, mimeType, sizeBytes, algo, status, isHoneypot, tags)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [fileId, userId, fakeName, 'text/plain', 1024, 'honeypot', 'active', 1, JSON.stringify(['honeypot'])]
    );

    res.json({
      success: true,
      fileId,
      name: fakeName,
      message: 'Honeypot file created! Admin will be alerted if anyone accesses it.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all honeypot files
router.get('/honeypot', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const files = await q('SELECT * FROM files WHERE userId=? AND isHoneypot=1 AND status="active" ORDER BY createdAt DESC', [userId]);
    const alerts = await q('SELECT h.*,u.name AS accessedByName,u.email AS accessedByEmail FROM honeypot_alerts h LEFT JOIN users u ON u.userId=h.accessedBy ORDER BY h.createdAt DESC LIMIT 50');
    res.json({ files, alerts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger honeypot alert (called when honeypot file is accessed)
router.post('/honeypot/:fileId/alert', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const accessedBy = req.user.userId;
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];

    const file = await q1('SELECT * FROM files WHERE fileId=? AND isHoneypot=1', [fileId]);
    if (!file) return res.status(404).json({ error: 'Not a honeypot file' });

    const alertId = uuidv4();
    await q('INSERT INTO honeypot_alerts (alertId,fileId,accessedBy,ip,userAgent) VALUES (?,?,?,?,?)',
      [alertId, fileId, accessedBy, ip, userAgent]);

    await q('UPDATE files SET honeypotAlertSent=1 WHERE fileId=?', [fileId]);

    // Log to audit
    await q('INSERT INTO audit_log (logId,userId,event,fileId,fileName,ip,details) VALUES (?,?,?,?,?,?,?)',
      [uuidv4(), accessedBy, 'HONEYPOT_TRIGGERED', fileId, file.originalName, ip,
       JSON.stringify({ userAgent, alertId })]);

    res.json({ success: true, alertId, message: '🚨 Honeypot triggered! Admin has been notified.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════
// FEATURE 5 — FILE COMPRESSION
// ════════════════════════════════════════════════════

// Compress a file buffer (called before encryption)
router.post('/compress', requireAuth, async (req, res) => {
  try {
    const { data, fileId } = req.body; // data = base64 encoded file
    if (!data) return res.status(400).json({ error: 'No data provided' });

    const buffer = Buffer.from(data, 'base64');
    const originalSize = buffer.length;

    const compressed = await new Promise((resolve, reject) => {
      zlib.gzip(buffer, { level: 9 }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const compressedSize = compressed.length;
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    res.json({
      compressed: compressed.toString('base64'),
      originalSize,
      compressedSize,
      ratio: parseFloat(ratio),
      saved: originalSize - compressedSize
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Decompress a file buffer (called after decryption)
router.post('/decompress', requireAuth, async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data provided' });

    const buffer = Buffer.from(data, 'base64');
    const decompressed = await new Promise((resolve, reject) => {
      zlib.gunzip(buffer, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    res.json({ decompressed: decompressed.toString('base64') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════
// FEATURE 6 — RECYCLE BIN
// ════════════════════════════════════════════════════

// Get recycle bin files
router.get('/recycle', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const files = await q(`SELECT * FROM files WHERE userId=? AND status='deleted' ORDER BY deletedAt DESC`, [userId]);
    res.json({ files, count: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore a file from recycle bin
router.post('/recycle/:fileId/restore', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=? AND status="deleted"', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found in recycle bin' });

    await q('UPDATE files SET status="active", deletedAt=NULL, deleteReason=NULL WHERE fileId=? AND userId=?', [fileId, userId]);

    await q('INSERT INTO audit_log (logId,userId,event,fileId,fileName,ip) VALUES (?,?,?,?,?,?)',
      [uuidv4(), userId, 'FILE_RESTORED', fileId, file.originalName, req.ip]);

    res.json({ success: true, message: `${file.originalName} restored successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Permanently delete a file from recycle bin
router.delete('/recycle/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=? AND status="deleted"', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found in recycle bin' });

    // Delete physical encrypted blocks
    try {
      if (file.block1Path && fs.existsSync(file.block1Path)) fs.unlinkSync(file.block1Path);
      if (file.block2Path && fs.existsSync(file.block2Path)) fs.unlinkSync(file.block2Path);
      if (file.block3Path && fs.existsSync(file.block3Path)) fs.unlinkSync(file.block3Path);
      if (file.stegoImagePath && fs.existsSync(file.stegoImagePath)) fs.unlinkSync(file.stegoImagePath);
    } catch(e) {}

    await q('DELETE FROM encryption_keys WHERE fileId=?', [fileId]);
    await q('DELETE FROM files WHERE fileId=? AND userId=?', [fileId, userId]);

    res.json({ success: true, message: `${file.originalName} permanently deleted!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Empty entire recycle bin
router.delete('/recycle', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const files = await q('SELECT * FROM files WHERE userId=? AND status="deleted"', [userId]);

    for (const file of files) {
      try {
        if (file.block1Path && fs.existsSync(file.block1Path)) fs.unlinkSync(file.block1Path);
        if (file.block2Path && fs.existsSync(file.block2Path)) fs.unlinkSync(file.block2Path);
        if (file.block3Path && fs.existsSync(file.block3Path)) fs.unlinkSync(file.block3Path);
        if (file.stegoImagePath && fs.existsSync(file.stegoImagePath)) fs.unlinkSync(file.stegoImagePath);
      } catch(e) {}
      await q('DELETE FROM encryption_keys WHERE fileId=?', [file.fileId]);
    }

    await q('DELETE FROM files WHERE userId=? AND status="deleted"', [userId]);
    res.json({ success: true, message: `${files.length} files permanently deleted`, count: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════
// FEATURE 7 — FILE TAGS
// ════════════════════════════════════════════════════

const TAG_COLORS = ['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];

// Add tag to file
router.post('/tags/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { tag, color } = req.body;
    const userId = req.user.userId;

    if (!tag || tag.trim().length === 0) return res.status(400).json({ error: 'Tag cannot be empty' });
    if (tag.length > 30) return res.status(400).json({ error: 'Tag too long (max 30 chars)' });

    const existing = await q1('SELECT * FROM file_tags WHERE fileId=? AND userId=? AND tag=?', [fileId, userId, tag.trim()]);
    if (existing) return res.status(400).json({ error: 'Tag already exists' });

    const tagId = uuidv4();
    const tagColor = color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];

    await q('INSERT INTO file_tags (tagId,fileId,userId,tag,color) VALUES (?,?,?,?,?)',
      [tagId, fileId, userId, tag.trim().toLowerCase(), tagColor]);

    res.json({ success: true, tagId, tag: tag.trim().toLowerCase(), color: tagColor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get tags for a file
router.get('/tags/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const tags = await q('SELECT * FROM file_tags WHERE fileId=? AND userId=? ORDER BY createdAt', [fileId, userId]);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all tags for a user (for filter dropdown)
router.get('/tags', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const tags = await q('SELECT DISTINCT tag, color, COUNT(*) as count FROM file_tags WHERE userId=? GROUP BY tag, color ORDER BY count DESC', [userId]);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove tag from file
router.delete('/tags/:fileId/:tag', requireAuth, async (req, res) => {
  try {
    const { fileId, tag } = req.params;
    const userId = req.user.userId;
    await q('DELETE FROM file_tags WHERE fileId=? AND userId=? AND tag=?', [fileId, userId, tag]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Filter files by tag
router.get('/tags/filter/:tag', requireAuth, async (req, res) => {
  try {
    const { tag } = req.params;
    const userId = req.user.userId;
    const files = await q(`SELECT f.* FROM files f 
      INNER JOIN file_tags t ON t.fileId = f.fileId 
      WHERE t.userId=? AND t.tag=? AND f.status='active' 
      ORDER BY f.createdAt DESC`, [userId, tag]);
    res.json({ files, count: files.length, tag });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════
// FEATURE 8 — FILE EXPIRY (Share Link Expiry)
// ════════════════════════════════════════════════════

// Update share link expiry
router.patch('/expiry/:shareId', requireAuth, async (req, res) => {
  try {
    const { shareId } = req.params;
    const { expiresInHours, expiresInDays, maxDownloads, message } = req.body;
    const userId = req.user.userId;

    const share = await q1('SELECT * FROM share_links WHERE shareId=? AND senderId=?', [shareId, userId]);
    if (!share) return res.status(404).json({ error: 'Share not found' });

    let expiresAt = null;
    if (expiresInHours) expiresAt = new Date(Date.now() + expiresInHours * 3600000);
    else if (expiresInDays) expiresAt = new Date(Date.now() + expiresInDays * 86400000);

    await q(`UPDATE share_links SET expiresAt=?, maxDownloads=?, message=? WHERE shareId=?`,
      [expiresAt ? expiresAt.toISOString().slice(0,19).replace('T',' ') : null,
       maxDownloads || null, message || null, shareId]);

    res.json({ success: true, expiresAt, maxDownloads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if share link is expired
router.get('/expiry/:shareId/check', async (req, res) => {
  try {
    const { shareId } = req.params;
    const share = await q1('SELECT * FROM share_links WHERE shareId=?', [shareId]);
    if (!share) return res.status(404).json({ error: 'Share not found' });

    const now = new Date();
    const isExpired = share.expiresAt && now > new Date(share.expiresAt);
    const isMaxed = share.maxDownloads && share.downloadCount >= share.maxDownloads;

    res.json({
      valid: !isExpired && !isMaxed,
      expired: isExpired,
      maxedOut: isMaxed,
      expiresAt: share.expiresAt,
      downloadsLeft: share.maxDownloads ? share.maxDownloads - share.downloadCount : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════
// FEATURE 9 — ACCESS LOGS PER FILE
// ════════════════════════════════════════════════════

// Log file access (called internally)
async function logFileAccess(fileId, userId, action, ip, userAgent) {
  try {
    await q('INSERT INTO file_access_logs (logId,fileId,userId,action,ip,userAgent) VALUES (?,?,?,?,?,?)',
      [uuidv4(), fileId, userId || null, action, ip || null, userAgent || null]);
  } catch(e) {}
}

// Get access logs for a specific file
router.get('/access-logs/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    // Make sure user owns this file
    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=?', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const logs = await q(`SELECT l.*, u.name AS userName, u.email AS userEmail 
      FROM file_access_logs l 
      LEFT JOIN users u ON u.userId = l.userId 
      WHERE l.fileId=? 
      ORDER BY l.createdAt DESC 
      LIMIT 100`, [fileId]);

    const stats = {
      totalAccess: logs.length,
      downloads: logs.filter(l => l.action === 'DOWNLOAD').length,
      views: logs.filter(l => l.action === 'VIEW').length,
      uniqueUsers: [...new Set(logs.map(l => l.userId).filter(Boolean))].length
    };

    res.json({ logs, stats, fileName: file.originalName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get access logs for ALL files of current user
router.get('/access-logs', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const logs = await q(`SELECT l.*, f.originalName AS fileName, u.name AS userName 
      FROM file_access_logs l 
      LEFT JOIN files f ON f.fileId = l.fileId 
      LEFT JOIN users u ON u.userId = l.userId 
      WHERE f.userId=? 
      ORDER BY l.createdAt DESC 
      LIMIT 200`, [userId]);
    res.json({ logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════
// FEATURE 10 — ENCRYPTION PERFORMANCE
// ════════════════════════════════════════════════════

// Save encryption performance stats
router.post('/perf', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { fileId, aesTimeMs, desTimeMs, blowfishTimeMs, stegoTimeMs, totalTimeMs, fileSizeBytes } = req.body;

    const statId = uuidv4();
    await q(`INSERT INTO encryption_stats 
      (statId,fileId,userId,aesTimeMs,desTimeMs,blowfishTimeMs,stegoTimeMs,totalTimeMs,fileSizeBytes)
      VALUES (?,?,?,?,?,?,?,?,?)`,
      [statId, fileId || 'unknown', userId, aesTimeMs||0, desTimeMs||0, blowfishTimeMs||0, stegoTimeMs||0, totalTimeMs||0, fileSizeBytes||0]);

    res.json({ success: true, statId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get encryption performance stats for current user
router.get('/perf', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const stats = await q(`SELECT s.*, f.originalName AS fileName 
      FROM encryption_stats s 
      LEFT JOIN files f ON f.fileId = s.fileId 
      WHERE s.userId=? 
      ORDER BY s.createdAt DESC 
      LIMIT 50`, [userId]);

    // Calculate averages
    const avg = stats.length > 0 ? {
      aes:     (stats.reduce((a,s)=>a+s.aesTimeMs,0)     / stats.length).toFixed(2),
      des:     (stats.reduce((a,s)=>a+s.desTimeMs,0)     / stats.length).toFixed(2),
      blowfish:(stats.reduce((a,s)=>a+s.blowfishTimeMs,0) / stats.length).toFixed(2),
      stego:   (stats.reduce((a,s)=>a+s.stegoTimeMs,0)   / stats.length).toFixed(2),
      total:   (stats.reduce((a,s)=>a+s.totalTimeMs,0)   / stats.length).toFixed(2),
    } : { aes:'0', des:'0', blowfish:'0', stego:'0', total:'0' };

    res.json({ stats, avg, count: stats.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get global encryption performance (admin)
router.get('/perf/global', requireAuth, async (req, res) => {
  try {
    const stats = await q(`SELECT 
      AVG(aesTimeMs) AS avgAes, AVG(desTimeMs) AS avgDes,
      AVG(blowfishTimeMs) AS avgBlowfish, AVG(stegoTimeMs) AS avgStego,
      AVG(totalTimeMs) AS avgTotal, COUNT(*) AS total,
      MIN(totalTimeMs) AS minTime, MAX(totalTimeMs) AS maxTime
      FROM encryption_stats`);
    res.json(stats[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════
// FEATURE 11 — CHATBOT MEMORY
// ════════════════════════════════════════════════════

// Save a chat message
router.post('/chat-memory', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { role, content } = req.body;
    if (!role || !content) return res.status(400).json({ error: 'role and content required' });

    const chatId = uuidv4();
    await q('INSERT INTO chat_history (chatId,userId,role,content) VALUES (?,?,?,?)',
      [chatId, userId, role, content]);

    // Keep only last 100 messages per user
    await q(`DELETE FROM chat_history WHERE userId=? AND chatId NOT IN (
      SELECT chatId FROM (SELECT chatId FROM chat_history WHERE userId=? ORDER BY createdAt DESC LIMIT 100) t
    )`, [userId, userId]);

    res.json({ success: true, chatId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get chat history for current user
router.get('/chat-memory', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 20;
    const history = await q(`SELECT role, content, createdAt FROM chat_history 
      WHERE userId=? ORDER BY createdAt ASC LIMIT ${limit}`, [userId]);
    res.json({ history, count: history.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Clear chat history
router.delete('/chat-memory', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    await q('DELETE FROM chat_history WHERE userId=?', [userId]);
    res.json({ success: true, message: 'Chat history cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════
// THEME (Feature 3 — Dark/Light Mode)
// ════════════════════════════════════════════════════

// Save user theme preference
router.post('/theme', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { theme } = req.body;
    if (!['dark','light'].includes(theme)) return res.status(400).json({ error: 'Invalid theme' });
    await q('UPDATE users SET theme=? WHERE userId=?', [theme, userId]);
    res.json({ success: true, theme });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user theme
router.get('/theme', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await q1('SELECT theme FROM users WHERE userId=?', [userId]);
    res.json({ theme: user?.theme || 'dark' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.logFileAccess = logFileAccess;