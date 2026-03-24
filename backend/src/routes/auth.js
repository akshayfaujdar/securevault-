'use strict';
const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const router   = express.Router();
const { hashPassword, verifyPassword, generateSecureToken } = require('../crypto/cryptoEngine');
const { signAccessToken, signRefreshToken, requireAuth }    = require('../middleware/auth');
const { sendWelcomeEmail, sendOTPEmail, sendLoginAlertEmail } = require('../services/emailService');
const logger   = require('../utils/logger');
const speakeasy = require('speakeasy');

let db;
function getDB() { if (!db) db = require('../services/localDB'); return db; }

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

// ── REGISTER ────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ error: 'Email, password and name required' });
    if (password.length < 12)
      return res.status(400).json({ error: 'Password must be at least 12 characters' });

    const { userDB, auditDB, sessionDB } = getDB();
    const existing = await userDB.getByEmail(email.toLowerCase().trim()).catch(() => null);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await hashPassword(password);
    const userId = uuidv4();
    await userDB.create({
      userId, email: email.toLowerCase().trim(), name: name.trim(),
      passwordHash, plan: 'free', storageMax: 5*1024*1024*1024,
      verifyToken: generateSecureToken(), role: 'user',
    });

    const accessToken  = signAccessToken({ userId, email, name, role: 'user' });
    const refreshToken = signRefreshToken({ userId });
    await sessionDB.create(userId, accessToken, { ip: req.ip });
    await auditDB.log({ userId, event: 'USER_REGISTERED', ip: req.ip });

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, name).catch(e => logger.warn('Welcome email failed', { error: e.message }));

    res.status(201).json({
      message: 'Account created successfully', accessToken, refreshToken,
      user: { userId, email, name, plan: 'free', role: 'user' },
    });
  } catch (err) { next(err); }
});

// ── LOGIN (Step 1 — send OTP if 2FA enabled) ────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const { userDB, auditDB, sessionDB } = getDB();
    const user = await userDB.getByEmail(email.toLowerCase().trim()).catch(() => null);

    let valid = false;
    if (user) {
      const hash = user.passwordHash || '';
      if (hash && hash !== 'placeholder' && hash.startsWith('pbkdf2$')) {
        valid = await verifyPassword(password, hash).catch(() => false);
      }
    }

    if (!valid) {
      await auditDB.log({ userId: user?.userId||'unknown', event: 'LOGIN_FAILED', ip: req.ip }).catch(()=>{});
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // If 2FA enabled → send OTP and require verification
    if (user.totpEnabled) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore.set(user.userId, { otp, expires: Date.now() + 10 * 60 * 1000 });
      await sendOTPEmail(user.email, user.name, otp).catch(e => logger.warn('OTP email failed', { error: e.message }));
      return res.json({ requireOTP: true, userId: user.userId, message: 'OTP sent to your email' });
    }

    return issueTokens(user, req, res, auditDB, sessionDB);
  } catch (err) { next(err); }
});

// ── LOGIN Step 2 — Verify OTP ───────────────────────
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { userId, otp } = req.body;
    if (!userId || !otp) return res.status(400).json({ error: 'userId and otp required' });

    const stored = otpStore.get(userId);
    if (!stored) return res.status(400).json({ error: 'OTP expired or not requested' });
    if (Date.now() > stored.expires) { otpStore.delete(userId); return res.status(400).json({ error: 'OTP expired' }); }
    if (stored.otp !== otp.trim()) return res.status(400).json({ error: 'Invalid OTP' });

    otpStore.delete(userId);
    const { userDB, auditDB, sessionDB } = getDB();
    const user = await userDB.getById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    return issueTokens(user, req, res, auditDB, sessionDB);
  } catch (err) { next(err); }
});

// ── FORGOT PASSWORD ─────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const { userDB, auditDB } = getDB();
    const user = await userDB.getByEmail(email.toLowerCase().trim()).catch(() => null);

    if (user) {
      const token  = generateSecureToken();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await userDB.update(user.userId, {
        resetToken: token,
        resetExpiry: expiry.toISOString().slice(0,19).replace('T',' '),
      });
      const { sendPasswordResetEmail } = require('../services/emailService');
      await sendPasswordResetEmail(user.email, user.name, token).catch(e => logger.warn('Reset email failed', { error: e.message }));
      await auditDB.log({ userId: user.userId, event: 'PASSWORD_RESET_REQUESTED', ip: req.ip });
    }

    // Always return success to prevent email enumeration
    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) { next(err); }
});

// ── RESET PASSWORD ──────────────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and newPassword required' });
    if (newPassword.length < 12) return res.status(400).json({ error: 'Password must be at least 12 characters' });

    const { userDB, auditDB } = getDB();
    const user = await userDB.getByResetToken(token);
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });
    if (new Date(user.resetExpiry) < new Date()) return res.status(400).json({ error: 'Reset token expired' });

    const passwordHash = await hashPassword(newPassword);
    await userDB.update(user.userId, { passwordHash, resetToken: null, resetExpiry: null });
    await auditDB.log({ userId: user.userId, event: 'PASSWORD_RESET_SUCCESS', ip: req.ip });

    res.json({ message: 'Password reset successfully. Please login with your new password.' });
  } catch (err) { next(err); }
});

// ── ENABLE 2FA ──────────────────────────────────────
router.post('/enable-2fa', requireAuth, async (req, res, next) => {
  try {
    const { userDB } = getDB();
    await userDB.update(req.user.userId, { totpEnabled: true });
    res.json({ message: '2FA enabled. You will receive OTP on login.' });
  } catch (err) { next(err); }
});

// ── DISABLE 2FA ─────────────────────────────────────
router.post('/disable-2fa', requireAuth, async (req, res, next) => {
  try {
    const { userDB } = getDB();
    await userDB.update(req.user.userId, { totpEnabled: false });
    res.json({ message: '2FA disabled.' });
  } catch (err) { next(err); }
});

// ── LOGOUT ──────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const { auditDB } = getDB();
    await auditDB.log({ userId: req.user.userId, event: 'LOGOUT', ip: req.ip }).catch(()=>{});
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
});

// ── ME ───────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { userDB } = getDB();
    const user = await userDB.getById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { passwordHash, totpSecret, verifyToken, resetToken, ...safe } = user;
    res.json({ user: safe });
  } catch (err) { next(err); }
});

// ── Helper ───────────────────────────────────────────
async function issueTokens(user, req, res, auditDB, sessionDB) {
  const role = user.role || 'user';
  const accessToken  = signAccessToken({ userId: user.userId, email: user.email, name: user.name, role });
  const refreshToken = signRefreshToken({ userId: user.userId });
  await sessionDB.create(user.userId, accessToken, { ip: req.ip });
  await auditDB.log({ userId: user.userId, event: 'LOGIN_SUCCESS', ip: req.ip }).catch(()=>{});

  // Send login alert email (non-blocking)
  sendLoginAlertEmail(user.email, user.name, req.ip).catch(()=>{});

  res.json({
    accessToken, refreshToken,
    user: {
      userId: user.userId, email: user.email, name: user.name,
      plan: user.plan||'free', role,
      storageUsed: user.storageUsed||0, storageMax: user.storageMax||5368709120,
      totpEnabled: !!user.totpEnabled,
    },
  });
}

module.exports = router;