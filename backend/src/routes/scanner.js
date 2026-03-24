'use strict';
// ═══════════════════════════════════════════════════════
// FEATURE 17 — AI FILE SCANNER
// File: C:\Projects\securevault\backend\src\routes\scanner.js
// Uses Groq AI to detect sensitive data patterns
// ═══════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const https   = require('https');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');

const { pool } = require('../services/localDB');
async function q(sql, p=[])  { const [r] = await pool.query(sql,p); return r; }
async function q1(sql, p=[]) { return (await q(sql,p))[0]||null; }

// ── Call Groq AI ──────────────────────────────────────
async function callGroq(prompt) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GROQ_API_KEY || '';
    if (!apiKey) return resolve('No AI key configured');

    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You are a security scanner. Analyze file metadata for sensitive data risks. Always respond with valid JSON only. No markdown, no explanation outside JSON.' },
        { role: 'user', content: prompt }
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

// ── Scan file by name/metadata ────────────────────────
router.post('/scan/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;

    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=? AND status="active"', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    // Check existing scan
    const existing = await q1('SELECT * FROM file_scan_results WHERE fileId=? ORDER BY scannedAt DESC', [fileId]);
    if (existing && req.query.force !== 'true') {
      return res.json({
        cached: true,
        scanId: existing.scanId,
        riskLevel: existing.riskLevel,
        riskScore: existing.riskScore,
        findings: JSON.parse(existing.findings || '[]'),
        scannedAt: existing.scannedAt
      });
    }

    // Build AI prompt from file metadata
    const prompt = `Analyze this file for security risks and sensitive data. Respond ONLY with JSON.

File metadata:
- Name: ${file.originalName}
- Type: ${file.mimeType || 'unknown'}
- Size: ${file.sizeBytes} bytes
- Extension: ${(file.originalName || '').split('.').pop()}

Respond with this exact JSON structure:
{
  "riskScore": <0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "findings": [
    {"type": "<finding type>", "severity": "<low|medium|high>", "description": "<what was found>", "recommendation": "<what to do>"}
  ],
  "summary": "<one sentence summary>",
  "sensitiveDataTypes": ["<list of sensitive data types detected>"]
}`;

    const aiResponse = await callGroq(prompt);

    let scanResult = {
      riskScore: 0,
      riskLevel: 'low',
      findings: [],
      summary: 'File appears safe',
      sensitiveDataTypes: []
    };

    try {
      const cleaned = aiResponse.replace(/```json|```/g, '').trim();
      const parsed  = JSON.parse(cleaned);
      scanResult = { ...scanResult, ...parsed };
    } catch(e) {
      // Fallback: pattern-based scanning on filename
      const name = (file.originalName || '').toLowerCase();
      const findings = [];

      const patterns = [
        { pattern: /password|passwd|pwd/,    type: 'Credential Risk',    severity: 'high',   desc: 'Filename suggests password data' },
        { pattern: /aadhaar|aadhar/,         type: 'PII - Aadhaar',     severity: 'critical', desc: 'Possible Aadhaar card data' },
        { pattern: /pan_card|pancard/,       type: 'PII - PAN Card',    severity: 'critical', desc: 'Possible PAN card data' },
        { pattern: /credit|debit|card/,      type: 'Financial Data',    severity: 'high',   desc: 'Possible card number data' },
        { pattern: /ssn|social.security/,    type: 'PII - SSN',         severity: 'critical', desc: 'Possible SSN data' },
        { pattern: /private.key|\.pem|\.p12/,type: 'Cryptographic Key', severity: 'critical', desc: 'Cryptographic key file detected' },
        { pattern: /backup|dump|export/,     type: 'Data Backup',       severity: 'medium',  desc: 'Database or system backup file' },
        { pattern: /secret|confidential/,    type: 'Confidential Data', severity: 'high',   desc: 'Marked as confidential' },
        { pattern: /salary|payroll|hr/,      type: 'HR/Payroll Data',   severity: 'high',   desc: 'Possible HR or payroll data' },
        { pattern: /medical|health|patient/, type: 'Medical Data',      severity: 'critical', desc: 'Possible medical/health data' },
      ];

      patterns.forEach(({ pattern, type, severity, desc }) => {
        if (pattern.test(name)) {
          findings.push({ type, severity, description: desc, recommendation: 'Ensure this file is properly encrypted and access-controlled' });
        }
      });

      const sevScore = { low: 10, medium: 30, high: 60, critical: 90 };
      const maxSev = findings.reduce((max, f) => Math.max(max, sevScore[f.severity] || 0), 0);

      scanResult = {
        riskScore: maxSev || (file.sizeBytes > 10485760 ? 15 : 5),
        riskLevel: maxSev >= 90 ? 'critical' : maxSev >= 60 ? 'high' : maxSev >= 30 ? 'medium' : 'low',
        findings,
        summary: findings.length > 0
          ? `Found ${findings.length} potential risk(s) based on filename analysis`
          : 'No obvious sensitive data patterns detected in filename',
        sensitiveDataTypes: findings.map(f => f.type)
      };
    }

    // Store scan result
    const scanId = uuidv4();
    await q(`INSERT INTO file_scan_results (scanId,fileId,userId,riskLevel,riskScore,findings,scannedAt)
      VALUES (?,?,?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE riskLevel=VALUES(riskLevel),riskScore=VALUES(riskScore),findings=VALUES(findings),scannedAt=NOW()`,
      [scanId, fileId, userId, scanResult.riskLevel, scanResult.riskScore, JSON.stringify(scanResult.findings)]);

    // Log to audit
    await q('INSERT INTO audit_log (logId,userId,event,fileId,fileName,ip) VALUES (?,?,?,?,?,?)',
      [uuidv4(), userId, 'FILE_SCANNED', fileId, file.originalName, req.ip]);

    res.json({
      scanId,
      fileId,
      fileName: file.originalName,
      riskLevel: scanResult.riskLevel,
      riskScore: scanResult.riskScore,
      findings: scanResult.findings || [],
      summary: scanResult.summary,
      sensitiveDataTypes: scanResult.sensitiveDataTypes || [],
      scannedAt: new Date().toISOString(),
      aiPowered: !!process.env.GROQ_API_KEY
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get scan history for a file ───────────────────────
router.get('/scan/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const scans = await q('SELECT * FROM file_scan_results WHERE fileId=? AND userId=? ORDER BY scannedAt DESC', [fileId, userId]);
    res.json({ scans: scans.map(s => ({ ...s, findings: JSON.parse(s.findings || '[]') })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get all scan results for user ─────────────────────
router.get('/scans', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const scans = await q(`SELECT s.*, f.originalName AS fileName
      FROM file_scan_results s
      LEFT JOIN files f ON f.fileId = s.fileId
      WHERE s.userId=? ORDER BY s.scannedAt DESC LIMIT 50`, [userId]);
    res.json({
      scans: scans.map(s => ({ ...s, findings: JSON.parse(s.findings || '[]') })),
      summary: {
        total: scans.length,
        critical: scans.filter(s => s.riskLevel === 'critical').length,
        high:     scans.filter(s => s.riskLevel === 'high').length,
        medium:   scans.filter(s => s.riskLevel === 'medium').length,
        low:      scans.filter(s => s.riskLevel === 'low').length,
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Scan all files for user ───────────────────────────
router.post('/scan-all', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const files  = await q('SELECT * FROM files WHERE userId=? AND status="active"', [userId]);

    const results = [];
    for (const file of files.slice(0, 10)) { // limit to 10 at once
      const name = (file.originalName || '').toLowerCase();
      const findings = [];
      const patterns = [
        { pattern: /password|passwd|pwd/,    type: 'Credential Risk',    severity: 'high'   },
        { pattern: /aadhaar|aadhar/,         type: 'PII - Aadhaar',     severity: 'critical'},
        { pattern: /pan_card|pancard/,       type: 'PII - PAN',         severity: 'critical'},
        { pattern: /credit|debit|card/,      type: 'Financial Data',    severity: 'high'   },
        { pattern: /private.key|\.pem/,      type: 'Crypto Key',        severity: 'critical'},
        { pattern: /secret|confidential/,    type: 'Confidential',      severity: 'high'   },
        { pattern: /medical|patient/,        type: 'Medical Data',      severity: 'critical'},
      ];
      patterns.forEach(({ pattern, type, severity }) => {
        if (pattern.test(name)) findings.push({ type, severity });
      });

      const maxSev = findings.reduce((m, f) => Math.max(m, {low:10,medium:30,high:60,critical:90}[f.severity]||0), 0);
      const riskLevel = maxSev >= 90 ? 'critical' : maxSev >= 60 ? 'high' : maxSev >= 30 ? 'medium' : 'low';
      const riskScore = maxSev || 5;

      const scanId = uuidv4();
      await q(`INSERT INTO file_scan_results (scanId,fileId,userId,riskLevel,riskScore,findings,scannedAt)
        VALUES (?,?,?,?,?,?,NOW())`,
        [scanId, file.fileId, userId, riskLevel, riskScore, JSON.stringify(findings)]);

      results.push({ fileId: file.fileId, fileName: file.originalName, riskLevel, riskScore, findings });
    }

    res.json({
      scanned: results.length,
      results,
      critical: results.filter(r => r.riskLevel === 'critical').length,
      high: results.filter(r => r.riskLevel === 'high').length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;