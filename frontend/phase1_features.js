// ═══════════════════════════════════════════════════════
// SECUREVAULT PHASE 1 — FRONTEND JAVASCRIPT
// INSTRUCTION: Add this entire block just before </body> 
// in your index.html file
// ═══════════════════════════════════════════════════════

// ── API helper (reuse existing one) ─────────────────
// This assumes your index.html already has:
//   async function api(path, opts) { ... }
// If not, add this:
async function phase1api(path, opts = {}) {
  const token = localStorage.getItem('sv_token');
  const res = await fetch('http://127.0.0.1:3000/api/v1' + path, {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    ...opts
  });
  return res.json();
}

// ════════════════════════════════════════════════════
// FEATURE 1 — FILE SELF-DESTRUCT
// ════════════════════════════════════════════════════
function showSelfDestructModal(fileId, fileName) {
  const existing = document.getElementById('sd-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'sd-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;max-width:420px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.3)">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:42px">💣</div>
        <h3 style="margin:8px 0 4px;color:#1e1b4b;font-size:18px">Set Self-Destruct</h3>
        <p style="color:#6b7280;font-size:13px;margin:0">${fileName}</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Max Downloads (optional)</label>
          <input id="sd-maxdl" type="number" min="1" placeholder="e.g. 3" 
            style="width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;box-sizing:border-box">
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Expires After</label>
          <div style="display:flex;gap:8px">
            <input id="sd-hours" type="number" min="1" placeholder="Hours" 
              style="flex:1;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px">
            <input id="sd-days" type="number" min="1" placeholder="Days" 
              style="flex:1;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px">
          </div>
        </div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;font-size:12px;color:#dc2626">
          ⚠️ After conditions are met, the file will be permanently and irreversibly deleted!
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:20px">
        <button onclick="document.getElementById('sd-modal').remove()" 
          style="flex:1;padding:10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;background:white;font-size:14px">Cancel</button>
        <button onclick="setSelfDestruct('${fileId}')" 
          style="flex:1;padding:10px;background:linear-gradient(135deg,#ef4444,#dc2626);color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">💣 Arm It</button>
      </div>
    </div>`;
  modal.onclick = e => { if (e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}

async function setSelfDestruct(fileId) {
  const maxDownloads = document.getElementById('sd-maxdl').value;
  const expiresInHours = document.getElementById('sd-hours').value;
  const expiresInDays = document.getElementById('sd-days').value;

  if (!maxDownloads && !expiresInHours && !expiresInDays) {
    alert('Please set at least one condition (max downloads or expiry time)');
    return;
  }

  try {
    const d = await phase1api('/phase1/self-destruct/' + fileId, {
      method: 'POST',
      body: JSON.stringify({
        maxDownloads: maxDownloads ? parseInt(maxDownloads) : null,
        expiresInHours: expiresInHours ? parseInt(expiresInHours) : null,
        expiresInDays: expiresInDays ? parseInt(expiresInDays) : null
      })
    });
    document.getElementById('sd-modal').remove();
    if (typeof toast === 'function') toast('ok', '💣 Self-destruct armed!');
    else alert('Self-destruct armed! ' + (d.maxDownloads ? 'Max ' + d.maxDownloads + ' downloads.' : '') + (d.expiresAt ? ' Expires: ' + new Date(d.expiresAt).toLocaleString() : ''));
  } catch(e) { alert('Error: ' + e.message); }
}

async function removeSelfDestruct(fileId) {
  if (!confirm('Remove self-destruct from this file?')) return;
  await phase1api('/phase1/self-destruct/' + fileId, { method: 'DELETE' });
  if (typeof toast === 'function') toast('ok', 'Self-destruct removed');
}

// ════════════════════════════════════════════════════
// FEATURE 2 — HONEYPOT FILES
// ════════════════════════════════════════════════════
async function createHoneypot() {
  const name = prompt('Honeypot file name (make it tempting!):', 'passwords_backup_2024.txt');
  if (!name) return;

  try {
    const d = await phase1api('/phase1/honeypot', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    if (typeof toast === 'function') toast('ok', '🍯 Honeypot "' + name + '" created!');
    else alert('Honeypot created: ' + name);
  } catch(e) { alert('Error: ' + e.message); }
}

async function viewHoneypotAlerts() {
  try {
    const d = await phase1api('/phase1/honeypot');
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const alerts = d.alerts || [];
    const alertRows = alerts.length === 0
      ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:#6b7280">No honeypot triggers yet</td></tr>'
      : alerts.map(a => `<tr>
          <td style="padding:8px;font-size:13px">${a.accessedByName || 'Unknown'}</td>
          <td style="padding:8px;font-size:12px;color:#6b7280">${a.accessedByEmail || '-'}</td>
          <td style="padding:8px;font-size:12px;color:#ef4444">${a.ip || '-'}</td>
          <td style="padding:8px;font-size:12px;color:#6b7280">${new Date(a.createdAt).toLocaleString()}</td>
        </tr>`).join('');

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:600px;width:100%;max-height:80vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;color:#1e1b4b">🍯 Honeypot Alerts (${alerts.length})</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f9fafb">
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">User</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Email</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">IP</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Time</th>
          </tr></thead>
          <tbody>${alertRows}</tbody>
        </table>
      </div>`;
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { alert('Error: ' + e.message); }
}

// ════════════════════════════════════════════════════
// FEATURE 3 — DARK / LIGHT MODE TOGGLE
// ════════════════════════════════════════════════════
let currentTheme = localStorage.getItem('sv_theme') || 'dark';

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('sv_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);

  if (theme === 'light') {
    document.documentElement.style.setProperty('--bg', '#f8fafc');
    document.documentElement.style.setProperty('--bg2', '#ffffff');
    document.documentElement.style.setProperty('--bg3', '#f1f5f9');
    document.documentElement.style.setProperty('--text', '#0f172a');
    document.documentElement.style.setProperty('--text2', '#475569');
    document.documentElement.style.setProperty('--border', '#e2e8f0');
    document.documentElement.style.setProperty('--card', '#ffffff');
  } else {
    document.documentElement.style.setProperty('--bg', '#0f0e17');
    document.documentElement.style.setProperty('--bg2', '#1a1828');
    document.documentElement.style.setProperty('--bg3', '#231f35');
    document.documentElement.style.setProperty('--text', '#e8e6f0');
    document.documentElement.style.setProperty('--text2', '#9ca3af');
    document.documentElement.style.setProperty('--border', '#2d2a3e');
    document.documentElement.style.setProperty('--card', '#1a1828');
  }

  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
}

async function toggleTheme() {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  try {
    await phase1api('/phase1/theme', { method: 'POST', body: JSON.stringify({ theme: newTheme }) });
  } catch(e) {}
}

// Add theme toggle button to navbar
function addThemeToggle() {
  const nav = document.querySelector('.navbar') || document.querySelector('nav') || document.querySelector('header');
  if (!nav) return;
  const existing = document.getElementById('theme-toggle-btn');
  if (existing) return;
  const btn = document.createElement('button');
  btn.id = 'theme-toggle-btn';
  btn.onclick = toggleTheme;
  btn.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;padding:6px 14px;border-radius:20px;cursor:pointer;font-size:13px;font-weight:500';
  btn.textContent = currentTheme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
  nav.appendChild(btn);
}

// ════════════════════════════════════════════════════
// FEATURE 6 — RECYCLE BIN
// ════════════════════════════════════════════════════
async function openRecycleBin() {
  try {
    const d = await phase1api('/phase1/recycle');
    const files = d.files || [];

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const rows = files.length === 0
      ? '<tr><td colspan="4" style="text-align:center;padding:28px;color:#6b7280">♻️ Recycle bin is empty</td></tr>'
      : files.map(f => `
          <tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:10px;font-size:13px;font-weight:500">${f.originalName}</td>
            <td style="padding:10px;font-size:12px;color:#6b7280">${f.deleteReason || 'Manually deleted'}</td>
            <td style="padding:10px;font-size:12px;color:#6b7280">${f.deletedAt ? new Date(f.deletedAt).toLocaleDateString() : '-'}</td>
            <td style="padding:10px">
              <button onclick="restoreFile('${f.fileId}','${f.originalName.replace(/'/g,"\\'")}',this)" 
                style="background:#10b981;color:white;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;margin-right:4px">↩ Restore</button>
              <button onclick="permDelete('${f.fileId}','${f.originalName.replace(/'/g,"\\'")}',this)" 
                style="background:#ef4444;color:white;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px">✕ Delete</button>
            </td>
          </tr>`).join('');

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:680px;width:100%;max-height:80vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;color:#1e1b4b">♻️ Recycle Bin (${files.length} files)</h3>
          <div style="display:flex;gap:8px;align-items:center">
            ${files.length > 0 ? `<button onclick="emptyBin()" style="background:#ef4444;color:white;border:none;padding:6px 14px;border-radius:8px;cursor:pointer;font-size:13px">🗑 Empty All</button>` : ''}
            <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f9fafb">
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">File</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Reason</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Deleted</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Actions</th>
          </tr></thead>
          <tbody id="recycle-tbody">${rows}</tbody>
        </table>
      </div>`;
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { alert('Error: ' + e.message); }
}

async function restoreFile(fileId, fileName, btn) {
  btn.disabled = true; btn.textContent = '...';
  const d = await phase1api('/phase1/recycle/' + fileId + '/restore', { method: 'POST' });
  if (d.success) {
    btn.closest('tr').remove();
    if (typeof toast === 'function') toast('ok', '↩ ' + fileName + ' restored!');
  }
}

async function permDelete(fileId, fileName, btn) {
  if (!confirm('Permanently delete "' + fileName + '"? This cannot be undone!')) return;
  btn.disabled = true;
  await phase1api('/phase1/recycle/' + fileId, { method: 'DELETE' });
  btn.closest('tr').remove();
  if (typeof toast === 'function') toast('ok', '🗑 Permanently deleted');
}

async function emptyBin() {
  if (!confirm('Empty entire recycle bin? All files will be permanently deleted!')) return;
  const d = await phase1api('/phase1/recycle', { method: 'DELETE' });
  document.getElementById('recycle-tbody').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:28px;color:#6b7280">♻️ Recycle bin is empty</td></tr>';
  if (typeof toast === 'function') toast('ok', '🗑 Recycle bin emptied (' + (d.count || 0) + ' files)');
}

// ════════════════════════════════════════════════════
// FEATURE 7 — FILE TAGS
// ════════════════════════════════════════════════════
async function openTagManager(fileId, fileName) {
  try {
    const d = await phase1api('/phase1/tags/' + fileId);
    const tags = d.tags || [];

    const modal = document.createElement('div');
    modal.id = 'tag-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const tagChips = tags.map(t =>
      `<span style="display:inline-flex;align-items:center;gap:4px;background:${t.color}22;color:${t.color};border:1px solid ${t.color}44;padding:3px 10px;border-radius:50px;font-size:12px;font-weight:600">
        ${t.tag}
        <button onclick="removeTag('${fileId}','${t.tag}',this)" style="background:none;border:none;color:${t.color};cursor:pointer;font-size:14px;padding:0;line-height:1">×</button>
      </span>`
    ).join('');

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:420px;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;color:#1e1b4b;font-size:16px">🏷️ Tags — ${fileName}</h3>
          <button onclick="document.getElementById('tag-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
        </div>
        <div id="tag-chips" style="display:flex;flex-wrap:wrap;gap:6px;min-height:32px;margin-bottom:16px">${tagChips || '<span style="color:#9ca3af;font-size:13px">No tags yet</span>'}</div>
        <div style="display:flex;gap:8px">
          <input id="new-tag-input" type="text" placeholder="Add tag..." maxlength="30"
            style="flex:1;padding:8px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px"
            onkeypress="if(event.key==='Enter') addTag('${fileId}')">
          <button onclick="addTag('${fileId}')"
            style="background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:14px">Add</button>
        </div>
        <div style="margin-top:12px">
          <p style="font-size:11px;color:#9ca3af;margin:0">Popular tags: 
            ${['work','personal','important','secret','backup','shared'].map(t =>
              `<button onclick="document.getElementById('new-tag-input').value='${t}'" 
                style="background:#f3f4f6;border:none;padding:2px 8px;border-radius:10px;cursor:pointer;font-size:11px;margin:2px">${t}</button>`
            ).join('')}
          </p>
        </div>
      </div>`;
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { alert('Error: ' + e.message); }
}

async function addTag(fileId) {
  const input = document.getElementById('new-tag-input');
  const tag = input.value.trim();
  if (!tag) return;

  const d = await phase1api('/phase1/tags/' + fileId, {
    method: 'POST',
    body: JSON.stringify({ tag })
  });

  if (d.success) {
    input.value = '';
    const chips = document.getElementById('tag-chips');
    chips.innerHTML += `<span style="display:inline-flex;align-items:center;gap:4px;background:${d.color}22;color:${d.color};border:1px solid ${d.color}44;padding:3px 10px;border-radius:50px;font-size:12px;font-weight:600">
      ${d.tag}
      <button onclick="removeTag('${fileId}','${d.tag}',this)" style="background:none;border:none;color:${d.color};cursor:pointer;font-size:14px;padding:0;line-height:1">×</button>
    </span>`;
    if (typeof toast === 'function') toast('ok', '🏷️ Tag "' + tag + '" added!');
  } else {
    alert(d.error || 'Failed to add tag');
  }
}

async function removeTag(fileId, tag, btn) {
  await phase1api('/phase1/tags/' + fileId + '/' + encodeURIComponent(tag), { method: 'DELETE' });
  btn.closest('span').remove();
}

// ════════════════════════════════════════════════════
// FEATURE 9 — ACCESS LOGS PER FILE
// ════════════════════════════════════════════════════
async function viewAccessLogs(fileId, fileName) {
  try {
    const d = await phase1api('/phase1/access-logs/' + fileId);
    const logs = d.logs || [];
    const stats = d.stats || {};

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const statCards = [
      { icon:'👁', label:'Total Access', val: stats.totalAccess||0, color:'#4f46e5' },
      { icon:'⬇', label:'Downloads', val: stats.downloads||0, color:'#10b981' },
      { icon:'👤', label:'Unique Users', val: stats.uniqueUsers||0, color:'#f59e0b' },
    ].map(s => `<div style="background:${s.color}11;border:1px solid ${s.color}33;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:20px">${s.icon}</div>
      <div style="font-size:22px;font-weight:800;color:${s.color}">${s.val}</div>
      <div style="font-size:11px;color:#6b7280">${s.label}</div>
    </div>`).join('');

    const logRows = logs.length === 0
      ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:#6b7280">No access logs yet</td></tr>'
      : logs.map(l => `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:8px;font-size:12px">
            <span style="background:${l.action==='DOWNLOAD'?'#ecfdf5':'#eff6ff'};color:${l.action==='DOWNLOAD'?'#065f46':'#1e40af'};padding:2px 8px;border-radius:50px;font-size:11px;font-weight:600">${l.action}</span>
          </td>
          <td style="padding:8px;font-size:12px">${l.userName || 'Unknown'}</td>
          <td style="padding:8px;font-size:12px;color:#6b7280">${l.ip || '-'}</td>
          <td style="padding:8px;font-size:12px;color:#6b7280">${new Date(l.createdAt).toLocaleString()}</td>
        </tr>`).join('');

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:620px;width:100%;max-height:80vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;color:#1e1b4b;font-size:16px">📊 Access Logs — ${fileName}</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">${statCards}</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f9fafb">
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Action</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">User</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">IP</th>
            <th style="padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Time</th>
          </tr></thead>
          <tbody>${logRows}</tbody>
        </table>
      </div>`;
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { alert('Error: ' + e.message); }
}

// ════════════════════════════════════════════════════
// FEATURE 10 — ENCRYPTION PERFORMANCE
// ════════════════════════════════════════════════════
async function showEncryptionPerf() {
  try {
    const d = await phase1api('/phase1/perf');
    const stats = d.stats || [];
    const avg = d.avg || {};

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const algoCards = [
      { name:'AES-256-CBC', time: avg.aes, color:'#4f46e5', icon:'🔐' },
      { name:'Triple-DES',  time: avg.des, color:'#10b981', icon:'🔑' },
      { name:'Blowfish',    time: avg.blowfish, color:'#f59e0b', icon:'🐡' },
      { name:'LSB Stego',   time: avg.stego, color:'#8b5cf6', icon:'🖼' },
    ].map(a => `
      <div style="background:${a.color}11;border:1px solid ${a.color}33;border-radius:10px;padding:14px;text-align:center">
        <div style="font-size:24px">${a.icon}</div>
        <div style="font-size:13px;font-weight:700;color:#1e1b4b;margin:4px 0">${a.name}</div>
        <div style="font-size:22px;font-weight:800;color:${a.color}">${a.time || '0'}ms</div>
        <div style="font-size:10px;color:#9ca3af">avg time</div>
        <div style="background:#e5e7eb;border-radius:50px;height:4px;margin-top:8px">
          <div style="background:${a.color};border-radius:50px;height:4px;width:${Math.min(100,(a.time/50)*100)}%"></div>
        </div>
      </div>`).join('');

    const rows = stats.slice(0,10).map(s => `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px;font-size:12px;font-weight:500">${s.fileName || 'Unknown'}</td>
        <td style="padding:8px;font-size:12px;color:#4f46e5">${s.aesTimeMs}ms</td>
        <td style="padding:8px;font-size:12px;color:#10b981">${s.desTimeMs}ms</td>
        <td style="padding:8px;font-size:12px;color:#f59e0b">${s.blowfishTimeMs}ms</td>
        <td style="padding:8px;font-size:12px;color:#8b5cf6">${s.stegoTimeMs}ms</td>
        <td style="padding:8px;font-size:12px;font-weight:700;color:#ef4444">${s.totalTimeMs}ms</td>
      </tr>`).join('');

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:680px;width:100%;max-height:80vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="margin:0;color:#1e1b4b">⚡ Encryption Performance</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:20px;cursor:pointer">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">${algoCards}</div>
        ${stats.length > 0 ? `
        <h4 style="margin:0 0 10px;color:#374151;font-size:13px">Recent Encryptions</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:#f9fafb">
            <th style="padding:8px;text-align:left;color:#6b7280">File</th>
            <th style="padding:8px;text-align:left;color:#4f46e5">AES</th>
            <th style="padding:8px;text-align:left;color:#10b981">3DES</th>
            <th style="padding:8px;text-align:left;color:#f59e0b">Blowfish</th>
            <th style="padding:8px;text-align:left;color:#8b5cf6">Stego</th>
            <th style="padding:8px;text-align:left;color:#ef4444">Total</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>` : '<p style="text-align:center;color:#9ca3af">Upload a file to see performance stats</p>'}
      </div>`;
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { alert('Error: ' + e.message); }
}

// ════════════════════════════════════════════════════
// FEATURE 11 — CHATBOT MEMORY
// ════════════════════════════════════════════════════
async function loadChatHistory() {
  try {
    const d = await phase1api('/phase1/chat-memory?limit=20');
    return d.history || [];
  } catch(e) { return []; }
}

async function saveChatMessage(role, content) {
  try {
    await phase1api('/phase1/chat-memory', {
      method: 'POST',
      body: JSON.stringify({ role, content })
    });
  } catch(e) {}
}

async function clearChatMemory() {
  if (!confirm('Clear all chat history?')) return;
  await phase1api('/phase1/chat-memory', { method: 'DELETE' });
  if (typeof toast === 'function') toast('ok', '🗑 Chat history cleared');
}

// ════════════════════════════════════════════════════
// PHASE 1 FLOATING ACTION BUTTONS (FAB Menu)
// Adds quick-access buttons for all Phase 1 features
// ════════════════════════════════════════════════════
function addPhase1FAB() {
  const fab = document.createElement('div');
  fab.id = 'phase1-fab';
  fab.style.cssText = 'position:fixed;bottom:100px;right:28px;z-index:8000;display:flex;flex-direction:column;align-items:flex-end;gap:8px';

  fab.innerHTML = `
    <div id="phase1-menu" style="display:none;flex-direction:column;gap:6px;align-items:flex-end;margin-bottom:4px">
      <button onclick="openRecycleBin()" 
        style="background:white;border:1px solid #e5e7eb;padding:7px 14px;border-radius:50px;cursor:pointer;font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.1);white-space:nowrap">
        ♻️ Recycle Bin</button>
      <button onclick="viewHoneypotAlerts()" 
        style="background:white;border:1px solid #e5e7eb;padding:7px 14px;border-radius:50px;cursor:pointer;font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.1);white-space:nowrap">
        🍯 Honeypot Alerts</button>
      <button onclick="createHoneypot()" 
        style="background:white;border:1px solid #e5e7eb;padding:7px 14px;border-radius:50px;cursor:pointer;font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.1);white-space:nowrap">
        🍯 Create Honeypot</button>
      <button onclick="showEncryptionPerf()" 
        style="background:white;border:1px solid #e5e7eb;padding:7px 14px;border-radius:50px;cursor:pointer;font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.1);white-space:nowrap">
        ⚡ Encryption Stats</button>
      <button onclick="toggleTheme()" 
        style="background:white;border:1px solid #e5e7eb;padding:7px 14px;border-radius:50px;cursor:pointer;font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.1);white-space:nowrap">
        🌙 Toggle Theme</button>
    </div>
    <button onclick="document.getElementById('phase1-menu').style.display=document.getElementById('phase1-menu').style.display==='none'?'flex':'none'"
      style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#10b981,#059669);border:none;color:white;font-size:20px;cursor:pointer;box-shadow:0 4px 16px rgba(16,185,129,0.4)">⚙️</button>
  `;

  document.body.appendChild(fab);
}

// ════════════════════════════════════════════════════
// AUTO-INIT — runs when page loads
// ════════════════════════════════════════════════════
window.addEventListener('load', function() {
  // Apply saved theme
  const savedTheme = localStorage.getItem('sv_theme') || 'dark';
  applyTheme(savedTheme);

  // Add floating action buttons
  setTimeout(addPhase1FAB, 1000);

  // Add theme toggle to navbar
  setTimeout(addThemeToggle, 500);
});