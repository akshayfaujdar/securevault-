'use strict';
// ═══════════════════════════════════════════════════════
// FEATURE 30 — TEAM / ORGANIZATION
// File: C:\Projects\securevault\backend\src\routes\organizations.js
// ═══════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../services/localDB');

async function q(sql, p=[])  { const [r] = await pool.query(sql,p); return r; }
async function q1(sql, p=[]) { return (await q(sql,p))[0]||null; }

// ── Create organization ───────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const { name, plan } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Organization name required' });

    // Check if user already owns/is in an org
    const existingMember = await q1('SELECT * FROM org_members WHERE userId=?', [ownerId]);
    if (existingMember) return res.status(400).json({ error: 'You are already in an organization' });

    const orgId = uuidv4();
    await q(`INSERT INTO organizations (orgId,name,ownerId,plan,maxMembers,storageLimit) VALUES (?,?,?,?,?,?)`,
      [orgId, name.trim(), ownerId, plan||'team', 10, 53687091200]);

    // Add owner as first member
    await q(`INSERT INTO org_members (memberId,orgId,userId,role,invitedBy) VALUES (?,?,?,?,?)`,
      [uuidv4(), orgId, ownerId, 'owner', ownerId]);

    // Update user's orgId
    try { await q('UPDATE users SET orgId=? WHERE userId=?', [orgId, ownerId]); } catch(e) {}

    res.json({
      success: true,
      orgId,
      name: name.trim(),
      message: `Organization "${name}" created! You are the owner.`,
      plan: plan || 'team',
      maxMembers: 10
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get my organization ───────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const membership = await q1('SELECT * FROM org_members WHERE userId=?', [userId]);
    if (!membership) return res.json({ hasOrg: false, message: 'You are not in any organization' });

    const org = await q1('SELECT * FROM organizations WHERE orgId=?', [membership.orgId]);
    if (!org) return res.json({ hasOrg: false });

    const members = await q(`SELECT om.memberId, om.role, om.joinedAt,
      u.name, u.email, u.storageUsed
      FROM org_members om
      LEFT JOIN users u ON u.userId = om.userId
      WHERE om.orgId=? ORDER BY om.joinedAt ASC`, [org.orgId]);

    const files = await q(`SELECT COUNT(*) AS c, COALESCE(SUM(sizeBytes),0) AS totalSize
      FROM files WHERE orgId=? AND status='active'`, [org.orgId]);

    res.json({
      hasOrg: true,
      org: {
        ...org,
        memberCount:  members.length,
        storageUsed:  files[0]?.totalSize || 0,
        storageLimit: org.storageLimit,
        fileCount:    files[0]?.c || 0
      },
      members,
      myRole: membership.role
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Invite member ──────────────────────────────────────
router.post('/invite', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { email, role } = req.body;

    if (!email) return res.status(400).json({ error: 'Email required' });

    const membership = await q1('SELECT * FROM org_members WHERE userId=? AND role IN ("owner","admin")', [userId]);
    if (!membership) return res.status(403).json({ error: 'Only org owners/admins can invite members' });

    const org = await q1('SELECT * FROM organizations WHERE orgId=?', [membership.orgId]);

    // Check member limit
    const [memberCount] = await q('SELECT COUNT(*) AS c FROM org_members WHERE orgId=?', [membership.orgId]);
    if (memberCount.c >= org.maxMembers) {
      return res.status(400).json({ error: `Organization is full (max ${org.maxMembers} members)` });
    }

    // Check if user already in org
    const targetUser = await q1('SELECT * FROM users WHERE email=?', [email]);
    if (targetUser) {
      const alreadyMember = await q1('SELECT * FROM org_members WHERE userId=? AND orgId=?', [targetUser.userId, membership.orgId]);
      if (alreadyMember) return res.status(400).json({ error: 'User is already a member' });
    }

    // Create invite token
    const token    = crypto.randomBytes(32).toString('hex');
    const inviteId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000);

    await q(`INSERT INTO org_invites (inviteId,orgId,email,role,token,invitedBy,expiresAt) VALUES (?,?,?,?,?,?,?)`,
      [inviteId, membership.orgId, email, role||'member', token, userId,
       expiresAt.toISOString().slice(0,19).replace('T',' ')]);

    // Send invite email if nodemailer configured
    let emailSent = false;
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
      });

      const inviteUrl = `${process.env.FRONTEND_URL || 'http://127.0.0.1:5500/frontend'}/index.html?join=${token}`;

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: `You're invited to join ${org.name} on SecureVault`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
            <div style="background:linear-gradient(135deg,#4f46e5,#06b6d4);padding:20px;border-radius:12px;color:white;margin-bottom:20px">
              <h2 style="margin:0">🔐 SecureVault Team Invite</h2>
            </div>
            <p>You've been invited to join <strong>${org.name}</strong> as a <strong>${role||'member'}</strong>.</p>
            <a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:white;border-radius:8px;text-decoration:none;font-weight:600">Accept Invitation</a>
            <p style="color:#6b7280;font-size:12px;margin-top:16px">Expires in 7 days. If you didn't expect this, ignore this email.</p>
          </div>`
      });
      emailSent = true;
    } catch(e) {}

    res.json({
      success: true,
      inviteId,
      token,
      email,
      role: role || 'member',
      expiresAt,
      emailSent,
      inviteUrl: `${process.env.FRONTEND_URL || 'http://127.0.0.1:5500/frontend'}/index.html?join=${token}`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Accept invite ──────────────────────────────────────
router.post('/join/:token', requireAuth, async (req, res) => {
  try {
    const { token } = req.params;
    const userId    = req.user.userId;
    const user      = await q1('SELECT * FROM users WHERE userId=?', [userId]);

    const invite = await q1('SELECT * FROM org_invites WHERE token=? AND accepted=FALSE AND expiresAt > NOW()', [token]);
    if (!invite) return res.status(400).json({ error: 'Invalid or expired invitation' });

    // Check email matches
    if (invite.email !== user.email) {
      return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    }

    // Already a member?
    const existing = await q1('SELECT * FROM org_members WHERE userId=? AND orgId=?', [userId, invite.orgId]);
    if (existing) return res.status(400).json({ error: 'You are already a member of this organization' });

    const org = await q1('SELECT * FROM organizations WHERE orgId=?', [invite.orgId]);

    // Add member
    await q(`INSERT INTO org_members (memberId,orgId,userId,role,invitedBy) VALUES (?,?,?,?,?)`,
      [uuidv4(), invite.orgId, userId, invite.role, invite.invitedBy]);

    // Mark invite as accepted
    await q('UPDATE org_invites SET accepted=TRUE WHERE inviteId=?', [invite.inviteId]);

    // Update user's orgId
    try { await q('UPDATE users SET orgId=? WHERE userId=?', [invite.orgId, userId]); } catch(e) {}

    res.json({
      success: true,
      orgId:   invite.orgId,
      orgName: org?.name,
      role:    invite.role,
      message: `Welcome to ${org?.name}! You joined as ${invite.role}.`
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get org members ───────────────────────────────────
router.get('/members', requireAuth, async (req, res) => {
  try {
    const userId     = req.user.userId;
    const membership = await q1('SELECT * FROM org_members WHERE userId=?', [userId]);
    if (!membership) return res.status(403).json({ error: 'Not in any organization' });

    const members = await q(`SELECT om.memberId, om.role, om.joinedAt,
      u.userId, u.name, u.email, u.storageUsed, u.totpEnabled
      FROM org_members om
      LEFT JOIN users u ON u.userId = om.userId
      WHERE om.orgId=? ORDER BY om.role ASC, om.joinedAt ASC`, [membership.orgId]);

    res.json({ members, orgId: membership.orgId, myRole: membership.role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Remove member ──────────────────────────────────────
router.delete('/members/:targetUserId', requireAuth, async (req, res) => {
  try {
    const userId       = req.user.userId;
    const { targetUserId } = req.params;

    const membership = await q1('SELECT * FROM org_members WHERE userId=? AND role IN ("owner","admin")', [userId]);
    if (!membership) return res.status(403).json({ error: 'Only owners/admins can remove members' });

    const target = await q1('SELECT * FROM org_members WHERE userId=? AND orgId=?', [targetUserId, membership.orgId]);
    if (!target) return res.status(404).json({ error: 'Member not found' });
    if (target.role === 'owner') return res.status(400).json({ error: 'Cannot remove organization owner' });

    await q('DELETE FROM org_members WHERE userId=? AND orgId=?', [targetUserId, membership.orgId]);
    try { await q('UPDATE users SET orgId=NULL WHERE userId=?', [targetUserId]); } catch(e) {}

    res.json({ success: true, message: 'Member removed from organization' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get org files ─────────────────────────────────────
router.get('/files', requireAuth, async (req, res) => {
  try {
    const userId     = req.user.userId;
    const membership = await q1('SELECT * FROM org_members WHERE userId=?', [userId]);
    if (!membership) return res.status(403).json({ error: 'Not in any organization' });

    const files = await q(`SELECT f.*, u.name AS ownerName, u.email AS ownerEmail
      FROM files f
      LEFT JOIN users u ON u.userId = f.userId
      WHERE f.orgId=? AND f.status='active'
      ORDER BY f.createdAt DESC`, [membership.orgId]);

    res.json({ files, count: files.length, orgId: membership.orgId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Share file with org ───────────────────────────────
router.post('/share-file/:fileId', requireAuth, async (req, res) => {
  try {
    const userId   = req.user.userId;
    const { fileId } = req.params;

    const membership = await q1('SELECT * FROM org_members WHERE userId=?', [userId]);
    if (!membership) return res.status(403).json({ error: 'Not in any organization' });

    const file = await q1('SELECT * FROM files WHERE fileId=? AND userId=? AND status="active"', [fileId, userId]);
    if (!file) return res.status(404).json({ error: 'File not found' });

    await q('UPDATE files SET orgId=? WHERE fileId=?', [membership.orgId, fileId]);

    res.json({ success: true, message: 'File shared with organization', orgId: membership.orgId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Leave organization ────────────────────────────────
router.post('/leave', requireAuth, async (req, res) => {
  try {
    const userId     = req.user.userId;
    const membership = await q1('SELECT * FROM org_members WHERE userId=?', [userId]);
    if (!membership) return res.status(400).json({ error: 'You are not in any organization' });
    if (membership.role === 'owner') return res.status(400).json({ error: 'Transfer ownership before leaving' });

    await q('DELETE FROM org_members WHERE userId=?', [userId]);
    try { await q('UPDATE users SET orgId=NULL WHERE userId=?', [userId]); } catch(e) {}

    res.json({ success: true, message: 'You have left the organization' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;