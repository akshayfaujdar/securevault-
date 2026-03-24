'use strict';
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, errors, json, colorize, simple } = format;

const isProd = process.env.NODE_ENV === 'production';

const logger = createLogger({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: { service: 'ciphercloud-api' },
  transports: [
    new transports.Console({
      format: isProd ? combine(timestamp(), json()) : combine(colorize(), simple()),
    }),
  ],
});

// Silence during tests
if (process.env.NODE_ENV === 'test') {
  logger.transports.forEach(t => { t.silent = true; });
}

module.exports = logger;
