'use strict';
// ═══════════════════════════════════════════════════════
// FEATURE 18 — AI RISK SCORE
// FEATURE 19 — REAL-TIME DASHBOARD (WebSockets via SSE)
// FEATURE 20 — SECURITY SCORE
// File: C:\Projects\securevault\backend\src\routes\analytics.js
// ═══════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');

const { pool } = require('../services/localDB');
async function q(sql, p=[])  { const [r] = await pool.query(sql,p); return r; }
async function q1(sql, p=[]) { return (await q(sql,p))[0]||null; }

// ── SSE clients store (for real-time) ────────────────
const sseClients = new Map();

// ════════════════════════════════════════════════════
// FEATURE 18 — AI RISK SCORE
// ════════════════════════════════════════════════════

// Calculate and get risk score for user
router.get('/risk-score', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Gather user behavior data
    const [loginCount]  = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="USER_LOGIN"', [userId]);
    const [failedLogin] = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="LOGIN_FAILED"', [userId]);
    const [fileCount]   = await q('SELECT COUNT(*) AS c FROM files WHERE userId=? AND status="active"', [userId]);
    const [shareCount]  = await q('SELECT COUNT(*) AS c FROM share_links WHERE senderId=?', [userId]);
    const [dlCount]     = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="FILE_DOWNLOADED"', [userId]);
    const [delCount]    = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="FILE_DELETED"', [userId]);
    const user          = await q1('SELECT * FROM users WHERE userId=?', [userId]);

    // Recent activity (last 24 hours)
    const [recentActivity] = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND createdAt > DATE_SUB(NOW(), INTERVAL 24 HOUR)', [userId]);
    const [uniqueIPs]      = await q('SELECT COUNT(DISTINCT ip) AS c FROM audit_log WHERE userId=? AND createdAt > DATE_SUB(NOW(), INTERVAL 7 DAY)', [userId]);

    // Calculate risk factors
    const factors = [];
    let riskScore = 0;

    // Failed login attempts
    if (failedLogin.c > 10) {
      riskScore += 30;
      factors.push({ factor: 'Multiple Failed Logins', severity: 'high', score: 30, detail: `${failedLogin.c} failed attempts detected` });
    } else if (failedLogin.c > 3) {
      riskScore += 15;
      factors.push({ factor: 'Failed Login Attempts', severity: 'medium', score: 15, detail: `${failedLogin.c} failed attempts` });
    }

    // Multiple IP addresses
    if (uniqueIPs.c > 5) {
      riskScore += 20;
      factors.push({ factor: 'Multiple IP Addresses', severity: 'high', score: 20, detail: `${uniqueIPs.c} different IPs in last 7 days` });
    } else if (uniqueIPs.c > 2) {
      riskScore += 10;
      factors.push({ factor: 'Different IP Addresses', severity: 'medium', score: 10, detail: `${uniqueIPs.c} IPs detected` });
    }

    // High deletion rate
    if (delCount.c > 10) {
      riskScore += 25;
      factors.push({ factor: 'Mass File Deletion', severity: 'critical', score: 25, detail: `${delCount.c} files deleted` });
    }

    // Unusual activity hours (high recent activity)
    if (recentActivity.c > 50) {
      riskScore += 15;
      factors.push({ factor: 'Unusual High Activity', severity: 'medium', score: 15, detail: `${recentActivity.c} actions in last 24 hours` });
    }

    // No 2FA
    if (!user?.totpEnabled) {
      riskScore += 10;
      factors.push({ factor: '2FA Not Enabled', severity: 'low', score: 10, detail: 'Two-factor authentication is disabled' });
    }

    // Positive factors (reduce risk)
    if (user?.totpEnabled) {
      factors.push({ factor: '2FA Enabled', severity: 'positive', score: -10, detail: 'Good security practice' });
      riskScore = Math.max(0, riskScore - 10);
    }

    if (fileCount.c > 0 && shareCount.c === 0) {
      factors.push({ factor: 'No Unnecessary Sharing', severity: 'positive', score: -5, detail: 'Files not shared externally' });
      riskScore = Math.max(0, riskScore - 5);
    }

    riskScore = Math.min(100, Math.max(0, riskScore));
    const riskLevel = riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 20 ? 'medium' : 'low';

    // Store result
    await q(`INSERT INTO user_risk_scores (userId, riskScore, riskLevel, factors, lastUpdated)
      VALUES (?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE riskScore=VALUES(riskScore), riskLevel=VALUES(riskLevel), factors=VALUES(factors), lastUpdated=NOW()`,
      [userId, riskScore, riskLevel, JSON.stringify(factors)]);

    res.json({
      userId,
      riskScore,
      riskLevel,
      factors,
      stats: {
        logins: loginCount.c,
        failedLogins: failedLogin.c,
        files: fileCount.c,
        shares: shareCount.c,
        downloads: dlCount.c,
        deletions: delCount.c,
        recentActivity: recentActivity.c,
        uniqueIPs: uniqueIPs.c
      },
      message: riskScore >= 70
        ? '🚨 High risk detected! Review your account activity.'
        : riskScore >= 40
        ? '⚠️ Moderate risk. Consider enabling 2FA.'
        : riskScore >= 20
        ? '🟡 Low-medium risk. Account looks mostly safe.'
        : '✅ Low risk. Your account activity looks normal.',
      lastUpdated: new Date().toISOString()
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get risk history
router.get('/risk-history', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const history = await q('SELECT * FROM user_risk_scores WHERE userId=? ORDER BY lastUpdated DESC LIMIT 10', [userId]);
    res.json({ history: history.map(h => ({ ...h, factors: JSON.parse(h.factors || '[]') })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════
// FEATURE 19 — REAL-TIME DASHBOARD (Server-Sent Events)
// ════════════════════════════════════════════════════

// SSE endpoint — client connects here for live updates
router.get('/realtime', requireAuth, (req, res) => {
  const userId = req.user.userId;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Register client
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Real-time updates active', timestamp: new Date().toISOString() })}\n\n`);

  // Send heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    try { res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`); }
    catch(e) { clearInterval(heartbeat); }
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.get(userId)?.delete(res);
    if (sseClients.get(userId)?.size === 0) sseClients.delete(userId);
  });
});

// Broadcast event to a user (called internally)
function broadcastToUser(userId, eventData) {
  const clients = sseClients.get(userId);
  if (!clients || clients.size === 0) return;
  const message = `data: ${JSON.stringify({ ...eventData, timestamp: new Date().toISOString() })}\n\n`;
  clients.forEach(client => {
    try { client.write(message); } catch(e) { clients.delete(client); }
  });
}

// Broadcast to all connected users (admin use)
function broadcastToAll(eventData) {
  sseClients.forEach((clients, userId) => {
    broadcastToUser(userId, eventData);
  });
}

// Get connected users count
router.get('/realtime/status', requireAuth, (req, res) => {
  res.json({
    connectedUsers: sseClients.size,
    totalConnections: Array.from(sseClients.values()).reduce((sum, set) => sum + set.size, 0),
    realtimeActive: true
  });
});

// Send test event
router.post('/realtime/test', requireAuth, (req, res) => {
  const userId = req.user.userId;
  broadcastToUser(userId, {
    type: 'test',
    message: '🔴 Real-time connection is working!',
    data: { test: true }
  });
  res.json({ success: true, message: 'Test event sent to your connected clients' });
});

// Get live stats for dashboard
router.get('/live-stats', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const [files]    = await q('SELECT COUNT(*) AS c FROM files WHERE userId=? AND status="active"', [userId]);
    const [storage]  = await q('SELECT COALESCE(SUM(sizeBytes),0) AS total FROM files WHERE userId=? AND status="active"', [userId]);
    const [shared]   = await q('SELECT COUNT(*) AS c FROM share_links WHERE senderId=?', [userId]);
    const [received] = await q('SELECT COUNT(*) AS c FROM share_links WHERE recipientId=? AND status="pending"', [userId]);
    const [today]    = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND DATE(createdAt)=CURDATE()', [userId]);

    res.json({
      files: files.c,
      storage: storage.total,
      shared: shared.c,
      pendingReceived: received.c,
      todayActivity: today.c,
      timestamp: new Date().toISOString()
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════
// FEATURE 20 — SECURITY SCORE
// ════════════════════════════════════════════════════

router.get('/security-score', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user   = await q1('SELECT * FROM users WHERE userId=?', [userId]);
    const files  = await q('SELECT * FROM files WHERE userId=? AND status="active"', [userId]);

    const checks = [];
    let totalScore = 0;
    const maxScore = 100;

    // Check 1: 2FA enabled (20 points)
    const twofa = !!user?.totpEnabled;
    checks.push({
      name: 'Two-Factor Authentication',
      passed: twofa,
      points: twofa ? 20 : 0,
      maxPoints: 20,
      icon: twofa ? '✅' : '❌',
      tip: twofa ? 'Great! 2FA is protecting your account.' : 'Enable 2FA in Settings for +20 points'
    });
    if (twofa) totalScore += 20;

    // Check 2: Has uploaded files (10 points)
    const hasFiles = files.length > 0;
    checks.push({
      name: 'Using Encryption',
      passed: hasFiles,
      points: hasFiles ? 10 : 0,
      maxPoints: 10,
      icon: hasFiles ? '✅' : '⚠️',
      tip: hasFiles ? 'You are actively using encrypted storage.' : 'Upload files to start using encryption'
    });
    if (hasFiles) totalScore += 10;

    // Check 3: Using triple encryption (20 points)
    const usesTriple = files.some(f => (f.algo || '').includes('hybrid') || (f.algo || '').includes('AES'));
    checks.push({
      name: 'Triple Encryption Active',
      passed: usesTriple,
      points: usesTriple ? 20 : 0,
      maxPoints: 20,
      icon: usesTriple ? '✅' : '⚠️',
      tip: usesTriple ? 'AES+3DES+Blowfish protecting your files.' : 'Upload a file to activate triple encryption'
    });
    if (usesTriple) totalScore += 20;

    // Check 4: Has digital signature keypair (15 points)
    let hasKeypair = false;
    try {
      const kp = await q1('SELECT userId FROM user_keypairs WHERE userId=?', [userId]);
      hasKeypair = !!kp;
    } catch(e) {}
    checks.push({
      name: 'Digital Signature Keys',
      passed: hasKeypair,
      points: hasKeypair ? 15 : 0,
      maxPoints: 15,
      icon: hasKeypair ? '✅' : '❌',
      tip: hasKeypair ? 'RSA-2048 keys active for file signing.' : 'Generate a key pair in sidebar for +15 points'
    });
    if (hasKeypair) totalScore += 15;

    // Check 5: No failed logins recently (15 points)
    const [failedLogins] = await q('SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND event="LOGIN_FAILED" AND createdAt > DATE_SUB(NOW(), INTERVAL 7 DAY)', [userId]);
    const noFailedLogins = failedLogins.c === 0;
    checks.push({
      name: 'No Recent Failed Logins',
      passed: noFailedLogins,
      points: noFailedLogins ? 15 : 0,
      maxPoints: 15,
      icon: noFailedLogins ? '✅' : '⚠️',
      tip: noFailedLogins ? 'No suspicious login attempts detected.' : `${failedLogins.c} failed login attempts in last 7 days`
    });
    if (noFailedLogins) totalScore += 15;

    // Check 6: Has signed files (10 points)
    let hasSignedFiles = false;
    try {
      const signed = await q1('SELECT fileId FROM files WHERE userId=? AND signature IS NOT NULL AND status="active"', [userId]);
      hasSignedFiles = !!signed;
    } catch(e) {}
    checks.push({
      name: 'Files Digitally Signed',
      passed: hasSignedFiles,
      points: hasSignedFiles ? 10 : 0,
      maxPoints: 10,
      icon: hasSignedFiles ? '✅' : '❌',
      tip: hasSignedFiles ? 'You are signing files for authenticity.' : 'Sign a file using ✍️ Sign button for +10 points'
    });
    if (hasSignedFiles) totalScore += 10;

    // Check 7: Profile complete (10 points)
    const profileComplete = !!(user?.name && user?.email);
    checks.push({
      name: 'Complete Profile',
      passed: profileComplete,
      points: profileComplete ? 10 : 0,
      maxPoints: 10,
      icon: profileComplete ? '✅' : '❌',
      tip: profileComplete ? 'Profile is complete.' : 'Complete your profile for +10 points'
    });
    if (profileComplete) totalScore += 10;

    const grade = totalScore >= 90 ? 'A+' : totalScore >= 80 ? 'A' : totalScore >= 70 ? 'B' : totalScore >= 60 ? 'C' : totalScore >= 50 ? 'D' : 'F';
    const gradeColor = totalScore >= 80 ? '#10b981' : totalScore >= 60 ? '#f59e0b' : '#ef4444';

    // Store score
    await q(`INSERT INTO security_scores (userId, totalScore, maxScore, grade, breakdown, lastUpdated)
      VALUES (?,?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE totalScore=VALUES(totalScore), grade=VALUES(grade), breakdown=VALUES(breakdown), lastUpdated=NOW()`,
      [userId, totalScore, maxScore, grade, JSON.stringify(checks)]);

    res.json({
      userId,
      totalScore,
      maxScore,
      percentage: Math.round((totalScore / maxScore) * 100),
      grade,
      gradeColor,
      checks,
      nextSteps: checks.filter(c => !c.passed).map(c => c.tip),
      message: totalScore >= 80
        ? '🏆 Excellent security! Your vault is very well protected.'
        : totalScore >= 60
        ? '👍 Good security. A few improvements can make it better.'
        : totalScore >= 40
        ? '⚠️ Fair security. Please address the issues above.'
        : '🚨 Poor security. Take action immediately!'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.broadcastToUser = broadcastToUser;
module.exports.broadcastToAll  = broadcastToAll;