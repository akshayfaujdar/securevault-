'use strict';
const nodemailer = require('nodemailer');
const logger     = require('../utils/logger');

// Create transporter once
let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || '',
      },
    });
  }
  return transporter;
}

const APP_NAME = 'SecureVault';
const FROM     = `"${APP_NAME}" <${process.env.EMAIL_USER}>`;

// ── WELCOME EMAIL ────────────────────────────────────
async function sendWelcomeEmail(to, name) {
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#f8faff;padding:32px">
    <div style="background:linear-gradient(135deg,#4f46e5,#06b6d4);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px">
      <div style="font-size:48px;margin-bottom:8px">🔐</div>
      <h1 style="color:white;margin:0;font-size:24px">Welcome to SecureVault</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px">Your files are now protected with triple encryption</p>
    </div>
    <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
      <h2 style="color:#1e1b4b;margin:0 0 12px">Hi ${name}! 👋</h2>
      <p style="color:#6b7280;line-height:1.7;margin:0 0 20px">Your SecureVault account is ready. Here's what you can do:</p>
      <div style="display:grid;gap:12px">
        <div style="padding:14px;background:#f0f4ff;border-radius:10px;border-left:4px solid #4f46e5">
          <strong style="color:#4f46e5">🔒 Triple Encryption</strong>
          <p style="margin:4px 0 0;color:#6b7280;font-size:13px">AES-256 + Triple-DES + Blowfish on every file</p>
        </div>
        <div style="padding:14px;background:#f0fdf4;border-radius:10px;border-left:4px solid #10b981">
          <strong style="color:#10b981">🖼 LSB Steganography</strong>
          <p style="margin:4px 0 0;color:#6b7280;font-size:13px">Secret key hidden inside your stego image</p>
        </div>
        <div style="padding:14px;background:#fff7ed;border-radius:10px;border-left:4px solid #f59e0b">
          <strong style="color:#f59e0b">📤 Secure Sharing</strong>
          <p style="margin:4px 0 0;color:#6b7280;font-size:13px">Share files — only the correct stego image unlocks them</p>
        </div>
      </div>
      <div style="margin-top:24px;padding:16px;background:#fef3c7;border-radius:10px;border:1px solid #fde68a">
        <p style="margin:0;font-size:13px;color:#92400e">⚠️ <strong>Important:</strong> Always keep your stego image safe. It's the key to decrypt your files. If you lose it, files cannot be recovered.</p>
      </div>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:20px">© 2025 SecureVault · Hybrid Cryptography File Storage</p>
  </div>`;

  return getTransporter().sendMail({
    from: FROM, to,
    subject: `🔐 Welcome to SecureVault, ${name}!`,
    html,
  });
}

// ── OTP EMAIL ─────────────────────────────────────────
async function sendOTPEmail(to, name, otp) {
  const digits = otp.split('').map(d =>
    `<span style="display:inline-block;width:44px;height:52px;line-height:52px;text-align:center;background:#f0f4ff;border:2px solid #c7d2fe;border-radius:10px;font-size:24px;font-weight:800;color:#4f46e5;margin:0 4px">${d}</span>`
  ).join('');

  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#f8faff;padding:32px">
    <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);border-radius:16px;padding:28px;text-align:center;margin-bottom:24px">
      <div style="font-size:44px;margin-bottom:8px">🔐</div>
      <h1 style="color:white;margin:0;font-size:22px">Verify Your Login</h1>
    </div>
    <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e5e7eb;text-align:center">
      <p style="color:#6b7280;margin:0 0 24px">Hi <strong>${name}</strong>, enter this code to complete your login:</p>
      <div style="margin:0 auto 24px">${digits}</div>
      <p style="color:#9ca3af;font-size:13px;margin:0">This code expires in <strong>10 minutes</strong></p>
      <div style="margin-top:20px;padding:14px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca">
        <p style="margin:0;font-size:12px;color:#dc2626">🚨 If you didn't try to login, your password may be compromised. Change it immediately.</p>
      </div>
    </div>
  </div>`;

  return getTransporter().sendMail({
    from: FROM, to,
    subject: `${otp} — Your SecureVault Login Code`,
    html,
  });
}

// ── LOGIN ALERT EMAIL ─────────────────────────────────
async function sendLoginAlertEmail(to, name, ip) {
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#f8faff;padding:32px">
    <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
      <h2 style="color:#1e1b4b;margin:0 0 16px">🔐 New Login Detected</h2>
      <p style="color:#6b7280;line-height:1.6">Hi <strong>${name}</strong>, a new login was detected on your SecureVault account.</p>
      <div style="margin:20px 0;padding:16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <span style="color:#6b7280;font-size:13px">Time</span>
          <span style="color:#1e1b4b;font-size:13px;font-weight:600">${new Date().toLocaleString()}</span>
        </div>
        <div style="display:flex;justify-content:space-between">
          <span style="color:#6b7280;font-size:13px">IP Address</span>
          <span style="color:#1e1b4b;font-size:13px;font-weight:600;font-family:monospace">${ip||'Unknown'}</span>
        </div>
      </div>
      <p style="color:#9ca3af;font-size:13px">If this was you, no action needed. If not, change your password immediately.</p>
    </div>
  </div>`;

  return getTransporter().sendMail({
    from: FROM, to,
    subject: `🔐 New Login to Your SecureVault Account`,
    html,
  });
}

// ── FILE SHARE EMAIL ──────────────────────────────────
async function sendFileShareEmail(to, recipientName, senderName, fileName) {
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#f8faff;padding:32px">
    <div style="background:linear-gradient(135deg,#10b981,#06b6d4);border-radius:16px;padding:28px;text-align:center;margin-bottom:24px">
      <div style="font-size:44px;margin-bottom:8px">📤</div>
      <h1 style="color:white;margin:0;font-size:22px">File Shared With You</h1>
    </div>
    <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
      <p style="color:#6b7280;line-height:1.7">Hi <strong>${recipientName}</strong>,</p>
      <p style="color:#6b7280;line-height:1.7"><strong style="color:#1e1b4b">${senderName}</strong> has shared an encrypted file with you on SecureVault:</p>
      <div style="margin:20px 0;padding:16px;background:#f0f4ff;border-radius:10px;border:1px solid #c7d2fe;text-align:center">
        <div style="font-size:32px;margin-bottom:8px">🔐</div>
        <div style="font-size:15px;font-weight:700;color:#4f46e5">${fileName}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">Triple encrypted · Stego protected</div>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.6">Login to SecureVault, go to <strong>Received Files</strong>, and accept the share. You will then need the <strong>stego image</strong> from the sender to decrypt the file.</p>
      <div style="margin-top:16px;padding:14px;background:#fef3c7;border-radius:10px;border:1px solid #fde68a">
        <p style="margin:0;font-size:12px;color:#92400e">⚠️ Ask <strong>${senderName}</strong> to send you the stego image separately — it's required to decrypt the file.</p>
      </div>
    </div>
  </div>`;

  return getTransporter().sendMail({
    from: FROM, to,
    subject: `📤 ${senderName} shared "${fileName}" with you on SecureVault`,
    html,
  });
}

// ── SHARE STATUS EMAIL ────────────────────────────────
async function sendShareStatusEmail(to, senderName, recipientName, fileName, status) {
  const accepted = status === 'accepted';
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#f8faff;padding:32px">
    <div style="background:${accepted ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)'};border-radius:16px;padding:28px;text-align:center;margin-bottom:24px">
      <div style="font-size:44px;margin-bottom:8px">${accepted ? '✅' : '❌'}</div>
      <h1 style="color:white;margin:0;font-size:22px">Share ${accepted ? 'Accepted' : 'Rejected'}</h1>
    </div>
    <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
      <p style="color:#6b7280;line-height:1.7">Hi <strong>${senderName}</strong>,</p>
      <p style="color:#6b7280;line-height:1.7"><strong>${recipientName}</strong> has <strong style="color:${accepted ? '#10b981' : '#ef4444'}">${status}</strong> your shared file <strong style="color:#4f46e5">"${fileName}"</strong>.</p>
      ${accepted ? `<p style="color:#6b7280;font-size:13px">They can now decrypt the file using the stego image.</p>` : `<p style="color:#6b7280;font-size:13px">The file share has been closed. You can share it again if needed.</p>`}
    </div>
  </div>`;

  return getTransporter().sendMail({
    from: FROM, to,
    subject: `${accepted ? '✅' : '❌'} ${recipientName} ${status} your file share`,
    html,
  });
}

// ── PASSWORD RESET EMAIL ──────────────────────────────
async function sendPasswordResetEmail(to, name, token) {
  const resetUrl = `${process.env.FRONTEND_URL}/auth.html?reset=${token}`;
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#f8faff;padding:32px">
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:16px;padding:28px;text-align:center;margin-bottom:24px">
      <div style="font-size:44px;margin-bottom:8px">🔑</div>
      <h1 style="color:white;margin:0;font-size:22px">Reset Your Password</h1>
    </div>
    <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
      <p style="color:#6b7280;line-height:1.7">Hi <strong>${name}</strong>, we received a request to reset your password.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;text-decoration:none;border-radius:50px;font-weight:700;font-size:15px">Reset Password →</a>
      </div>
      <p style="color:#9ca3af;font-size:13px;text-align:center">This link expires in <strong>1 hour</strong></p>
      <div style="margin-top:16px;padding:14px;background:#fef2f2;border-radius:10px;border:1px solid #fecaca">
        <p style="margin:0;font-size:12px;color:#dc2626">⚠️ <strong>Zero-knowledge warning:</strong> Resetting your password will NOT recover previously encrypted files. You need the original password or stego image to decrypt them.</p>
      </div>
    </div>
  </div>`;

  return getTransporter().sendMail({
    from: FROM, to,
    subject: `🔑 Reset your SecureVault password`,
    html,
  });
}

// ── STORAGE ALERT EMAIL ───────────────────────────────
async function sendStorageAlertEmail(to, name, usedPct) {
  const html = `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#f8faff;padding:32px">
    <div style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:16px;padding:28px;text-align:center;margin-bottom:24px">
      <div style="font-size:44px;margin-bottom:8px">⚠️</div>
      <h1 style="color:white;margin:0;font-size:22px">Storage Almost Full</h1>
    </div>
    <div style="background:white;border-radius:12px;padding:28px;border:1px solid #e5e7eb">
      <p style="color:#6b7280;line-height:1.7">Hi <strong>${name}</strong>, your SecureVault storage is <strong style="color:#f59e0b">${usedPct}% full</strong>.</p>
      <div style="margin:16px 0;background:#f3f4f6;border-radius:8px;height:12px;overflow:hidden">
        <div style="height:100%;width:${usedPct}%;background:${usedPct>=90?'#ef4444':usedPct>=80?'#f59e0b':'#10b981'};border-radius:8px"></div>
      </div>
      <p style="color:#6b7280;font-size:13px">Delete files you no longer need to free up space, or contact your administrator to upgrade your storage limit.</p>
    </div>
  </div>`;

  return getTransporter().sendMail({
    from: FROM, to,
    subject: `⚠️ Your SecureVault storage is ${usedPct}% full`,
    html,
  });
}

module.exports = {
  sendWelcomeEmail,
  sendOTPEmail,
  sendLoginAlertEmail,
  sendFileShareEmail,
  sendShareStatusEmail,
  sendPasswordResetEmail,
  sendStorageAlertEmail,
};