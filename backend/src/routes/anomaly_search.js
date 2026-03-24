'use strict';
// ═══════════════════════════════════════════════════════
// FEATURE 28 — AI ANOMALY DETECTION
// FEATURE 29 — SMART SEARCH
// File: C:\Projects\securevault\backend\src\routes\anomaly_search.js
// ═══════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const https   = require('https');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../services/localDB');

async function q(sql, p=[])  { const [r] = await pool.query(sql,p); return r; }
async function q1(sql, p=[]) { return (await q(sql,p))[0]||null; }

// ── Groq AI call ──────────────────────────────────────
async function callGroqAI(systemPrompt, userPrompt) {
  return new Promise((resolve) => {
    const apiKey = process.env.GROQ_API_KEY || '';
    if (!apiKey) return resolve('{}');

    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   }
      ]
    });

    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.choices?.[0]?.message?.content || '{}');
        } catch(e) { resolve('{}'); }
      });
    });
    req.on('error', () => resolve('{}'));
    req.write(body);
    req.end();
  });
}

// ════════════════════════════════════════════════════
// FEATURE 28 — AI ANOMALY DETECTION
// ════════════════════════════════════════════════════

// Detect anomalies for a user
router.post('/detect', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Gather behavioral data
    const [loginCount]    = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="USER_LOGIN" AND createdAt > DATE_SUB(NOW(), INTERVAL 7 DAY)', [userId]);
    const [failedLogin]   = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="LOGIN_FAILED" AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)', [userId]);
    const [uploadCount]   = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="FILE_UPLOADED" AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)', [userId]);
    const [deleteCount]   = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="FILE_DELETED" AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)', [userId]);
    const [downloadCount] = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="FILE_DOWNLOADED" AND createdAt > DATE_SUB(NOW(), INTERVAL 1 HOUR)', [userId]);
    const [uniqueIPs]     = await q('SELECT COUNT(DISTINCT ip) AS c FROM audit_log WHERE userId=? AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)', [userId]);
    const [shareCount]    = await q('SELECT COUNT(*) AS c FROM share_links WHERE senderId=? AND createdAt > DATE_SUB(NOW(), INTERVAL 1 HOUR)', [userId]);
    const [nightActivity] = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND HOUR(createdAt) BETWEEN 0 AND 5 AND createdAt > DATE_SUB(NOW(), INTERVAL 7 DAY)', [userId]);

    const anomalies = [];

    // Rule-based detection
    if (failedLogin.c >= 5) {
      anomalies.push({
        type: 'BRUTE_FORCE_ATTEMPT',
        severity: failedLogin.c >= 10 ? 'critical' : 'high',
        description: `${failedLogin.c} failed login attempts in last 24 hours`,
        evidence: { failedLogins: failedLogin.c, timeWindow: '24h' },
        recommendation: 'Enable 2FA and check for unauthorized access'
      });
    }

    if (uniqueIPs.c >= 4) {
      anomalies.push({
        type: 'MULTIPLE_LOCATIONS',
        severity: uniqueIPs.c >= 6 ? 'high' : 'medium',
        description: `Access from ${uniqueIPs.c} different IP addresses in 24 hours`,
        evidence: { uniqueIPs: uniqueIPs.c, timeWindow: '24h' },
        recommendation: 'Verify these are all your own devices'
      });
    }

    if (deleteCount.c >= 5) {
      anomalies.push({
        type: 'MASS_DELETION',
        severity: deleteCount.c >= 10 ? 'critical' : 'high',
        description: `${deleteCount.c} files deleted in last 24 hours`,
        evidence: { filesDeleted: deleteCount.c, timeWindow: '24h' },
        recommendation: 'Check recycle bin and verify intentional deletions'
      });
    }

    if (downloadCount.c >= 20) {
      anomalies.push({
        type: 'BULK_DOWNLOAD',
        severity: 'medium',
        description: `${downloadCount.c} downloads in last hour`,
        evidence: { downloads: downloadCount.c, timeWindow: '1h' },
        recommendation: 'Verify this activity was intentional'
      });
    }

    if (shareCount.c >= 10) {
      anomalies.push({
        type: 'MASS_SHARING',
        severity: 'medium',
        description: `${shareCount.c} files shared in last hour`,
        evidence: { shares: shareCount.c, timeWindow: '1h' },
        recommendation: 'Review shared files for sensitive content'
      });
    }

    if (nightActivity.c >= 20) {
      anomalies.push({
        type: 'UNUSUAL_HOURS',
        severity: 'low',
        description: `${nightActivity.c} actions between midnight-5am in last 7 days`,
        evidence: { nightActions: nightActivity.c, hours: '00:00-05:00' },
        recommendation: 'Review if this matches your usage pattern'
      });
    }

    // AI-enhanced analysis if Groq is configured
    if (process.env.GROQ_API_KEY && anomalies.length > 0) {
      try {
        const aiResponse = await callGroqAI(
          'You are a security analyst. Analyze user behavior anomalies and provide risk assessment. Respond ONLY with valid JSON.',
          `Analyze these security anomalies and provide additional insights:
${JSON.stringify(anomalies, null, 2)}

User stats: logins=${loginCount.c}, uploads=${uploadCount.c}, deletes=${deleteCount.c}

Respond with JSON: {"overallRisk": "low|medium|high|critical", "aiInsight": "brief analysis", "topThreat": "most serious threat", "immediateAction": "what to do now"}`
        );

        try {
          const aiData = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
          if (aiData.aiInsight) {
            anomalies.forEach(a => { a.aiEnhanced = true; });
            return res.json({
              userId, anomalies,
              stats: { logins: loginCount.c, failedLogins: failedLogin.c, uploads: uploadCount.c, deletes: deleteCount.c, downloads: downloadCount.c, uniqueIPs: uniqueIPs.c },
              aiAnalysis: aiData,
              detectedAt: new Date().toISOString()
            });
          }
        } catch(e) {}
      } catch(e) {}
    }

    // Store anomalies
    for (const anomaly of anomalies) {
      await q(`INSERT INTO anomaly_detections 
        (anomalyId,userId,anomalyType,severity,description,evidence,resolved,detectedAt)
        VALUES (?,?,?,?,?,?,?,NOW())`,
        [uuidv4(), userId, anomaly.type, anomaly.severity,
         anomaly.description, JSON.stringify(anomaly.evidence), false]);
    }

    const overallRisk = anomalies.some(a => a.severity === 'critical') ? 'critical'
      : anomalies.some(a => a.severity === 'high') ? 'high'
      : anomalies.some(a => a.severity === 'medium') ? 'medium'
      : anomalies.length > 0 ? 'low' : 'none';

    res.json({
      userId,
      anomalies,
      overallRisk,
      stats: {
        logins: loginCount.c, failedLogins: failedLogin.c,
        uploads: uploadCount.c, deletes: deleteCount.c,
        downloads: downloadCount.c, uniqueIPs: uniqueIPs.c
      },
      message: anomalies.length === 0
        ? '✅ No anomalies detected — account activity looks normal'
        : `⚠️ ${anomalies.length} anomaly(s) detected`,
      detectedAt: new Date().toISOString()
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get anomaly history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const userId   = req.user.userId;
    const anomalies = await q('SELECT * FROM anomaly_detections WHERE userId=? ORDER BY detectedAt DESC LIMIT 50', [userId]);
    res.json({
      anomalies: anomalies.map(a => ({ ...a, evidence: JSON.parse(a.evidence || '{}') })),
      unresolved: anomalies.filter(a => !a.resolved).length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resolve anomaly
router.patch('/resolve/:anomalyId', requireAuth, async (req, res) => {
  try {
    const { anomalyId } = req.params;
    await q('UPDATE anomaly_detections SET resolved=TRUE WHERE anomalyId=? AND userId=?', [anomalyId, req.user.userId]);
    res.json({ success: true, message: 'Anomaly marked as resolved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin: detect anomalies for ALL users
router.post('/detect-all', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const users = await q('SELECT userId, email, name FROM users WHERE role="user"');
    const results = [];

    for (const user of users.slice(0, 20)) {
      const [failed]   = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="LOGIN_FAILED" AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)', [user.userId]);
      const [deleted]  = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="FILE_DELETED" AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)', [user.userId]);
      const [ips]      = await q('SELECT COUNT(DISTINCT ip) AS c FROM audit_log WHERE userId=? AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)', [user.userId]);

      const risk = failed.c >= 5 ? 'high' : deleted.c >= 10 ? 'high' : ips.c >= 5 ? 'medium' : 'low';
      if (risk !== 'low') {
        results.push({ userId: user.userId, name: user.name, email: user.email, risk, failedLogins: failed.c, deletions: deleted.c, uniqueIPs: ips.c });
      }
    }

    res.json({ scanned: users.length, flagged: results.length, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════
// FEATURE 29 — SMART SEARCH
// ════════════════════════════════════════════════════

// Index a file (call after upload)
router.post('/index/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=?', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Get folder name if file is in a folder
    let folderName = null;
    if (file.folderId) {
      try {
        const folder = await q1('SELECT name FROM folders WHERE folderId=?', [file.folderId]);
        folderName = folder?.name || null;
      } catch(e) {}
    }

    // Get tags
    let tags = '';
    try {
      const fileTags = await q('SELECT tag FROM file_tags WHERE fileId=? AND userId=?', [fileId, userId]);
      tags = fileTags.map(t => t.tag).join(' ');
    } catch(e) {}

    await q(`INSERT INTO search_index 
      (indexId, fileId, userId, fileName, tags, mimeType, sizeBytes, algo, folderName, uploadedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE fileName=VALUES(fileName), tags=VALUES(tags), folderName=VALUES(folderName)`,
      [uuidv4(), fileId, userId, file.originalName, tags, file.mimeType||'',
       file.sizeBytes||0, file.algo||'hybrid', folderName, file.createdAt]);

    res.json({ success: true, indexed: true, fileName: file.originalName });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rebuild search index for all user files
router.post('/index/rebuild', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const files  = await q('SELECT * FROM files WHERE userId=? AND status="active"', [userId]);

    let indexed = 0;
    for (const file of files) {
      try {
        let folderName = null;
        if (file.folderId) {
          const folder = await q1('SELECT name FROM folders WHERE folderId=?', [file.folderId]);
          folderName = folder?.name || null;
        }

        let tags = '';
        try {
          const fileTags = await q('SELECT tag FROM file_tags WHERE fileId=?', [file.fileId]);
          tags = fileTags.map(t => t.tag).join(' ');
        } catch(e) {}

        await q(`INSERT INTO search_index 
          (indexId,fileId,userId,fileName,tags,mimeType,sizeBytes,algo,folderName,uploadedAt)
          VALUES (?,?,?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE fileName=VALUES(fileName),tags=VALUES(tags),folderName=VALUES(folderName)`,
          [uuidv4(), file.fileId, userId, file.originalName, tags,
           file.mimeType||'', file.sizeBytes||0, file.algo||'hybrid', folderName, file.createdAt]);
        indexed++;
      } catch(e) {}
    }

    res.json({ success: true, indexed, total: files.length, message: `Indexed ${indexed} files` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Smart search with filters
router.get('/search', requireAuth, async (req, res) => {
  try {
    const userId    = req.user.userId;
    const { q: query, type, algo, folder, minSize, maxSize, from, to, sort } = req.query;

    if (!query && !type && !algo && !folder) {
      return res.status(400).json({ error: 'Provide at least one search parameter' });
    }

    // Build dynamic query
    let sql    = `SELECT si.*, f.createdAt AS fileCreatedAt, f.status 
                  FROM search_index si
                  LEFT JOIN files f ON f.fileId = si.fileId
                  WHERE si.userId=? AND f.status='active'`;
    const params = [userId];

    // Full text search across name, tags, folder
    if (query) {
      sql += ` AND (si.fileName LIKE ? OR si.tags LIKE ? OR si.folderName LIKE ?)`;
      const like = `%${query}%`;
      params.push(like, like, like);
    }

    // Filter by file type
    if (type) {
      const typeMap = {
        image:    ['jpg','jpeg','png','gif','webp','svg'],
        document: ['pdf','doc','docx','txt','md'],
        video:    ['mp4','avi','mov','mkv'],
        audio:    ['mp3','wav','ogg','m4a'],
        archive:  ['zip','tar','gz','rar'],
        code:     ['js','ts','py','java','c','cpp']
      };
      const exts = typeMap[type.toLowerCase()];
      if (exts) {
        sql += ` AND (${exts.map(() => 'si.fileName LIKE ?').join(' OR ')})`;
        exts.forEach(e => params.push(`%.${e}`));
      }
    }

    // Filter by algorithm
    if (algo) { sql += ` AND si.algo LIKE ?`; params.push(`%${algo}%`); }

    // Filter by folder
    if (folder) { sql += ` AND si.folderName LIKE ?`; params.push(`%${folder}%`); }

    // Filter by size
    if (minSize) { sql += ` AND si.sizeBytes >= ?`; params.push(parseInt(minSize)); }
    if (maxSize) { sql += ` AND si.sizeBytes <= ?`; params.push(parseInt(maxSize)); }

    // Filter by date
    if (from) { sql += ` AND si.uploadedAt >= ?`; params.push(from); }
    if (to)   { sql += ` AND si.uploadedAt <= ?`; params.push(to); }

    // Sorting
    const sortMap = {
      newest:  'si.uploadedAt DESC',
      oldest:  'si.uploadedAt ASC',
      largest: 'si.sizeBytes DESC',
      smallest:'si.sizeBytes ASC',
      name:    'si.fileName ASC'
    };
    sql += ` ORDER BY ${sortMap[sort] || 'si.uploadedAt DESC'} LIMIT 50`;

    const results = await q(sql, params);

    // Save search to history
    if (query) {
      await q('INSERT INTO search_history (searchId,userId,query,resultCount,searchedAt) VALUES (?,?,?,?,NOW())',
        [uuidv4(), userId, query, results.length]);
    }

    // Highlight matching terms in results
    const highlighted = results.map(r => ({
      ...r,
      highlight: query ? highlightText(r.fileName, query) : r.fileName,
      relevance: calculateRelevance(r, query)
    }));

    // Sort by relevance if text query
    if (query) highlighted.sort((a, b) => b.relevance - a.relevance);

    res.json({
      results: highlighted,
      count:   results.length,
      query:   { text: query, type, algo, folder, sort },
      searchedAt: new Date().toISOString()
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// AI-powered natural language search
router.post('/search/ai', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { query } = req.body;

    if (!query) return res.status(400).json({ error: 'query required' });

    // Get user's file list for context
    const files = await q('SELECT fileName, mimeType, sizeBytes, tags, folderName FROM search_index WHERE userId=? LIMIT 30', [userId]);

    let searchParams = { text: query, type: null, folder: null };

    // Use AI to understand natural language query
    if (process.env.GROQ_API_KEY) {
      try {
        const aiResponse = await callGroqAI(
          'You extract search parameters from natural language. Respond ONLY with valid JSON.',
          `User has these files: ${JSON.stringify(files.slice(0,10))}
          
Natural language query: "${query}"

Extract search params as JSON: {"text": "keywords to search", "type": "image|document|video|audio|archive|code|null", "folder": "folder name or null", "sort": "newest|oldest|largest|smallest|name"}`
        );

        const aiParams = JSON.parse(aiResponse.replace(/```json|```/g, '').trim());
        if (aiParams.text) searchParams = { ...searchParams, ...aiParams };
      } catch(e) {}
    }

    // Execute search with extracted params
    let sql    = `SELECT si.* FROM search_index si LEFT JOIN files f ON f.fileId=si.fileId WHERE si.userId=? AND f.status='active'`;
    const params = [userId];

    if (searchParams.text) {
      sql += ` AND (si.fileName LIKE ? OR si.tags LIKE ? OR si.folderName LIKE ?)`;
      const like = `%${searchParams.text}%`;
      params.push(like, like, like);
    }
    if (searchParams.folder) {
      sql += ` AND si.folderName LIKE ?`;
      params.push(`%${searchParams.folder}%`);
    }

    sql += ' ORDER BY si.uploadedAt DESC LIMIT 20';
    const results = await q(sql, params);

    res.json({
      results,
      count: results.length,
      originalQuery: query,
      interpretedAs: searchParams,
      aiPowered: !!process.env.GROQ_API_KEY
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get search suggestions
router.get('/search/suggest', requireAuth, async (req, res) => {
  try {
    const userId  = req.user.userId;
    const { q: query } = req.query;
    if (!query || query.length < 2) return res.json({ suggestions: [] });

    const files = await q(`SELECT DISTINCT fileName FROM search_index 
      WHERE userId=? AND fileName LIKE ? LIMIT 8`, [userId, `%${query}%`]);

    const tags  = await q(`SELECT DISTINCT tag FROM file_tags 
      WHERE userId=? AND tag LIKE ? LIMIT 5`, [userId, `%${query}%`]);

    res.json({
      suggestions: [
        ...files.map(f => ({ type: 'file', text: f.fileName })),
        ...tags.map(t =>  ({ type: 'tag',  text: t.tag }))
      ]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get search history
router.get('/search/history', requireAuth, async (req, res) => {
  try {
    const userId  = req.user.userId;
    const history = await q('SELECT * FROM search_history WHERE userId=? ORDER BY searchedAt DESC LIMIT 10', [userId]);
    res.json({ history });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper: highlight matching text
function highlightText(text, query) {
  if (!text || !query) return text;
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return text.replace(regex, match => `**${match}**`);
}

// Helper: calculate relevance score
function calculateRelevance(result, query) {
  if (!query) return 0;
  let score = 0;
  const q   = query.toLowerCase();
  const name = (result.fileName || '').toLowerCase();
  const tags = (result.tags || '').toLowerCase();

  if (name === q)           score += 100;
  if (name.startsWith(q))   score += 50;
  if (name.includes(q))     score += 30;
  if (tags.includes(q))     score += 20;
  return score;
}

module.exports = router;