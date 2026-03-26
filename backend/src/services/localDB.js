'use strict';
const mysql  = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST||'localhost', port: process.env.DB_PORT||3306,
  database: process.env.DB_NAME||'ciphercloud',
  user: process.env.DB_USER||'root', password: process.env.DB_PASSWORD||'Akshay7240@',
  waitForConnections: true, connectionLimit: 10,
});

pool.getConnection()
  .then(c => { logger.info('MySQL connected successfully'); c.release(); })
  .catch(e => logger.error('MySQL connection failed', { error: e.message }));

async function q(sql, params=[])  { const [rows] = await pool.query(sql, params); return rows; }
async function q1(sql, params=[]) { const rows = await q(sql, params); return rows[0]||null; }

// ══ USERS ═══════════════════════════════════════════
const userDB = {
  async create(user) {
    await q(
      `INSERT INTO users (userId,email,name,passwordHash,plan,storageUsed,storageMax,totpEnabled,totpSecret,verified,verifyToken,role)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [user.userId,user.email,user.name,user.passwordHash,user.plan||'free',0,user.storageMax||5368709120,false,null,false,user.verifyToken||null,user.role||'user']
    );
    return user;
  },
  async getById(id)    { return q1('SELECT * FROM users WHERE userId=?',[id]); },
  async getByEmail(em) { return q1('SELECT * FROM users WHERE email=?',[em]); },
  async getByResetToken(t) { return q1('SELECT * FROM users WHERE resetToken=?',[t]); },
  async update(userId, updates) {
    const conv = {};
    for (const [k,v] of Object.entries(updates)) {
      conv[k] = (typeof v==='string' && /^\d{4}-\d{2}-\d{2}T/.test(v))
        ? new Date(v).toISOString().slice(0,19).replace('T',' ')
        : v;
    }
    const fields = Object.keys(conv).map(k=>`${k}=?`).join(',');
    if (!fields) return;
    await q(`UPDATE users SET ${fields} WHERE userId=?`,[...Object.values(conv),userId]);
  },
  async getAll() {
    return q('SELECT userId,email,name,role,plan,storageUsed,storageMax,createdAt,totpEnabled FROM users ORDER BY createdAt DESC');
  },
};

// ══ FILES ════════════════════════════════════════════
const fileDB = {
  async create(file) {
    // Get current version count for this file name
    const existing = await q('SELECT MAX(version) as maxV FROM files WHERE userId=? AND originalName=?',[file.userId,file.originalName]);
    const version = (existing[0]?.maxV || 0) + 1;
    await q(
      `INSERT INTO files (fileId,userId,originalName,mimeType,sizeBytes,encryptedSize,filePath,block1Path,block2Path,block3Path,stegoImagePath,secretKey,algo,integrity,tags,status,version)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [file.fileId,file.userId,file.originalName,file.mimeType||'',file.sizeBytes||0,file.encryptedSize||0,file.filePath||'',file.block1Path||'',file.block2Path||'',file.block3Path||'',file.stegoImagePath||'',file.secretKey||'',file.algo||'hybrid',file.integrity||'',JSON.stringify(file.tags||[]),'active',version]
    );
    return { ...file, version, createdAt: new Date().toISOString() };
  },
  async getById(userId, fileId) {
    return q1('SELECT * FROM files WHERE fileId=? AND userId=? AND status="active"',[fileId,userId]);
  },
  async getByIdForShare(fileId, recipientId) {
    return q1(
      `SELECT f.* FROM files f INNER JOIN share_links s ON s.fileId=f.fileId
       WHERE f.fileId=? AND s.recipientId=? AND s.status='accepted' AND f.status='active'`,
      [fileId,recipientId]
    );
  },
  async listByUser(userId) {
    return q('SELECT * FROM files WHERE userId=? AND status="active" ORDER BY createdAt DESC',[userId]);
  },
  async getVersions(userId, fileId) {
    const file = await q1('SELECT originalName FROM files WHERE fileId=? AND userId=?',[fileId,userId]);
    if (!file) return [];
    return q('SELECT * FROM files WHERE userId=? AND originalName=? ORDER BY version DESC',[userId,file.originalName]);
  },
  async restoreVersion(userId, fileId, version) {
    const file = await q1('SELECT originalName FROM files WHERE fileId=? AND userId=?',[fileId,userId]);
    if (!file) return null;
    const target = await q1('SELECT * FROM files WHERE userId=? AND originalName=? AND version=?',[userId,file.originalName,version]);
    return target || null;
  },
  async delete(userId, fileId) {
    await q('UPDATE files SET status="deleted" WHERE fileId=? AND userId=?',[fileId,userId]);
  },
  async getAll() {
    return q(`SELECT f.*,u.name AS userName,u.email AS userEmail FROM files f LEFT JOIN users u ON u.userId=f.userId WHERE f.status='active' ORDER BY f.createdAt DESC`);
  },
};

// ══ ENCRYPTION KEYS ══════════════════════════════════
const keyDB = {
  async storeWrappedDEK(fileId, userId, wrappedDEK, kmsWrapped, meta={}) {
    await q(
      `INSERT INTO encryption_keys (fileId,userId,wrappedDEK,kekSalt,algo,integrity,keyVersion)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE wrappedDEK=VALUES(wrappedDEK),keyVersion=keyVersion+1`,
      [fileId,userId,JSON.stringify(wrappedDEK),meta.kekSalt||'',meta.algo||'hybrid',meta.integrity||'',1]
    );
  },
  async getWrappedDEK(fileId, userId) {
    const row = await q1('SELECT * FROM encryption_keys WHERE fileId=? AND userId=?',[fileId,userId]);
    if (!row) return null;
    try { row.wrappedDEK = JSON.parse(row.wrappedDEK); } catch {}
    return row;
  },
  async listByUser(userId) {
    return q(`SELECT ek.*,f.originalName AS fileName FROM encryption_keys ek LEFT JOIN files f ON f.fileId=ek.fileId WHERE ek.userId=? ORDER BY ek.createdAt DESC`,[userId]);
  },
};

// ══ AUDIT LOG ════════════════════════════════════════
const auditDB = {
  async log(event) {
    const logId = uuidv4();
    await q(
      `INSERT INTO audit_log (logId,userId,event,fileId,fileName,ip,details) VALUES (?,?,?,?,?,?,?)`,
      [logId,event.userId||'system',event.event||'',event.fileId||null,event.fileName||null,event.ip||null,JSON.stringify(event)]
    ).catch(e => logger.error('Audit error',{error:e.message}));
  },
  async getByUser(userId, limit=50) {
    return q('SELECT * FROM audit_log WHERE userId=? ORDER BY createdAt DESC LIMIT '+parseInt(limit),[userId]);
  },
  async getAll(limit=50) {
    return q('SELECT * FROM audit_log ORDER BY createdAt DESC LIMIT '+parseInt(limit));
  },
};

// ══ SESSIONS ═════════════════════════════════════════
const sessionDB = {
  async create(userId, token, meta={}) {
    const sessionId = uuidv4();
    const exp = new Date(Date.now()+7*24*3600*1000).toISOString().slice(0,19).replace('T',' ');
    await q('INSERT INTO sessions (sessionId,userId,token,ip,expiresAt) VALUES (?,?,?,?,?)',[sessionId,userId,token,meta.ip||null,exp]);
    return sessionId;
  },
  async invalidate(sessionId) { await q('DELETE FROM sessions WHERE sessionId=?',[sessionId]); },
};

// ══ SHARES ═══════════════════════════════════════════
const shareDB = {
  async create(share) {
    await q(
      `INSERT INTO share_links (shareId,fileId,senderId,recipientId,status,stegoImagePath) VALUES (?,?,?,?,?,?)`,
      [share.shareId,share.fileId,share.senderId,share.recipientId,share.status||'pending',share.stegoImagePath||'']
    );
    return share;
  },
  async getById(shareId) { return q1('SELECT * FROM share_links WHERE shareId=?',[shareId]); },
  async getReceivedByUser(userId) {
    return q(
      `SELECT s.shareId,s.fileId,s.senderId,s.recipientId,s.status,s.stegoImagePath,s.createdAt,
              f.originalName,f.sizeBytes,f.algo,f.mimeType,f.block1Path,f.block2Path,f.block3Path,
              u.name AS senderName,u.email AS senderEmail
       FROM share_links s
       LEFT JOIN files f ON f.fileId=s.fileId
       LEFT JOIN users u ON u.userId=s.senderId
       WHERE s.recipientId=? ORDER BY s.createdAt DESC`,[userId]
    );
  },
  async getSentByUser(userId) {
    return q(
      `SELECT s.shareId,s.fileId,s.senderId,s.recipientId,s.status,s.createdAt,
              f.originalName,f.sizeBytes,f.algo,
              u.name AS recipientName,u.email AS recipientEmail
       FROM share_links s
       LEFT JOIN files f ON f.fileId=s.fileId
       LEFT JOIN users u ON u.userId=s.recipientId
       WHERE s.senderId=? ORDER BY s.createdAt DESC`,[userId]
    );
  },
  async updateStatus(shareId, status) {
    await q('UPDATE share_links SET status=?,updatedAt=NOW() WHERE shareId=?',[status,shareId]);
  },
  async getAll() {
    return q(
      `SELECT s.shareId,s.fileId,s.senderId,s.recipientId,s.status,s.createdAt,
              f.originalName,
              sender.name AS senderName, recip.name AS recipientName
       FROM share_links s
       LEFT JOIN files f      ON f.fileId=s.fileId
       LEFT JOIN users sender ON sender.userId=s.senderId
       LEFT JOIN users recip  ON recip.userId=s.recipientId
       ORDER BY s.createdAt DESC`
    );
  },
};

// ══ S3 / LOCAL STORAGE ══════════════════════════════
const fs=require('fs'),pathLib=require('path');
const UPLOADS_DIR = pathLib.join(__dirname,'../../uploads/files');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR,{recursive:true});

const s3Service = {
  async uploadEncryptedFile(fileId,userId,buf) {
    const dir=pathLib.join(UPLOADS_DIR,userId);
    if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
    const fp=pathLib.join(dir,fileId+'.enc');
    fs.writeFileSync(fp,buf); return fp;
  },
  async downloadEncryptedFile(fileId,userId) {
    const fp=pathLib.join(UPLOADS_DIR,userId,fileId+'.enc');
    if(!fs.existsSync(fp)) throw new Error('File not found on disk');
    return fs.readFileSync(fp);
  },
  async deleteFile(fileId,userId) {
    const fp=pathLib.join(UPLOADS_DIR,userId,fileId+'.enc');
    if(fs.existsSync(fp)) fs.unlinkSync(fp);
  },
  async getPresignedDownloadUrl(fileId) { return `http://127.0.0.1:3000/api/v1/files/${fileId}/download`; },
  async fileExists(fileId,userId) { return fs.existsSync(pathLib.join(UPLOADS_DIR,userId,fileId+'.enc')); },
};

const kmsService = {
  async generateDataKey() { const k=require('crypto').randomBytes(32); return {plaintext:k,ciphertextBlob:k}; },
  async decryptDataKey(b) { return b; },
};

// ══ ADMIN ════════════════════════════════════════════
const adminDB = {
  async getDashboardStats() {
    const [uRow]  = await q('SELECT COUNT(*) AS total FROM users WHERE role="user"');
    const [fRow]  = await q('SELECT COUNT(*) AS total,COALESCE(SUM(sizeBytes),0) AS totalSize FROM files WHERE status="active"');
    const [sRow]  = await q('SELECT COUNT(*) AS total FROM share_links');
    const [saRow] = await q('SELECT COUNT(*) AS total FROM share_links WHERE status="accepted"');
    const [dRow]  = await q('SELECT COUNT(*) AS total FROM audit_log WHERE event="FILE_DOWNLOADED"');
    return {
      totalUsers:Number(uRow.total)||0, totalFiles:Number(fRow.total)||0,
      totalSize:Number(fRow.totalSize)||0, totalShares:Number(sRow.total)||0,
      acceptedShares:Number(saRow.total)||0, totalDownloads:Number(dRow.total)||0,
    };
  },
  async getAllUsers() {
    return q('SELECT userId,email,name,role,plan,storageUsed,storageMax,createdAt,totpEnabled FROM users ORDER BY createdAt DESC');
  },
  async getAllFiles() {
    return q(`SELECT f.fileId,f.originalName,f.sizeBytes,f.algo,f.status,f.version,f.createdAt,u.name AS userName,u.email AS userEmail FROM files f LEFT JOIN users u ON u.userId=f.userId WHERE f.status='active' ORDER BY f.createdAt DESC`);
  },
  async getAllShares() {
    return q(`SELECT s.shareId,s.fileId,s.status,s.createdAt,f.originalName,sender.name AS senderName,recip.name AS recipientName FROM share_links s LEFT JOIN files f ON f.fileId=s.fileId LEFT JOIN users sender ON sender.userId=s.senderId LEFT JOIN users recip ON recip.userId=s.recipientId ORDER BY s.createdAt DESC`);
  },
  async getRecentActivity(limit=100) {
    const lim=parseInt(limit)||100;
    return q(`SELECT a.logId,a.userId,a.event,a.fileId,a.fileName,a.ip,a.details,a.createdAt,u.name AS userName,u.email AS userEmail,u.role AS userRole,u.plan AS userPlan,f.sizeBytes AS fileSize,f.algo AS fileAlgo,f.originalName AS fileOriginalName FROM audit_log a LEFT JOIN users u ON u.userId=a.userId LEFT JOIN files f ON f.fileId=a.fileId ORDER BY a.createdAt DESC LIMIT `+lim);
  },
  async getMonthlyStats() {
    const rows = await q(`SELECT DATE_FORMAT(createdAt,'%Y-%m') AS month,COUNT(*) AS uploads,COALESCE(SUM(sizeBytes),0) AS totalSize FROM files WHERE status='active' GROUP BY month ORDER BY month DESC LIMIT 6`);
    return rows.reverse();
  },
  async deleteUser(userId) {
    const id=String(userId);
    await q(`DELETE FROM sessions WHERE userId='${id}'`);
    await q(`DELETE FROM share_links WHERE senderId='${id}' OR recipientId='${id}'`);
    await q(`UPDATE files SET status='deleted' WHERE userId='${id}'`);
    await q(`DELETE FROM users WHERE userId='${id}'`);
  },
};

module.exports = { s3Service, userDB, fileDB, keyDB, auditDB, sessionDB, shareDB, adminDB, kmsService,pool };