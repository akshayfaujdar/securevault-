'use strict';
const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');


let db;
function getDB() { if (!db) db = require('../services/localDB'); return db; }

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ── DASHBOARD STATS ───────────────────────────────────
router.get('/dashboard', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    res.json(await adminDB.getDashboardStats());
  } catch (err) { next(err); }
});

// ── USERS ────────────────────────────────────────────
router.get('/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    const users = await adminDB.getAllUsers();
    res.json({ users, count: users.length });
  } catch (err) { next(err); }
});

router.delete('/users/:userId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    await adminDB.deleteUser(req.params.userId);
    res.json({ message: 'User deleted', userId: req.params.userId });
  } catch (err) { next(err); }
});

// Update user role/plan
router.patch('/users/:userId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { userDB } = getDB();
    const { role, plan, storageMax } = req.body;
    const updates = {};
    if (role)       updates.role       = role;
    if (plan)       updates.plan       = plan;
    if (storageMax) updates.storageMax = storageMax;
    await userDB.update(req.params.userId, updates);
    res.json({ message: 'User updated' });
  } catch (err) { next(err); }
});

// ── FILES ────────────────────────────────────────────
router.get('/files', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    const files = await adminDB.getAllFiles();
    res.json({ files, count: files.length });
  } catch (err) { next(err); }
});

// ── SHARES ───────────────────────────────────────────
router.get('/shares', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    const shares = await adminDB.getAllShares();
    res.json({ shares, count: shares.length });
  } catch (err) { next(err); }
});

// ── ACTIVITY LOG ─────────────────────────────────────
router.get('/activity', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    const logs = await adminDB.getRecentActivity(100);
    res.json({ logs, count: logs.length });
  } catch (err) { res.json({ logs: [], count: 0 }); }
});

// ── MONTHLY STATS ────────────────────────────────────
router.get('/monthly', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    res.json(await adminDB.getMonthlyStats());
  } catch (err) { res.json([]); }
});

// ── EXPORT AUDIT LOG AS CSV ───────────────────────────
router.get('/export/activity', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    const logs = await adminDB.getRecentActivity(1000);

    const rows = logs.map(l => [
      l.logId||'',
      l.event||'',
      l.userName||l.userId||'',
      l.userEmail||'',
      l.fileName||'',
      l.ip||'',
      l.createdAt ? new Date(l.createdAt).toISOString() : '',
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));

    const header = '"Log ID","Event","User","Email","File","IP","Timestamp"';
    const csv    = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="securevault_activity_log.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

// ── EXPORT USERS AS CSV ───────────────────────────────
router.get('/export/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    const users = await adminDB.getAllUsers();

    const rows = users.map(u => [
      u.userId||'', u.name||'', u.email||'',
      u.role||'', u.plan||'',
      Math.round((u.storageUsed||0)/1024/1024) + ' MB',
      u.createdAt ? new Date(u.createdAt).toISOString() : '',
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));

    const header = '"User ID","Name","Email","Role","Plan","Storage Used","Registered"';
    const csv    = [header, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="securevault_users.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

// ── AI THREAT DETECTION ───────────────────────────────
router.get('/threats', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { adminDB } = getDB();
    const logs = await adminDB.getRecentActivity(500);

    const threats = [];

    // Detect multiple failed logins from same IP
    const failedByIP = {};
    logs.filter(l => l.event === 'LOGIN_FAILED').forEach(l => {
      failedByIP[l.ip] = (failedByIP[l.ip] || 0) + 1;
    });
    Object.entries(failedByIP).forEach(([ip, count]) => {
      if (count >= 3) threats.push({
        type: 'BRUTE_FORCE', severity: count >= 5 ? 'HIGH' : 'MEDIUM',
        message: `${count} failed login attempts from IP ${ip}`,
        ip, count,
      });
    });

    // Detect multiple failed logins for same user
    const failedByUser = {};
    logs.filter(l => l.event === 'LOGIN_FAILED').forEach(l => {
      failedByUser[l.userId] = (failedByUser[l.userId] || 0) + 1;
    });
    Object.entries(failedByUser).forEach(([userId, count]) => {
      if (count >= 3) threats.push({
        type: 'ACCOUNT_ATTACK', severity: 'HIGH',
        message: `${count} failed login attempts on user ${userId}`,
        userId, count,
      });
    });

    // Detect mass file deletion
    const deletions = logs.filter(l => l.event === 'FILE_DELETED');
    const delByUser = {};
    deletions.forEach(l => { delByUser[l.userId] = (delByUser[l.userId]||0) + 1; });
    Object.entries(delByUser).forEach(([userId, count]) => {
      if (count >= 5) threats.push({
        type: 'MASS_DELETION', severity: 'MEDIUM',
        message: `User ${userId} deleted ${count} files recently`,
        userId, count,
      });
    });

    // Detect logins from multiple IPs for same user
    const ipsByUser = {};
    logs.filter(l => l.event === 'LOGIN_SUCCESS').forEach(l => {
      if (!ipsByUser[l.userId]) ipsByUser[l.userId] = new Set();
      if (l.ip) ipsByUser[l.userId].add(l.ip);
    });
    Object.entries(ipsByUser).forEach(([userId, ips]) => {
      if (ips.size >= 3) threats.push({
        type: 'MULTIPLE_LOCATIONS', severity: 'LOW',
        message: `User ${userId} logged in from ${ips.size} different IP addresses`,
        userId, count: ips.size,
      });
    });

    res.json({
      threats,
      summary: {
        total  : threats.length,
        high   : threats.filter(t => t.severity === 'HIGH').length,
        medium : threats.filter(t => t.severity === 'MEDIUM').length,
        low    : threats.filter(t => t.severity === 'LOW').length,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;