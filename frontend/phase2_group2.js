// ═══════════════════════════════════════════════════════
// SECUREVAULT PHASE 2 GROUP 2 — FRONTEND
// File: C:\Projects\securevault\frontend\phase2_group2.js
// Add just before </body> in index.html:
// <script src="phase2_group2.js"></script>
// ═══════════════════════════════════════════════════════

async function p2g2api(path, opts = {}) {
  const token = localStorage.getItem('sv_token');
  const res = await fetch('http://13.232.118.157:3000/api/v1' + path, {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(opts.headers||{}) },
    ...opts
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
  return d;
}

function fmtB(b) {
  if (!b) return '0 B';
  const k=1024, s=['B','KB','MB','GB'];
  const i=Math.floor(Math.log(b)/Math.log(k));
  return +(b/Math.pow(k,i)).toFixed(1)+' '+s[i];
}

// ════════════════════════════════════════════════════
// FEATURE 17 — AI FILE SCANNER
// ════════════════════════════════════════════════════
async function scanFile(fileId, fileName) {
  try {
    if (typeof toast === 'function') toast('info', '🤖 AI scanning ' + fileName + '...');
    const d = await p2g2api('/scanner/scan/' + fileId + '?force=true', { method: 'POST' });
    showScanResult(d);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

function showScanResult(data) {
  const riskColors = {
    low:      { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', badge: '#10b981' },
    medium:   { bg: '#fffbeb', border: '#fde68a', text: '#92400e', badge: '#f59e0b' },
    high:     { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', badge: '#ef4444' },
    critical: { bg: '#fef2f2', border: '#fca5a5', text: '#7f1d1d', badge: '#dc2626' }
  };
  const c = riskColors[data.riskLevel] || riskColors.low;
  const riskIcons = { low: '🟢', medium: '🟡', high: '🔴', critical: '🚨' };

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

  const findings = data.findings || [];
  const findingRows = findings.length === 0
    ? '<div style="text-align:center;padding:16px;color:#9ca3af;font-size:13px">✅ No sensitive data patterns found</div>'
    : findings.map(f => `
        <div style="padding:10px 12px;background:#f9fafb;border-radius:8px;border-left:3px solid ${f.severity==='critical'?'#dc2626':f.severity==='high'?'#f59e0b':'#10b981'};margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:13px;font-weight:600;color:#1e1b4b">${f.type}</span>
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:50px;background:${f.severity==='critical'?'#fef2f2':f.severity==='high'?'#fffbeb':'#ecfdf5'};color:${f.severity==='critical'?'#dc2626':f.severity==='high'?'#92400e':'#065f46'}">${(f.severity||'').toUpperCase()}</span>
          </div>
          <div style="font-size:12px;color:#6b7280">${f.description || ''}</div>
          ${f.recommendation ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px">💡 ${f.recommendation}</div>` : ''}
        </div>`).join('');

  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h3 style="margin:0;color:#1e1b4b">🤖 AI Security Scan</h3>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
      </div>
      <div style="background:${c.bg};border:1px solid ${c.border};border-radius:12px;padding:18px;margin-bottom:20px;text-align:center">
        <div style="font-size:40px;margin-bottom:8px">${riskIcons[data.riskLevel] || '🟢'}</div>
        <div style="font-size:13px;color:${c.text};font-weight:600;margin-bottom:6px">${data.fileName || 'File'}</div>
        <div style="font-size:28px;font-weight:800;color:${c.badge}">${data.riskScore || 0}/100</div>
        <div style="font-size:12px;color:${c.text};margin-top:4px">Risk Score — ${(data.riskLevel||'').toUpperCase()}</div>
        <div style="background:#e5e7eb;border-radius:50px;height:8px;margin-top:10px">
          <div style="background:${c.badge};border-radius:50px;height:8px;width:${data.riskScore||0}%;transition:width 1s"></div>
        </div>
      </div>
      ${data.summary ? `<div style="font-size:13px;color:#374151;margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:8px">${data.summary}</div>` : ''}
      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Findings (${findings.length})</div>
        ${findingRows}
      </div>
      ${data.sensitiveDataTypes?.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Detected Data Types</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${data.sensitiveDataTypes.map(t => `<span style="background:#fef2f2;color:#dc2626;padding:3px 10px;border-radius:50px;font-size:11px;font-weight:600">${t}</span>`).join('')}
          </div>
        </div>` : ''}
      <div style="font-size:11px;color:#9ca3af;margin-bottom:16px">${data.aiPowered ? '🤖 Powered by Groq AI (Llama 3.3)' : '⚙️ Pattern-based scan'} · Scanned ${new Date(data.scannedAt||Date.now()).toLocaleString()}</div>
      <button onclick="this.closest('[style*=fixed]').remove()" 
        style="width:100%;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer">Close</button>
    </div>`;
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  document.body.appendChild(modal);
}

async function scanAllFiles() {
  try {
    if (typeof toast === 'function') toast('info', '🤖 Scanning all files...');
    const d = await p2g2api('/scanner/scan-all', { method: 'POST' });
    if (typeof toast === 'function') toast(d.critical > 0 ? 'err' : 'ok',
      `Scanned ${d.scanned} files — ${d.critical} critical, ${d.high} high risk`);
    showAllScanResults(d);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

function showAllScanResults(data) {
  const results = data.results || [];
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
  const riskIcon = { low:'🟢', medium:'🟡', high:'🔴', critical:'🚨' };

  const rows = results.map(r => `
    <tr style="border-bottom:1px solid #f3f4f6">
      <td style="padding:10px;font-size:13px;font-weight:500">${r.fileName}</td>
      <td style="padding:10px">
        <span style="background:${r.riskLevel==='critical'?'#fef2f2':r.riskLevel==='high'?'#fff7ed':r.riskLevel==='medium'?'#fffbeb':'#ecfdf5'};color:${r.riskLevel==='critical'?'#dc2626':r.riskLevel==='high'?'#c2410c':r.riskLevel==='medium'?'#92400e':'#065f46'};padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700">${riskIcon[r.riskLevel]} ${(r.riskLevel||'').toUpperCase()}</span>
      </td>
      <td style="padding:10px;font-size:13px;font-weight:700;color:#4f46e5">${r.riskScore}/100</td>
      <td style="padding:10px;font-size:12px;color:#6b7280">${r.findings?.length || 0} findings</td>
    </tr>`).join('');

  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h3 style="margin:0;color:#1e1b4b">🤖 Full Vault Scan Results</h3>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
        ${[['📁','Scanned',data.scanned,'#4f46e5'],['🚨','Critical',data.critical,'#dc2626'],['🔴','High',data.high,'#f59e0b'],['✅','Safe',data.scanned-(data.critical||0)-(data.high||0),'#10b981']].map(([icon,label,val,color]) =>
          `<div style="background:${color}11;border:1px solid ${color}33;border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:20px">${icon}</div>
            <div style="font-size:22px;font-weight:800;color:${color}">${val}</div>
            <div style="font-size:11px;color:#6b7280">${label}</div>
          </div>`).join('')}
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:#f9fafb">
          <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">File</th>
          <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Risk</th>
          <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Score</th>
          <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Findings</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button onclick="this.closest('[style*=fixed]').remove()" 
        style="width:100%;margin-top:16px;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer">Close</button>
    </div>`;
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  document.body.appendChild(modal);
}

// ════════════════════════════════════════════════════
// FEATURE 18 — AI RISK SCORE
// ════════════════════════════════════════════════════
async function showRiskScore() {
  try {
    if (typeof toast === 'function') toast('info', '🤖 Calculating risk score...');
    const d = await p2g2api('/analytics/risk-score');

    const riskColors = {
      low:      { bg: '#ecfdf5', border: '#a7f3d0', color: '#10b981' },
      medium:   { bg: '#fffbeb', border: '#fde68a', color: '#f59e0b' },
      high:     { bg: '#fff7ed', border: '#fed7aa', color: '#f97316' },
      critical: { bg: '#fef2f2', border: '#fecaca', color: '#ef4444' }
    };
    const c = riskColors[d.riskLevel] || riskColors.low;
    const riskIcons = { low:'✅', medium:'⚠️', high:'🔴', critical:'🚨' };

    const factors = d.factors || [];
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const factorRows = factors.map(f => `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f9fafb;border-radius:8px;margin-bottom:6px;border-left:3px solid ${f.severity==='positive'?'#10b981':f.severity==='critical'?'#dc2626':f.severity==='high'?'#f59e0b':'#6b7280'}">
        <span style="font-size:18px">${f.severity==='positive'?'✅':f.severity==='critical'?'🚨':f.severity==='high'?'⚠️':'ℹ️'}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:#1e1b4b">${f.factor}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">${f.detail}</div>
        </div>
        <span style="font-size:13px;font-weight:800;color:${f.score<0?'#10b981':'#ef4444'}">${f.score>0?'+':''}${f.score}</span>
      </div>`).join('');

    const stats = d.stats || {};
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:85vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="margin:0;color:#1e1b4b">🎯 AI Risk Score</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="background:${c.bg};border:1px solid ${c.border};border-radius:12px;padding:20px;text-align:center;margin-bottom:20px">
          <div style="font-size:48px;margin-bottom:8px">${riskIcons[d.riskLevel]||'✅'}</div>
          <div style="font-size:48px;font-weight:800;color:${c.color};font-family:monospace">${d.riskScore}/100</div>
          <div style="font-size:14px;color:${c.color};font-weight:600;text-transform:uppercase;letter-spacing:1px">${d.riskLevel} RISK</div>
          <div style="background:#e5e7eb;border-radius:50px;height:10px;margin-top:12px">
            <div style="background:${c.color};border-radius:50px;height:10px;width:${d.riskScore}%;transition:width 1s"></div>
          </div>
        </div>
        <div style="background:#f8faff;border-radius:10px;padding:14px;margin-bottom:16px;font-size:13px;color:#374151;line-height:1.5">${d.message}</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
          ${[['🔑','Logins',stats.logins||0],['❌','Failed',stats.failedLogins||0],['📁','Files',stats.files||0],['📤','Shared',stats.shares||0],['⬇','Downloads',stats.downloads||0],['🗑','Deleted',stats.deletions||0]].map(([icon,label,val])=>
            `<div style="background:#f9fafb;border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:16px">${icon}</div>
              <div style="font-size:18px;font-weight:800;color:#1e1b4b">${val}</div>
              <div style="font-size:10px;color:#9ca3af">${label}</div>
            </div>`).join('')}
        </div>
        ${factors.length ? `
          <div style="margin-bottom:16px">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase">Risk Factors</div>
            ${factorRows}
          </div>` : ''}
        <button onclick="this.closest('[style*=fixed]').remove()" 
          style="width:100%;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer">Close</button>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

// ════════════════════════════════════════════════════
// FEATURE 19 — REAL-TIME DASHBOARD
// ════════════════════════════════════════════════════
let sseConnection = null;
let realtimeActive = false;

function startRealtime() {
  const token = localStorage.getItem('sv_token');
  if (!token || realtimeActive) return;

  try {
    sseConnection = new EventSource('http://13.232.118.157:3000/api/v1/analytics/realtime?token=' + token);

    sseConnection.onopen = () => {
      realtimeActive = true;
      updateRealtimeIndicator(true);
      if (typeof toast === 'function') toast('ok', '🔴 Real-time updates connected!');
    };

    sseConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleRealtimeEvent(data);
      } catch(e) {}
    };

    sseConnection.onerror = () => {
      realtimeActive = false;
      updateRealtimeIndicator(false);
    };
  } catch(e) {}
}

function stopRealtime() {
  if (sseConnection) {
    sseConnection.close();
    sseConnection = null;
  }
  realtimeActive = false;
  updateRealtimeIndicator(false);
}

function handleRealtimeEvent(data) {
  if (data.type === 'heartbeat') return;
  if (data.type === 'connected') return;

  // Show notification for important events
  const eventMessages = {
    FILE_UPLOADED:   '⬆ New file uploaded',
    FILE_DOWNLOADED: '⬇ File downloaded',
    FILE_SHARED:     '📤 File shared',
    SHARE_ACCEPTED:  '✅ Share accepted',
    FILE_DELETED:    '🗑 File deleted',
    LOGIN_ALERT:     '🔐 New login detected',
    HONEYPOT_TRIGGERED: '🍯 Honeypot triggered!'
  };

  const msg = eventMessages[data.type] || data.message || data.type;
  if (typeof toast === 'function') toast('info', msg);

  // Update live stats if on dashboard
  const dashSection = document.getElementById('section-dashboard');
  if (dashSection?.classList.contains('active')) {
    setTimeout(() => { if (typeof loadDashboard === 'function') loadDashboard(); }, 500);
  }
}

function updateRealtimeIndicator(active) {
  let indicator = document.getElementById('realtime-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'realtime-indicator';
    indicator.style.cssText = 'position:fixed;top:72px;left:50%;transform:translateX(-50%);z-index:500;padding:6px 16px;border-radius:50px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1)';
    document.body.appendChild(indicator);
    setTimeout(() => { if(indicator) indicator.style.display = 'none'; }, 3000);
  }
  if (active) {
    indicator.style.background = '#ecfdf5';
    indicator.style.border = '1px solid #a7f3d0';
    indicator.style.color = '#065f46';
    indicator.style.display = 'flex';
    indicator.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:#10b981;animation:pulse 1s infinite"></span> Real-time Active';
  } else {
    indicator.style.display = 'none';
  }
}

async function showLiveStats() {
  try {
    const d = await p2g2api('/analytics/live-stats');
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:440px;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="margin:0;color:#1e1b4b">🔴 Live Stats</h3>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${realtimeActive?'#10b981':'#9ca3af'}"></span>
            <span style="font-size:12px;color:${realtimeActive?'#10b981':'#9ca3af'}">${realtimeActive?'Connected':'Disconnected'}</span>
          </div>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
          ${[
            ['📁','Total Files',d.files,'#4f46e5'],
            ['💾','Storage',fmtB(d.storage),'#06b6d4'],
            ['📤','Shares Sent',d.shared,'#10b981'],
            ['📥','Pending',d.pendingReceived,'#f59e0b'],
            ['⚡','Today Activity',d.todayActivity,'#8b5cf6'],
          ].map(([icon,label,val,color]) => `
            <div style="background:${color}11;border:1px solid ${color}33;border-radius:10px;padding:16px;text-align:center">
              <div style="font-size:24px">${icon}</div>
              <div style="font-size:24px;font-weight:800;color:${color}">${val}</div>
              <div style="font-size:11px;color:#6b7280">${label}</div>
            </div>`).join('')}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="${realtimeActive?'stopRealtime':'startRealtime'}();this.closest('[style*=fixed]').remove()" 
            style="flex:1;padding:10px;background:${realtimeActive?'#fef2f2':'#ecfdf5'};color:${realtimeActive?'#dc2626':'#065f46'};border:1px solid ${realtimeActive?'#fecaca':'#a7f3d0'};border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
            ${realtimeActive?'⏹ Stop Real-time':'▶ Start Real-time'}
          </button>
          <button onclick="this.closest('[style*=fixed]').remove()" 
            style="flex:1;padding:10px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Close</button>
        </div>
        <div style="text-align:center;font-size:11px;color:#9ca3af;margin-top:10px">Last updated: ${new Date(d.timestamp).toLocaleTimeString()}</div>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

// ════════════════════════════════════════════════════
// FEATURE 20 — SECURITY SCORE
// ════════════════════════════════════════════════════
async function showSecurityScore() {
  try {
    if (typeof toast === 'function') toast('info', '🛡 Calculating security score...');
    const d = await p2g2api('/analytics/security-score');

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const checks = d.checks || [];
    const checkRows = checks.map(c => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:8px">
        <span style="font-size:20px;flex-shrink:0">${c.icon}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:#1e1b4b">${c.name}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">${c.tip}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:16px;font-weight:800;color:${c.passed?'#10b981':'#9ca3af'}">${c.points}/${c.maxPoints}</div>
          <div style="font-size:10px;color:#9ca3af">pts</div>
        </div>
      </div>`).join('');

    const gradeColors = { 'A+':'#10b981','A':'#10b981','B':'#06b6d4','C':'#f59e0b','D':'#f97316','F':'#ef4444' };
    const gradeColor  = gradeColors[d.grade] || '#ef4444';

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:500px;width:100%;max-height:85vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="margin:0;color:#1e1b4b">🛡 Security Score</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="background:linear-gradient(135deg,#1e1b4b,#4f46e5);border-radius:14px;padding:24px;color:white;text-align:center;margin-bottom:20px;position:relative;overflow:hidden">
          <div style="font-size:64px;font-weight:900;font-family:monospace;color:${gradeColor}">${d.grade}</div>
          <div style="font-size:32px;font-weight:800;margin:4px 0">${d.totalScore}/${d.maxScore}</div>
          <div style="font-size:13px;opacity:0.8">${d.percentage}% Security Score</div>
          <div style="background:rgba(255,255,255,0.15);border-radius:50px;height:8px;margin-top:12px">
            <div style="background:${gradeColor};border-radius:50px;height:8px;width:${d.percentage}%;transition:width 1.5s"></div>
          </div>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;font-size:13px;color:#166534;margin-bottom:16px">${d.message}</div>
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Security Checklist</div>
          ${checkRows}
        </div>
        ${d.nextSteps?.length ? `
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:16px">
            <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px">💡 Next Steps to Improve</div>
            ${d.nextSteps.map(s => `<div style="font-size:12px;color:#92400e;margin-bottom:4px">• ${s}</div>`).join('')}
          </div>` : ''}
        <button onclick="this.closest('[style*=fixed]').remove()" 
          style="width:100%;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer">Close</button>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

// ════════════════════════════════════════════════════
// FEATURE 21 — GEOGRAPHIC ACCESS MAP
// ════════════════════════════════════════════════════
async function showAccessMap() {
  try {
    const d = await p2g2api('/geo/map');
    const locations  = d.locations  || [];
    const countries  = d.countrySummary || {};
    const timeline   = d.timeline   || [];

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const countryRows = Object.entries(countries).map(([country, count]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f9fafb;border-radius:8px;margin-bottom:4px">
        <span style="font-size:13px;font-weight:500">🌍 ${country}</span>
        <span style="font-size:12px;font-weight:700;color:#4f46e5;background:#f0f4ff;padding:2px 10px;border-radius:50px">${count} accesses</span>
      </div>`).join('');

    const timelineRows = timeline.slice(0,8).map(l => `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px;font-size:12px;font-weight:500">${l.country}, ${l.city}</td>
        <td style="padding:8px;font-size:12px;color:#6b7280;font-family:monospace">${l.ip}</td>
        <td style="padding:8px"><span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:50px;font-size:11px;font-weight:600">${l.event}</span></td>
        <td style="padding:8px;font-size:11px;color:#9ca3af">${new Date(l.createdAt).toLocaleDateString()}</td>
      </tr>`).join('');

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:580px;width:100%;max-height:85vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="margin:0;color:#1e1b4b">🗺️ Geographic Access Map</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:800;color:#1d4ed8">${d.totalCountries}</div>
            <div style="font-size:12px;color:#6b7280">Countries</div>
          </div>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:800;color:#16a34a">${d.totalAccesses}</div>
            <div style="font-size:12px;color:#6b7280">Total Accesses</div>
          </div>
        </div>

        <!-- World map visual using SVG dots -->
        <div style="background:linear-gradient(135deg,#0f172a,#1e1b4b);border-radius:12px;padding:16px;margin-bottom:20px;position:relative;height:140px;overflow:hidden">
          <div style="color:rgba(255,255,255,0.3);font-size:11px;margin-bottom:8px">🌍 Access Locations</div>
          ${locations.slice(0,8).map((l,i) => {
            const x = ((l.longitude + 180) / 360 * 100);
            const y = ((90 - l.latitude) / 180 * 100);
            return `<div style="position:absolute;left:${x}%;top:${y}%;width:8px;height:8px;border-radius:50%;background:#06b6d4;box-shadow:0 0 8px #06b6d4;animation:pulse 2s infinite ${i*0.3}s" title="${l.city}, ${l.country}"></div>`;
          }).join('')}
          <div style="position:absolute;bottom:10px;right:12px;font-size:10px;color:rgba(255,255,255,0.3)">${locations.length} locations tracked</div>
        </div>

        ${countryRows ? `
          <div style="margin-bottom:20px">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase">Countries</div>
            ${countryRows || '<div style="text-align:center;color:#9ca3af;font-size:13px;padding:16px">No location data yet — log in a few times to see your access map</div>'}
          </div>` : ''}

        ${timeline.length ? `
          <div style="margin-bottom:16px">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px;text-transform:uppercase">Recent Access Timeline</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead><tr style="background:#f9fafb">
                <th style="padding:8px;text-align:left;color:#6b7280">Location</th>
                <th style="padding:8px;text-align:left;color:#6b7280">IP</th>
                <th style="padding:8px;text-align:left;color:#6b7280">Event</th>
                <th style="padding:8px;text-align:left;color:#6b7280">Date</th>
              </tr></thead>
              <tbody>${timelineRows}</tbody>
            </table>
          </div>` : ''}

        <div style="display:flex;gap:8px">
          <button onclick="logCurrentLocation()" style="flex:1;padding:10px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">📍 Log My Location</button>
          <button onclick="this.closest('[style*=fixed]').remove()" style="flex:1;padding:10px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Close</button>
        </div>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

async function logCurrentLocation() {
  try {
    await p2g2api('/geo/log-location', { method: 'POST', body: JSON.stringify({ event: 'MANUAL_LOG' }) });
    if (typeof toast === 'function') toast('ok', '📍 Location logged!');
  } catch(e) {}
}

// ════════════════════════════════════════════════════
// FEATURE 22 — USER ACTIVITY REPORT
// ════════════════════════════════════════════════════
async function showActivityReport(period) {
  period = period || 'weekly';
  try {
    if (typeof toast === 'function') toast('info', '📊 Generating ' + period + ' report...');
    const d = await p2g2api('/geo/report?period=' + period);

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const activityRows = (d.activity || []).map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f9fafb;border-radius:8px;margin-bottom:4px">
        <span style="font-size:12px;font-weight:600;color:#374151">${a.event}</span>
        <span style="font-size:14px;font-weight:800;color:#4f46e5">${a.count}×</span>
      </div>`).join('');

    const s = d.summary || {};
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:85vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <h3 style="margin:0;color:#1e1b4b">📊 Activity Report</h3>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;text-transform:capitalize">${period} · Last ${d.days} days</div>
          </div>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>

        <div style="background:linear-gradient(135deg,#4f46e5,#06b6d4);border-radius:14px;padding:20px;color:white;margin-bottom:20px">
          <div style="font-size:13px;opacity:0.8;margin-bottom:4px">Hello, ${d.user?.name || 'User'}</div>
          <div style="font-size:15px;font-weight:600">Here's your ${period} vault summary</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
          ${[
            ['📁','New Files',s.newFiles||0,'#4f46e5'],
            ['💾','Total Files',s.totalFiles||0,'#06b6d4'],
            ['📤','Files Sent',s.filesSent||0,'#10b981'],
            ['📥','Received',s.filesReceived||0,'#f59e0b'],
            ['⚡','Activities',s.totalActivity||0,'#8b5cf6'],
            ['💾','Storage',fmtB(s.totalStorage||0),'#ec4899'],
          ].map(([icon,label,val,color])=>`
            <div style="background:${color}11;border:1px solid ${color}33;border-radius:10px;padding:14px;text-align:center">
              <div style="font-size:20px">${icon}</div>
              <div style="font-size:22px;font-weight:800;color:${color}">${val}</div>
              <div style="font-size:11px;color:#6b7280">${label}</div>
            </div>`).join('')}
        </div>

        ${activityRows ? `
          <div style="margin-bottom:16px">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase">Activity Breakdown</div>
            ${activityRows}
          </div>` : ''}

        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:#065f46;margin-bottom:8px">🛡️ Security Highlights</div>
          ${(d.securityHighlights||[]).map(h => `<div style="font-size:12px;color:#065f46;margin-bottom:4px">• ${h}</div>`).join('')}
        </div>

        <div style="display:flex;gap:8px">
          <select id="report-period-select" style="padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;flex:1">
            <option value="daily" ${period==='daily'?'selected':''}>Daily</option>
            <option value="weekly" ${period==='weekly'?'selected':''}>Weekly</option>
            <option value="monthly" ${period==='monthly'?'selected':''}>Monthly</option>
          </select>
          <button onclick="sendReportEmail(document.getElementById('report-period-select').value)" 
            style="flex:1;padding:10px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">📧 Email Report</button>
          <button onclick="showActivityReport(document.getElementById('report-period-select').value);this.closest('[style*=fixed]').remove()"
            style="flex:1;padding:10px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">🔄 Refresh</button>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;margin-top:8px;padding:10px;background:#f3f4f6;border:none;border-radius:8px;cursor:pointer;font-size:13px">Close</button>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

async function sendReportEmail(period) {
  try {
    if (typeof toast === 'function') toast('info', '📧 Sending report email...');
    const d = await p2g2api('/geo/report/send', { method: 'POST', body: JSON.stringify({ period: period || 'weekly' }) });
    if (typeof toast === 'function') toast(d.success ? 'ok' : 'err', d.message);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

// ════════════════════════════════════════════════════
// ADD SIDEBAR ITEMS FOR GROUP 2 FEATURES
// ════════════════════════════════════════════════════
(function addGroup2Sidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) { setTimeout(addGroup2Sidebar, 500); return; }
  if (document.getElementById('sb-phase2-g2')) return;

  const sbBottom = sidebar.querySelector('.sb-bottom');
  const html = `
    <div id="sb-phase2-g2">
      <div class="sb-section">Analytics & AI</div>
      <div class="sb-item" onclick="scanAllFiles()"><span class="si">🤖</span>AI Scanner</div>
      <div class="sb-item" onclick="showRiskScore()"><span class="si">🎯</span>Risk Score</div>
      <div class="sb-item" onclick="showSecurityScore()"><span class="si">🛡</span>Security Score</div>
      <div class="sb-item" onclick="showLiveStats()"><span class="si">🔴</span>Live Stats</div>
      <div class="sb-item" onclick="showAccessMap()"><span class="si">🗺️</span>Access Map</div>
      <div class="sb-item" onclick="showActivityReport('weekly')"><span class="si">📊</span>Activity Report</div>
    </div>`;

  if (sbBottom) sbBottom.insertAdjacentHTML('beforebegin', html);
  else sidebar.insertAdjacentHTML('beforeend', html);
})();

// ════════════════════════════════════════════════════
// ADD SCAN BUTTON TO MY FILES TABLE
// ════════════════════════════════════════════════════
(function patchFilesForScanner() {
  const orig = window.renderMyFiles;
  if (typeof orig !== 'function') { setTimeout(patchFilesForScanner, 600); return; }

  window.renderMyFiles = function(files) {
    orig(files);
    const rows = document.querySelectorAll('#mf-tbl tr');
    rows.forEach((row, i) => {
      const file = files[i];
      if (!file) return;
      const actionCell = row.querySelector('td:last-child div');
      if (!actionCell) return;
      actionCell.insertAdjacentHTML('beforeend',
        `<button class="btn btn-ghost btn-xs" onclick="scanFile('${file.fileId}','${(file.originalName||'').replace(/'/g,"\\'")}')">🤖 Scan</button>`
      );
    });
  };
})();

// Auto-log location on page load
setTimeout(() => {
  p2g2api('/geo/log-location', { method: 'POST', body: JSON.stringify({ event: 'PAGE_VIEW' }) }).catch(() => {});
}, 2000);

// Auto-start real-time connection
setTimeout(() => { startRealtime(); }, 3000);

console.log('✅ Phase 2 Group 2 loaded: AI Scanner, Risk Score, Real-time, Security Score, Geo Map, Activity Report');