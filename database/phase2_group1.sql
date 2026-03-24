-- ═══════════════════════════════════════════════════════
-- SECUREVAULT PHASE 2 GROUP 1 — SQL UPGRADE
-- Run this in MySQL Workbench
-- ═══════════════════════════════════════════════════════

USE ciphercloud;

-- ── FEATURE 13: Digital Signatures ───────────────────
ALTER TABLE files ADD COLUMN signature      TEXT;
ALTER TABLE files ADD COLUMN signedBy       VARCHAR(36);
ALTER TABLE files ADD COLUMN signedAt       DATETIME;
ALTER TABLE files ADD COLUMN publicKey      TEXT;

CREATE TABLE IF NOT EXISTS user_keypairs (
  userId      VARCHAR(36) PRIMARY KEY,
  publicKey   TEXT NOT NULL,
  privateKeyEnc TEXT NOT NULL,
  createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- ── FEATURE 14: Folder Structure ─────────────────────
CREATE TABLE IF NOT EXISTS folders (
  folderId    VARCHAR(36) PRIMARY KEY,
  userId      VARCHAR(36) NOT NULL,
  name        VARCHAR(100) NOT NULL,
  parentId    VARCHAR(36) DEFAULT NULL,
  color       VARCHAR(10) DEFAULT '#4f46e5',
  icon        VARCHAR(10) DEFAULT '📁',
  createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

ALTER TABLE files ADD COLUMN folderId VARCHAR(36) DEFAULT NULL;

-- ── FEATURE 15: File Preview ──────────────────────────
ALTER TABLE files ADD COLUMN thumbnailPath TEXT;
ALTER TABLE files ADD COLUMN previewable   BOOLEAN DEFAULT FALSE;

-- ── FEATURE 16: Role Based Access ────────────────────
CREATE TABLE IF NOT EXISTS file_permissions (
  permId      VARCHAR(36) PRIMARY KEY,
  fileId      VARCHAR(36) NOT NULL,
  userId      VARCHAR(36) NOT NULL,
  grantedBy   VARCHAR(36) NOT NULL,
  role        VARCHAR(20) DEFAULT 'viewer',
  canView     BOOLEAN DEFAULT TRUE,
  canDownload BOOLEAN DEFAULT FALSE,
  canShare    BOOLEAN DEFAULT FALSE,
  canDelete   BOOLEAN DEFAULT FALSE,
  expiresAt   DATETIME DEFAULT NULL,
  createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fileId) REFERENCES files(fileId),
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- ── Verify ────────────────────────────────────────────
SELECT 'Phase 2 Group 1 SQL complete!' AS status;
SHOW TABLES;