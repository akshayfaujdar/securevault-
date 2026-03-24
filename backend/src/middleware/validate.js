'use strict';
const Joi = require('joi');

const validate = (schema, target = 'body') => (req, res, next) => {
  const { error, value } = schema.validate(req[target], { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map(d => ({ field: d.path.join('.'), message: d.message }));
    return res.status(400).json({ error: 'Validation failed', details });
  }
  req[target] = value;
  next();
};

// ── Schemas ───────────────────────────────────────────

const schemas = {
  register: Joi.object({
    email    : Joi.string().email().lowercase().max(254).required(),
    password : Joi.string().min(12).max(128).required(),
    name     : Joi.string().min(1).max(100).required(),
  }),

  login: Joi.object({
    email    : Joi.string().email().lowercase().required(),
    password : Joi.string().required(),
    totp     : Joi.string().length(6).pattern(/^\d+$/).optional(),
  }),

  fileUpload: Joi.object({
    cipher   : Joi.string().valid('aes-256-gcm', 'chacha20-poly1305').default('aes-256-gcm'),
    vaultId  : Joi.string().uuid().optional(),
    tags     : Joi.array().items(Joi.string().max(50)).max(10).optional(),
  }),

  shareCreate: Joi.object({
    fileId      : Joi.string().uuid().required(),
    expiresIn   : Joi.number().integer().min(300).max(604800).default(3600),
    password    : Joi.string().min(8).optional(),
    maxDownloads: Joi.number().integer().min(1).max(100).optional(),
  }),

  changePassword: Joi.object({
    currentPassword : Joi.string().required(),
    newPassword     : Joi.string().min(12).max(128).required(),
  }),
};

module.exports = { validate, schemas };
