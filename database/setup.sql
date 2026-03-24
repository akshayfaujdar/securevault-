-- ═══════════════════════════════════════════════════
-- SecureVault — Database Setup
-- Run this in MySQL Workbench to create all tables
-- ═══════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS ciphercloud;
USE ciphercloud;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  userId       VARCHAR(36)  PRIMARY KEY,
  email        VARCHAR(254) UNIQUE NOT NULL,
  name         VARCHAR(100) NOT NULL,
  passwordHash TEXT         NOT NULL,
  role         VARCHAR(20)  DEFAULT 'user',
  plan         VARCHAR(20)  DEFAULT 'free',
  storageUsed  BIGINT       DEFAULT 0,
  storageMax   BIGINT       DEFAULT 5368709120,
  totpEnabled  BOOLEAN      DEFAULT FALSE,
  totpSecret   TEXT,
  verified     BOOLEAN      DEFAULT FALSE,
  verifyToken  VARCHAR(100),
  lastLoginAt  DATETIME,
  createdAt    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updatedAt    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add role/plan columns if missing (safe to run multiple times)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'free';

-- Files table
CREATE TABLE IF NOT EXISTS files (
  fileId         VARCHAR(36)  PRIMARY KEY,
  userId         VARCHAR(36)  NOT NULL,
  originalName   VARCHAR(255) NOT NULL,
  mimeType       VARCHAR(100),
  sizeBytes      BIGINT       DEFAULT 0,
  encryptedSize  BIGINT       DEFAULT 0,
  filePath       TEXT,
  block1Path     TEXT,
  block2Path     TEXT,
  block3Path     TEXT,
  stegoImagePath TEXT,
  secretKey      TEXT,
  algo           VARCHAR(50)  DEFAULT 'hybrid',
  integrity      TEXT,
  tags           TEXT,
  status         VARCHAR(20)  DEFAULT 'active',
  createdAt      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- Encryption keys table
CREATE TABLE IF NOT EXISTS encryption_keys (
  fileId      VARCHAR(36) NOT NULL,
  userId      VARCHAR(36) NOT NULL,
  wrappedDEK  TEXT        NOT NULL,
  kekSalt     VARCHAR(64) NOT NULL,
  algo        VARCHAR(50) DEFAULT 'hybrid',
  integrity   TEXT,
  stegoKey    TEXT,
  keyVersion  INT         DEFAULT 1,
  rotatedAt   DATETIME,
  createdAt   DATETIME    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fileId, userId),
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  logId     VARCHAR(36)  PRIMARY KEY,
  userId    VARCHAR(36),
  event     VARCHAR(100),
  fileId    VARCHAR(36),
  fileName  VARCHAR(255),
  ip        VARCHAR(45),
  details   TEXT,
  createdAt DATETIME     DEFAULT CURRENT_TIMESTAMP
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  sessionId VARCHAR(36) PRIMARY KEY,
  userId    VARCHAR(36) NOT NULL,
  token     TEXT        NOT NULL,
  ip        VARCHAR(45),
  createdAt DATETIME    DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- Share links
DROP TABLE IF EXISTS share_links;
CREATE TABLE share_links (
  shareId        VARCHAR(36) PRIMARY KEY,
  fileId         VARCHAR(36) NOT NULL,
  senderId       VARCHAR(36) NOT NULL,
  recipientId    VARCHAR(36) NOT NULL,
  status         VARCHAR(20) DEFAULT 'pending',
  stegoImagePath TEXT,
  createdAt      DATETIME    DEFAULT CURRENT_TIMESTAMP,
  updatedAt      DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (senderId)    REFERENCES users(userId),
  FOREIGN KEY (recipientId) REFERENCES users(userId)
);

-- Verify tables created
SELECT table_name, table_rows
FROM information_schema.tables
WHERE table_schema = 'ciphercloud'
ORDER BY table_name;
