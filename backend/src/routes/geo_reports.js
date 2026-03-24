'use strict';
// ═══════════════════════════════════════════════════════
// FEATURE 21 — GEOGRAPHIC ACCESS MAP
// FEATURE 22 — USER ACTIVITY REPORT
// File: C:\Projects\securevault\backend\src\routes\geo_reports.js
// ═══════════════════════════════════════════════════════

const express  = require('express');
const router   = express.Router();
const https    = require('https');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');

const { pool } = require('../services/localDB');
async function q(sql, p=[])  { const [r] = await pool.query(sql,p); return r; }
async function q1(sql, p=[]) { return (await q(sql,p))[0]||null; }

// ════════════════════════════════════════════════════
// FEATURE 21 — GEOGRAPHIC ACCESS MAP
// ════════════════════════════════════════════════════

// Look up IP location using free ip-api.com
async function lookupIP(ip) {
  return new Promise((resolve) => {
    if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168') || ip.startsWith('10.')) {
      return resolve({ country: 'Local', city: 'Localhost', latitude: 20.5937, longitude: 78.9629, status: 'local' });
    }
    const req = https.request({
      hostname: 'ip-api.com',
      path: `/json/${ip}?fields=status,country,city,lat,lon,regionName`,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          resolve({ country: d.country || 'Unknown', city: d.city || 'Unknown', region: d.regionName, latitude: d.lat || 0, longitude: d.lon || 0, status: d.status });
        } catch(e) { resolve({ country: 'Unknown', city: 'Unknown', latitude: 0, longitude: 0 }); }
      });
    });
    req.on('error', () => resolve({ country: 'Unknown', city: 'Unknown', latitude: 0, longitude: 0 }));
    req.end();
  });
}

// Log access with location
router.post('/log-location', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const ip     = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const event  = req.body.event || 'PAGE_VIEW';

    const location = await lookupIP(ip.replace('::ffff:', ''));

    const locationId = uuidv4();
    await q(`INSERT INTO access_locations (locationId,userId,ip,country,city,latitude,longitude,event)
      VALUES (?,?,?,?,?,?,?,?)`,
      [locationId, userId, ip, location.country, location.city, location.latitude, location.longitude, event]);

    res.json({ success: true, location });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get access map data for user
router.get('/map', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const locations = await q(`SELECT country, city, latitude, longitude, event,
      COUNT(*) AS accessCount, MAX(createdAt) AS lastAccess
      FROM access_locations
      WHERE userId=?
      GROUP BY country, city, latitude, longitude, event
      ORDER BY lastAccess DESC`, [userId]);

    // Get all raw locations for timeline
    const timeline = await q(`SELECT * FROM access_locations WHERE userId=? ORDER BY createdAt DESC LIMIT 50`, [userId]);

    // Country summary
    const countrySummary = {};
    locations.forEach(l => {
      if (!countrySummary[l.country]) countrySummary[l.country] = 0;
      countrySummary[l.country] += l.accessCount;
    });

    res.json({
      locations,
      timeline,
      countrySummary,
      totalCountries: Object.keys(countrySummary).length,
      totalAccesses: locations.reduce((s, l) => s + l.accessCount, 0)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Auto-log location on login (called from auth route)
router.post('/auto-log', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const ip = (req.ip || '127.0.0.1').replace('::ffff:', '');
    const location = await lookupIP(ip);

    await q(`INSERT INTO access_locations (locationId,userId,ip,country,city,latitude,longitude,event)
      VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), userId, ip, location.country, location.city, location.latitude, location.longitude, 'LOGIN']);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get suspicious locations (multiple countries in short time)
router.get('/suspicious-locations', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const locations = await q(`SELECT DISTINCT country, city, ip, createdAt
      FROM access_locations
      WHERE userId=? AND createdAt > DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY createdAt DESC`, [userId]);

    const countries = [...new Set(locations.map(l => l.country))];
    const suspicious = countries.length > 3;

    res.json({
      suspicious,
      countries,
      locations,
      message: suspicious
        ? `⚠️ Access from ${countries.length} countries in last 7 days`
        : `✅ Access from ${countries.length} country/countries — looks normal`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════
// FEATURE 22 — USER ACTIVITY REPORT
// ════════════════════════════════════════════════════

// Generate activity report for user
router.get('/report', requireAuth, async (req, res) => {
  try {
    const userId   = req.user.userId;
    const period   = req.query.period || 'weekly';
    const days     = period === 'monthly' ? 30 : period === 'daily' ? 1 : 7;

    const user     = await q1('SELECT * FROM users WHERE userId=?', [userId]);
    const files    = await q(`SELECT * FROM files WHERE userId=? AND status='active' AND createdAt > DATE_SUB(NOW(), INTERVAL ${days} DAY)`, [userId]);
    const allFiles = await q('SELECT COUNT(*) AS c FROM files WHERE userId=? AND status="active"', [userId]);
    const activity = await q(`SELECT event, COUNT(*) AS count FROM audit_log WHERE userId=? AND createdAt > DATE_SUB(NOW(), INTERVAL ${days} DAY) GROUP BY event ORDER BY count DESC`, [userId]);
    const shared   = await q(`SELECT COUNT(*) AS c FROM share_links WHERE senderId=? AND createdAt > DATE_SUB(NOW(), INTERVAL ${days} DAY)`, [userId]);
    const received = await q(`SELECT COUNT(*) AS c FROM share_links WHERE recipientId=? AND createdAt > DATE_SUB(NOW(), INTERVAL ${days} DAY)`, [userId]);
    const storage  = await q('SELECT COALESCE(SUM(sizeBytes),0) AS total FROM files WHERE userId=? AND status="active"', [userId]);
    const topFiles = await q(`SELECT originalName, sizeBytes, algo, createdAt FROM files WHERE userId=? AND status='active' ORDER BY createdAt DESC LIMIT 5`, [userId]);

    const totalActivity = activity.reduce((s, a) => s + a.count, 0);

    const reportData = {
      period,
      days,
      generatedAt: new Date().toISOString(),
      user: { name: user?.name, email: user?.email },
      summary: {
        newFiles:      files.length,
        totalFiles:    allFiles[0]?.c || 0,
        totalStorage:  storage[0]?.total || 0,
        filesSent:     shared[0]?.c || 0,
        filesReceived: received[0]?.c || 0,
        totalActivity
      },
      activity,
      topFiles,
      securityHighlights: [
        `All ${allFiles[0]?.c || 0} files protected with AES-256 + Triple-DES + Blowfish`,
        `LSB Steganography active on all uploaded files`,
        `${files.length} new files uploaded in the last ${days} days`,
        user?.totpEnabled ? '2FA is enabled on your account' : '⚠️ 2FA is not enabled — recommended to enable it'
      ]
    };

    // Store report
    const reportId = uuidv4();
    await q(`INSERT INTO activity_reports (reportId,userId,reportType,reportData,sentAt)
      VALUES (?,?,?,?,NOW())`,
      [reportId, userId, period, JSON.stringify(reportData)]);

    res.json({ reportId, ...reportData });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Send report via email
router.post('/report/send', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user   = await q1('SELECT * FROM users WHERE userId=?', [userId]);
    const period = req.body.period || 'weekly';

    // Generate the report first
    const days     = period === 'monthly' ? 30 : 7;
    const files    = await q(`SELECT COUNT(*) AS c FROM files WHERE userId=? AND status='active'`, [userId]);
    const activity = await q(`SELECT COUNT(*) AS c FROM audit_log WHERE userId=? AND createdAt > DATE_SUB(NOW(), INTERVAL ${days} DAY)`, [userId]);
    const shared   = await q(`SELECT COUNT(*) AS c FROM share_links WHERE senderId=? AND createdAt > DATE_SUB(NOW(), INTERVAL ${days} DAY)`, [userId]);
    const storage  = await q('SELECT COALESCE(SUM(sizeBytes),0) AS total FROM files WHERE userId=? AND status="active"', [userId]);

    // Send email if nodemailer is configured
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });

      const storageGB = ((storage[0]?.total || 0) / 1073741824).toFixed(2);
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <div style="background:linear-gradient(135deg,#4f46e5,#06b6d4);padding:24px;border-radius:12px;color:white;margin-bottom:20px">
            <h1 style="margin:0;font-size:24px">🔐 SecureVault</h1>
            <p style="margin:8px 0 0;opacity:0.85">${period.charAt(0).toUpperCase() + period.slice(1)} Activity Report</p>
          </div>
          <p>Hello <strong>${user?.name}</strong>,</p>
          <p>Here is your ${period} SecureVault activity summary:</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0">
            ${[
              ['📁 Total Files', files[0]?.c || 0],
              ['⚡ Activities', activity[0]?.c || 0],
              ['📤 Files Shared', shared[0]?.c || 0],
              ['💾 Storage Used', storageGB + ' GB'],
            ].map(([label, value]) => `
              <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center">
                <div style="font-size:24px;font-weight:800;color:#4f46e5">${value}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:4px">${label}</div>
              </div>`).join('')}
          </div>
          <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin:20px 0">
            <h3 style="color:#065f46;margin:0 0 8px">🛡️ Security Status</h3>
            <p style="color:#065f46;margin:0;font-size:13px">All your files are protected with triple encryption (AES-256-CBC + Triple-DES + Blowfish) and LSB Steganography.</p>
          </div>
          <p style="color:#6b7280;font-size:12px">This report was generated automatically by SecureVault.</p>
        </div>`;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user?.email,
        subject: `📊 Your ${period} SecureVault Report`,
        html
      });

      await q('UPDATE users SET lastReportSent=NOW() WHERE userId=?', [userId]);
      res.json({ success: true, message: `Report sent to ${user?.email}` });
    } catch(emailErr) {
      res.json({ success: false, message: 'Report generated but email failed: ' + emailErr.message, reportData: { files: files[0]?.c, activity: activity[0]?.c } });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get report history
router.get('/reports', requireAuth, async (req, res) => {
  try {
    const userId  = req.user.userId;
    const reports = await q('SELECT reportId, reportType, sentAt, createdAt FROM activity_reports WHERE userId=? ORDER BY createdAt DESC LIMIT 10', [userId]);
    res.json({ reports });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle auto reports
router.post('/reports/toggle', requireAuth, async (req, res) => {
  try {
    const userId  = req.user.userId;
    const enabled = req.body.enabled;
    try { await q('ALTER TABLE users ADD COLUMN activityReports BOOLEAN DEFAULT TRUE', []); } catch(e) {}
    await q('UPDATE users SET activityReports=? WHERE userId=?', [enabled ? 1 : 0, userId]);
    res.json({ success: true, activityReports: enabled });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;