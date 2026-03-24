'use strict';
const jwt    = require('jsonwebtoken');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/** Sign a JWT access token */
function signAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn  : process.env.JWT_EXPIRES_IN || '7d',
    issuer     : 'ciphercloud',
    audience   : 'ciphercloud-api',
  });
}

/** Sign a refresh token */
function signRefreshToken(payload) {
  return jwt.sign(payload, JWT_SECRET + '-refresh', {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
}

/** Verify access token */
function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET, { issuer: 'ciphercloud', audience: 'ciphercloud-api' });
}

/** Express middleware — require valid JWT */
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required', code: 'AUTH_MISSING' });
  }

  const token = header.slice(7);
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn('JWT verification failed', { error: err.message });
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Invalid token', code: 'TOKEN_INVALID' });
  }
}

/** Optional auth — attach user if token present, don't fail if absent */
function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = verifyAccessToken(header.slice(7));
    } catch { /* ignore */ }
  }
  next();
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, requireAuth, optionalAuth };
