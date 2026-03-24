'use strict';
const express = require('express');
const router  = express.Router();
const https   = require('https');

router.post('/', async (req, res) => {
  try {
    const { messages, system } = req.body;
    if (!messages || !Array.isArray(messages))
      return res.status(400).json({ error: 'messages array required' });

    const apiKey = process.env.GROQ_API_KEY || '';
    if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not set in .env' });

    const groqMessages = system
      ? [{ role: 'system', content: system }, ...messages]
      : messages;

    const body = JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1024,
      messages: groqMessages.slice(-12),
      temperature: 0.7,
    });

    const options = {
      hostname: 'api.groq.com',
      path    : '/openai/v1/chat/completions',
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Authorization' : 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const apiReq = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => { data += chunk; });
      apiRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return res.status(400).json({ error: parsed.error.message || 'Groq API error' });
          const reply = parsed.choices?.[0]?.message?.content || 'No response';
          res.json({ reply });
        } catch (e) { res.status(500).json({ error: 'Failed to parse API response' }); }
      });
    });

    apiReq.on('error', (e) => res.status(500).json({ error: 'API request failed: ' + e.message }));
    apiReq.write(body);
    apiReq.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;