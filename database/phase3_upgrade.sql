-- ═══════════════════════════════════════════════════════
-- SECUREVAULT PHASE 3 — SQL UPGRADE
-- Run this in MySQL Workbench
-- ═══════════════════════════════════════════════════════

USE ciphercloud;

-- ── FEATURE 26: Zero-Knowledge Proof ─────────────────
CREATE TABLE IF NOT EXISTS zkp_proofs (
  proofId     VARCHAR(36) PRIMARY KEY,
  userId      VARCHAR(36) NOT NULL,
  fileId      VARCHAR(36),
  proofType   VARCHAR(50),
  commitment  TEXT,
  challenge   TEXT,
  response    TEXT,
  verified    BOOLEAN DEFAULT FALSE,
  createdAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- ── FEATURE 27: Blockchain Audit Trail ───────────────
CREATE TABLE IF NOT EXISTS blockchain_blocks (
  blockId       VARCHAR(36) PRIMARY KEY,
  blockIndex    INT NOT NULL,
  previousHash  VARCHAR(64),
  currentHash   VARCHAR(64) NOT NULL,
  data          TEXT,
  nonce         INT DEFAULT 0,
  timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
  userId        VARCHAR(36),
  eventType     VARCHAR(50),
  fileId        VARCHAR(36)
);

CREATE TABLE IF NOT EXISTS blockchain_state (
  stateId       VARCHAR(36) PRIMARY KEY,
  chainLength   INT DEFAULT 0,
  lastHash      VARCHAR(64),
  isValid       BOOLEAN DEFAULT TRUE,
  lastUpdated   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── FEATURE 28: AI Anomaly Detection ─────────────────
CREATE TABLE IF NOT EXISTS anomaly_detections (
  anomalyId    VARCHAR(36) PRIMARY KEY,
  userId       VARCHAR(36),
  anomalyType  VARCHAR(100),
  severity     VARCHAR(20),
  description  TEXT,
  evidence     TEXT,
  resolved     BOOLEAN DEFAULT FALSE,
  detectedAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- ── FEATURE 29: Smart Search ──────────────────────────
CREATE TABLE IF NOT EXISTS search_index (
  indexId      VARCHAR(36) PRIMARY KEY,
  fileId       VARCHAR(36) NOT NULL,
  userId       VARCHAR(36) NOT NULL,
  fileName     VARCHAR(255),
  tags         TEXT,
  mimeType     VARCHAR(100),
  sizeBytes    BIGINT,
  algo         VARCHAR(50),
  folderName   VARCHAR(100),
  uploadedAt   DATETIME,
  indexedAt    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fileId) REFERENCES files(fileId)
);

CREATE TABLE IF NOT EXISTS search_history (
  searchId     VARCHAR(36) PRIMARY KEY,
  userId       VARCHAR(36) NOT NULL,
  query        VARCHAR(255),
  resultCount  INT DEFAULT 0,
  searchedAt   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- ── FEATURE 30: Team / Organization ──────────────────
CREATE TABLE IF NOT EXISTS organizations (
  orgId        VARCHAR(36) PRIMARY KEY,
  name         VARCHAR(100) NOT NULL,
  ownerId      VARCHAR(36) NOT NULL,
  plan         VARCHAR(20) DEFAULT 'team',
  maxMembers   INT DEFAULT 10,
  storageLimit BIGINT DEFAULT 53687091200,
  createdAt    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ownerId) REFERENCES users(userId)
);

CREATE TABLE IF NOT EXISTS org_members (
  memberId     VARCHAR(36) PRIMARY KEY,
  orgId        VARCHAR(36) NOT NULL,
  userId       VARCHAR(36) NOT NULL,
  role         VARCHAR(20) DEFAULT 'member',
  joinedAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  invitedBy    VARCHAR(36),
  FOREIGN KEY (orgId)   REFERENCES organizations(orgId),
  FOREIGN KEY (userId)  REFERENCES users(userId)
);

CREATE TABLE IF NOT EXISTS org_invites (
  inviteId     VARCHAR(36) PRIMARY KEY,
  orgId        VARCHAR(36) NOT NULL,
  email        VARCHAR(254) NOT NULL,
  role         VARCHAR(20) DEFAULT 'member',
  token        VARCHAR(64) NOT NULL,
  invitedBy    VARCHAR(36),
  accepted     BOOLEAN DEFAULT FALSE,
  expiresAt    DATETIME,
  createdAt    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (orgId) REFERENCES organizations(orgId)
);

ALTER TABLE files ADD COLUMN orgId VARCHAR(36) DEFAULT NULL;
ALTER TABLE users ADD COLUMN orgId VARCHAR(36) DEFAULT NULL;

-- ── Verify ────────────────────────────────────────────
SELECT 'Phase 3 SQL upgrade complete!' AS status;
SHOW TABLES;