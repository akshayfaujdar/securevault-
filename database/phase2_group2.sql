-- ═══════════════════════════════════════════════════════
-- SECUREVAULT PHASE 2 GROUP 2 — SQL UPGRADE
-- Run this in MySQL Workbench
-- ═══════════════════════════════════════════════════════

USE ciphercloud;

-- ── FEATURE 17: AI File Scanner ──────────────────────
CREATE TABLE IF NOT EXISTS file_scan_results (
  scanId        VARCHAR(36) PRIMARY KEY,
  fileId        VARCHAR(36) NOT NULL,
  userId        VARCHAR(36) NOT NULL,
  riskLevel     VARCHAR(20) DEFAULT 'low',
  riskScore     INT DEFAULT 0,
  findings      TEXT,
  scannedAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fileId) REFERENCES files(fileId)
);

-- ── FEATURE 18: AI Risk Score ─────────────────────────
CREATE TABLE IF NOT EXISTS user_risk_scores (
  userId        VARCHAR(36) PRIMARY KEY,
  riskScore     INT DEFAULT 0,
  riskLevel     VARCHAR(20) DEFAULT 'low',
  factors       TEXT,
  lastUpdated   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- ── FEATURE 19: Real-time Dashboard ──────────────────
CREATE TABLE IF NOT EXISTS realtime_events (
  eventId       VARCHAR(36) PRIMARY KEY,
  userId        VARCHAR(36),
  eventType     VARCHAR(50),
  payload       TEXT,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── FEATURE 20: Security Score ───────────────────────
CREATE TABLE IF NOT EXISTS security_scores (
  userId        VARCHAR(36) PRIMARY KEY,
  totalScore    INT DEFAULT 0,
  maxScore      INT DEFAULT 100,
  grade         VARCHAR(5) DEFAULT 'F',
  breakdown     TEXT,
  lastUpdated   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- ── FEATURE 21: Geographic Access Map ────────────────
CREATE TABLE IF NOT EXISTS access_locations (
  locationId    VARCHAR(36) PRIMARY KEY,
  userId        VARCHAR(36) NOT NULL,
  ip            VARCHAR(45),
  country       VARCHAR(100),
  city          VARCHAR(100),
  latitude      FLOAT,
  longitude     FLOAT,
  event         VARCHAR(50),
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

-- ── FEATURE 22: User Activity Report ─────────────────
CREATE TABLE IF NOT EXISTS activity_reports (
  reportId      VARCHAR(36) PRIMARY KEY,
  userId        VARCHAR(36) NOT NULL,
  reportType    VARCHAR(20) DEFAULT 'weekly',
  reportData    TEXT,
  sentAt        DATETIME,
  createdAt     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(userId)
);

ALTER TABLE users ADD COLUMN activityReports BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN lastReportSent  DATETIME DEFAULT NULL;

SELECT 'Phase 2 Group 2 SQL complete!' AS status;
SHOW TABLES;