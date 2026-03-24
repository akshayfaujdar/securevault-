'use strict';
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const logger    = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3000;
const API  = `/api/${process.env.API_VERSION || 'v1'}`;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true, methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: m => logger.info(m.trim()) } }));

const authLimiter = rateLimit({ windowMs: 60000, max: 100, message: { error: 'Too many auth attempts' } });
const apiLimiter  = rateLimit({ windowMs: 900000, max: 500 });
app.use(`${API}/auth`, authLimiter);
app.use(API, apiLimiter);

app.use(`${API}/auth`,    require('./routes/auth'));
app.use(`${API}/files`,   require('./routes/files'));
app.use(`${API}/keys`,    require('./routes/keys'));
app.use(`${API}/hybrid`,  require('./routes/hybrid'));
app.use(`${API}/sharing`, require('./routes/sharing'));
app.use(`${API}/admin`,   require('./routes/admin'));
app.use(`${API}/chat`,    require('./routes/chat'));
app.use(`${API}/phase1`,  require('./routes/phase1'));
app.use(`${API}/e2e`,          require('./routes/e2e'));
app.use(`${API}/signatures`,   require('./routes/signatures'));
app.use(`${API}/folders`,      require('./routes/folders'));
app.use(`${API}/preview-roles`, require('./routes/preview_roles'));
app.use(`${API}/scanner`,  require('./routes/scanner'));
app.use(`${API}/analytics`,require('./routes/analytics'));
app.use(`${API}/geo`,      require('./routes/geo_reports'));
app.use(`${API}/zkp`,       require('./routes/zkp'));
app.use(`${API}/blockchain`, require('./routes/blockchain'));
app.use(`${API}/anomaly`,   require('./routes/anomaly_search'));
app.use(`${API}/orgs`,      require('./routes/organizations'));
app.use(`${API}/crypto`,     require('./routes/advanced_crypto'));
app.use(`${API}/notes`,      require('./routes/notes_compliance'));
app.use(`${API}/compliance`, require('./routes/notes_compliance'));

app.get('/health', (req, res) => res.json({
  status: 'ok', service: 'securevault-api', version: '3.0.0',
  timestamp: new Date().toISOString(),
  features: ['2FA','EmailNotifications','VersionHistory','IntegrityCheck','QRCode','StorageQuota','ThreatDetection','CSVExport','AIChatbot'],
  crypto: { algorithms: ['AES-256-CBC','Triple-DES','Blowfish','PBKDF2-SHA512','HMAC-SHA256'], steganography: 'LSB', fileBlocks: 3 },
}));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  logger.error('Error', { error: err.message });
  res.status(err.status||500).json({ error: err.message||'Internal server error' });
});

app.listen(PORT, () => {
  logger.info('SecureVault API v3.0 running', { port: PORT, api: API });
});
module.exports = app;