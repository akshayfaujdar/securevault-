'use strict';
// ═══════════════════════════════════════════════════════
// FEATURE 27 — BLOCKCHAIN AUDIT TRAIL
// File: C:\Projects\securevault\backend\src\routes\blockchain.js
// ═══════════════════════════════════════════════════════
// Implementation: Custom SHA-256 blockchain
// Each block contains:
//   - index, timestamp, event data
//   - previousHash (links blocks together)
//   - currentHash = SHA256(index+timestamp+data+previousHash+nonce)
//   - nonce (proof of work - simple difficulty)
// Tamper detection: if any block changes, all subsequent hashes break
// ═══════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../services/localDB');

async function q(sql, p=[])  { const [r] = await pool.query(sql,p); return r; }
async function q1(sql, p=[]) { return (await q(sql,p))[0]||null; }

const DIFFICULTY = 2; // Hash must start with this many zeros

// ── Core blockchain functions ─────────────────────────
function calculateHash(index, timestamp, data, previousHash, nonce) {
  return crypto.createHash('sha256')
    .update(String(index) + String(timestamp) + JSON.stringify(data) + String(previousHash) + String(nonce))
    .digest('hex');
}

function mineBlock(index, timestamp, data, previousHash) {
  let nonce = 0;
  let hash  = '';
  const target = '0'.repeat(DIFFICULTY);

  // Proof of work — find nonce where hash starts with zeros
  while (!hash.startsWith(target)) {
    nonce++;
    hash = calculateHash(index, timestamp, data, previousHash, nonce);
    if (nonce > 100000) break; // Safety limit
  }
  return { hash, nonce };
}

async function getLastBlock() {
  const blocks = await q('SELECT * FROM blockchain_blocks ORDER BY blockIndex DESC LIMIT 1');
  return blocks[0] || null;
}

async function addBlock(userId, eventType, data, fileId = null) {
  const lastBlock = await getLastBlock();
  const index     = lastBlock ? lastBlock.blockIndex + 1 : 0;
  const prevHash  = lastBlock ? lastBlock.currentHash : '0'.repeat(64);
  const timestamp = new Date().toISOString();

  const blockData = {
    userId,
    eventType,
    fileId,
    timestamp,
    ...data
  };

  const { hash, nonce } = mineBlock(index, timestamp, blockData, prevHash);

  const blockId = uuidv4();
  await q(`INSERT INTO blockchain_blocks 
    (blockId, blockIndex, previousHash, currentHash, data, nonce, timestamp, userId, eventType, fileId)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [blockId, index, prevHash, hash, JSON.stringify(blockData), nonce,
     timestamp.slice(0,19).replace('T',' '), userId, eventType, fileId||null]);

  // Update chain state
  await q(`INSERT INTO blockchain_state (stateId, chainLength, lastHash, isValid, lastUpdated)
    VALUES ('main-chain', ?, ?, TRUE, NOW())
    ON DUPLICATE KEY UPDATE chainLength=VALUES(chainLength), lastHash=VALUES(lastHash), lastUpdated=NOW()`,
    [index + 1, hash]);

  return { blockId, blockIndex: index, hash: hash.slice(0, 16) + '...', nonce };
}

// ── Initialize blockchain (genesis block) ────────────
router.post('/init', requireAuth, async (req, res) => {
  try {
    const existing = await q1('SELECT * FROM blockchain_blocks WHERE blockIndex=0');
    if (existing) return res.json({ message: 'Blockchain already initialized', genesisHash: existing.currentHash });

    const userId = req.user.userId;
    const result = await addBlock(userId, 'GENESIS', {
      message: 'SecureVault Blockchain Initialized',
      version: '1.0',
      difficulty: DIFFICULTY
    });

    res.json({
      success: true,
      message: '⛓️ Blockchain initialized with genesis block!',
      genesisBlock: result,
      difficulty: DIFFICULTY
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Add event to blockchain ───────────────────────────
router.post('/add', requireAuth, async (req, res) => {
  try {
    const userId    = req.user.userId;
    const { eventType, fileId, details } = req.body;

    if (!eventType) return res.status(400).json({ error: 'eventType required' });

    // Auto-init if no genesis block
    const genesis = await q1('SELECT blockId FROM blockchain_blocks WHERE blockIndex=0');
    if (!genesis) {
      await addBlock('system', 'GENESIS', { message: 'Auto-initialized', version: '1.0' });
    }

    const result = await addBlock(userId, eventType, {
      details: details || {},
      userAgent: req.headers['user-agent']?.slice(0, 100),
      ip: req.ip
    }, fileId);

    res.json({
      success: true,
      message: `✅ Event "${eventType}" recorded on blockchain`,
      block: result,
      immutable: true,
      tamperProof: 'Block hash depends on all previous blocks'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get blockchain ────────────────────────────────────
router.get('/chain', requireAuth, async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit) || 20;
    const blocks = await q(`SELECT * FROM blockchain_blocks ORDER BY blockIndex DESC LIMIT ${limit}`);
    const state  = await q1('SELECT * FROM blockchain_state WHERE stateId="main-chain"');

    res.json({
      chain: blocks.map(b => ({
        ...b,
        data: JSON.parse(b.data || '{}'),
        hashPreview: b.currentHash?.slice(0, 20) + '...',
        prevHashPreview: b.previousHash?.slice(0, 20) + '...'
      })),
      chainLength:  state?.chainLength || 0,
      lastHash:     state?.lastHash?.slice(0, 20) + '...',
      isValid:      state?.isValid || false,
      difficulty:   DIFFICULTY
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Verify entire chain integrity ─────────────────────
router.get('/verify', requireAuth, async (req, res) => {
  try {
    const blocks = await q('SELECT * FROM blockchain_blocks ORDER BY blockIndex ASC');

    if (blocks.length === 0) {
      return res.json({ valid: false, message: 'Chain is empty — initialize first' });
    }

    let isValid    = true;
    let errorBlock = null;
    const issues   = [];

    for (let i = 1; i < blocks.length; i++) {
      const current  = blocks[i];
      const previous = blocks[i - 1];

      // Check 1: Previous hash matches
      if (current.previousHash !== previous.currentHash) {
        isValid = false;
        errorBlock = i;
        issues.push({
          blockIndex: i,
          issue: 'Previous hash mismatch — chain broken!',
          expected: previous.currentHash.slice(0, 16) + '...',
          found: current.previousHash.slice(0, 16) + '...'
        });
        break;
      }

      // Check 2: Current hash is valid
      const data = JSON.parse(current.data || '{}');
      const recomputed = calculateHash(
        current.blockIndex, current.timestamp, data,
        current.previousHash, current.nonce
      );

      if (recomputed !== current.currentHash) {
        isValid = false;
        errorBlock = i;
        issues.push({
          blockIndex: i,
          issue: 'Hash mismatch — block was tampered!',
          stored:     current.currentHash.slice(0, 16) + '...',
          computed:   recomputed.slice(0, 16) + '...'
        });
        break;
      }
    }

    // Update chain validity in DB
    await q(`UPDATE blockchain_state SET isValid=? WHERE stateId='main-chain'`, [isValid]);

    res.json({
      valid: isValid,
      blocksChecked: blocks.length,
      issues,
      errorBlock,
      message: isValid
        ? `✅ Blockchain VALID — all ${blocks.length} blocks verified, no tampering detected`
        : `❌ Blockchain INVALID — tampering detected at block ${errorBlock}!`,
      verifiedAt: new Date().toISOString()
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get blocks for specific file ──────────────────────
router.get('/file/:fileId', requireAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const blocks = await q(`SELECT b.*, u.name AS userName
      FROM blockchain_blocks b
      LEFT JOIN users u ON u.userId = b.userId
      WHERE b.fileId=? ORDER BY b.blockIndex ASC`, [fileId]);

    res.json({
      fileId,
      blocks: blocks.map(b => ({
        blockIndex:  b.blockIndex,
        eventType:   b.eventType,
        userName:    b.userName,
        timestamp:   b.timestamp,
        hash:        b.currentHash?.slice(0, 20) + '...',
        data:        JSON.parse(b.data || '{}')
      })),
      count: blocks.length
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Get blockchain stats ──────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const state    = await q1('SELECT * FROM blockchain_state WHERE stateId="main-chain"');
    const [counts] = await q('SELECT COUNT(*) AS total FROM blockchain_blocks');
    const events   = await q('SELECT eventType, COUNT(*) AS count FROM blockchain_blocks GROUP BY eventType ORDER BY count DESC');
    const recent   = await q('SELECT blockIndex, eventType, timestamp, currentHash FROM blockchain_blocks ORDER BY blockIndex DESC LIMIT 5');

    res.json({
      chainLength:  state?.chainLength || 0,
      totalBlocks:  counts?.total || 0,
      isValid:      state?.isValid || false,
      lastHash:     state?.lastHash?.slice(0, 20) + '...',
      difficulty:   DIFFICULTY,
      eventTypes:   events,
      recentBlocks: recent.map(b => ({ ...b, hash: b.currentHash?.slice(0,16)+'...' }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.addBlock = addBlock;