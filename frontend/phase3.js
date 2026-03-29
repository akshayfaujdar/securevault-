// ═══════════════════════════════════════════════════════
// SECUREVAULT PHASE 3 — FRONTEND
// File: C:\Projects\securevault\frontend\phase3.js
// Add just before </body> in index.html:
// <script src="phase3.js"></script>
// ═══════════════════════════════════════════════════════

async function p3api(path, opts = {}) {
  const token = localStorage.getItem('sv_token');
  const res = await fetch('http://13.201.28.4:3000/api/v1' + path, {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(opts.headers||{}) },
    ...opts
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
  return d;
}

// ════════════════════════════════════════════════════
// FEATURE 26 — ZERO-KNOWLEDGE PROOF
// ════════════════════════════════════════════════════
async function showZKPDemo() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h3 style="margin:0;color:#1e1b4b">🛡 Zero-Knowledge Proof</h3>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
      </div>
      <div style="background:linear-gradient(135deg,#1e1b4b,#4f46e5);border-radius:12px;padding:20px;color:white;margin-bottom:20px">
        <div style="font-size:13px;opacity:0.8;margin-bottom:8px">What is Zero-Knowledge Proof?</div>
        <div style="font-size:15px;font-weight:600;line-height:1.5">"Prove you know a secret without revealing the secret itself"</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
        ${[
          ['1️⃣','You enter a secret','Only you know it — never sent to server'],
          ['2️⃣','Browser generates commitment','hash(nonce) — mathematically hides secret'],
          ['3️⃣','Server sends challenge','Random number you cannot predict'],
          ['4️⃣','You compute response','Using secret + challenge — proves knowledge'],
          ['5️⃣','Server verifies','Math checks out — secret never transmitted!']
        ].map(([s,t,d])=>`
          <div style="display:flex;gap:12px;padding:12px;background:#f8faff;border-radius:10px;border:1px solid #e0e7ff">
            <span style="font-size:20px;flex-shrink:0">${s}</span>
            <div><div style="font-size:13px;font-weight:700;color:#1e1b4b">${t}</div><div style="font-size:11px;color:#6b7280;margin-top:2px">${d}</div></div>
          </div>`).join('')}
      </div>
      <div class="field" style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">Enter a secret to prove (not sent to server)</label>
        <input id="zkp-secret" type="password" placeholder="e.g. MySecretKey123" 
          style="width:100%;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box">
      </div>
      <div id="zkp-result" style="display:none;margin-bottom:16px"></div>
      <div style="display:flex;gap:8px">
        <button onclick="runZKPProof()" 
          style="flex:1;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">
          🔐 Run ZKP Demo
        </button>
        <button onclick="this.closest('[style*=fixed]').remove()" 
          style="padding:11px 20px;background:#f3f4f6;border:none;border-radius:8px;cursor:pointer;font-size:13px">Close</button>
      </div>
    </div>`;
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  document.body.appendChild(modal);
}

async function runZKPProof() {
  const secret = document.getElementById('zkp-secret')?.value;
  if (!secret) return alert('Enter a secret first!');
  const resultDiv = document.getElementById('zkp-result');
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<div style="text-align:center;padding:16px;color:#6b7280">⏳ Running Zero-Knowledge Proof...</div>';
  try {
    const d = await p3api('/zkp/prove', { method: 'POST', body: JSON.stringify({ secret, proofType: 'knowledge-demo' }) });
    resultDiv.innerHTML = `
      <div style="background:${d.valid?'#ecfdf5':'#fef2f2'};border:1px solid ${d.valid?'#a7f3d0':'#fecaca'};border-radius:12px;padding:16px">
        <div style="font-size:16px;font-weight:700;color:${d.valid?'#065f46':'#dc2626'};margin-bottom:12px">${d.message}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${Object.entries(d.explanation||{}).map(([k,v])=>`
            <div style="padding:8px 12px;background:white;border-radius:6px;font-size:12px">
              <span style="font-weight:700;color:#374151">${k.replace(/([A-Z])/g,' $1').trim()}:</span>
              <span style="color:#6b7280;margin-left:4px">${v}</span>
            </div>`).join('')}
        </div>
        ${d.proof ? `
          <div style="margin-top:10px;padding:10px;background:#f9fafb;border-radius:8px;font-family:monospace;font-size:10px;color:#374151">
            <div>Commitment: ${d.proof.commitment}</div>
            <div>Challenge:  ${d.proof.challenge}</div>
            <div>Response:   ${d.proof.response}</div>
          </div>` : ''}
      </div>`;
  } catch(e) {
    resultDiv.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px;color:#dc2626;font-size:13px">❌ ${e.message}</div>`;
  }
}

async function showZKPHistory() {
  try {
    const d = await p3api('/zkp/proofs');
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
    const rows = (d.proofs||[]).map(p => `
      <tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:10px;font-size:12px">${p.proofType}</td>
        <td style="padding:10px">${p.verified?'<span style="background:#ecfdf5;color:#065f46;padding:2px 8px;border-radius:50px;font-size:11px;font-weight:700">✅ Verified</span>':'<span style="background:#fffbeb;color:#92400e;padding:2px 8px;border-radius:50px;font-size:11px;font-weight:700">⏳ Pending</span>'}</td>
        <td style="padding:10px;font-size:11px;color:#9ca3af">${new Date(p.createdAt).toLocaleDateString()}</td>
      </tr>`).join('');
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:500px;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;color:#1e1b4b">🛡 ZKP History</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
          ${[['Total',d.stats?.total||0,'#4f46e5'],['Verified',d.stats?.verified||0,'#10b981'],['Pending',d.stats?.pending||0,'#f59e0b']].map(([l,v,c])=>`
            <div style="background:${c}11;border:1px solid ${c}33;border-radius:10px;padding:12px;text-align:center">
              <div style="font-size:24px;font-weight:800;color:${c}">${v}</div>
              <div style="font-size:11px;color:#6b7280">${l}</div>
            </div>`).join('')}
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f9fafb"><th style="padding:10px;text-align:left;font-size:11px;color:#6b7280">Type</th><th style="padding:10px;text-align:left;font-size:11px;color:#6b7280">Status</th><th style="padding:10px;text-align:left;font-size:11px;color:#6b7280">Date</th></tr></thead>
          <tbody>${rows||'<tr><td colspan="3" style="text-align:center;padding:20px;color:#9ca3af">No proofs yet</td></tr>'}</tbody>
        </table>
        <button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;margin-top:14px;padding:10px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Close</button>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

// ════════════════════════════════════════════════════
// FEATURE 27 — BLOCKCHAIN AUDIT TRAIL
// ════════════════════════════════════════════════════
async function showBlockchain() {
  try {
    if(typeof toast==='function') toast('info', '⛓️ Loading blockchain...');
    // Auto-init blockchain
    try { await p3api('/blockchain/init', { method: 'POST' }); } catch(e) {}
    const d = await p3api('/blockchain/chain?limit=10');
    const stats = await p3api('/blockchain/stats');

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px';

    const blocks = d.chain || [];
    const blockCards = blocks.slice(0,5).map((b,i)=>`
      <div style="position:relative;padding:14px;background:${i===0?'linear-gradient(135deg,#4f46e5,#6366f1)':'#f9fafb'};border-radius:10px;border:1px solid ${i===0?'transparent':'#e5e7eb'};color:${i===0?'white':'#1e1b4b'}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:11px;font-weight:700;opacity:0.7">Block #${b.blockIndex}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:50px;background:${i===0?'rgba(255,255,255,0.2)':'#eff6ff'};color:${i===0?'white':'#1d4ed8'}">${b.eventType}</span>
        </div>
        <div style="font-family:monospace;font-size:10px;opacity:0.8;margin-bottom:4px">Hash: ${b.hashPreview}</div>
        <div style="font-family:monospace;font-size:10px;opacity:0.6">Prev: ${b.prevHashPreview}</div>
        <div style="font-size:10px;opacity:0.6;margin-top:4px">Nonce: ${b.nonce} · ${new Date(b.timestamp).toLocaleString()}</div>
        ${i<blocks.length-1?'<div style="position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);font-size:18px;z-index:1">⬇</div>':''}
      </div>`).join('<div style="height:14px"></div>');

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:560px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="margin:0;color:#1e1b4b">⛓️ Blockchain Audit Trail</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
          ${[['⛓️','Chain Length',d.chainLength||0,'#4f46e5'],['✅','Valid',d.isValid?'Yes':'No',d.isValid?'#10b981':'#ef4444'],['⚙️','Difficulty',d.difficulty||2,'#f59e0b']].map(([icon,label,val,color])=>`
            <div style="background:${color}11;border:1px solid ${color}33;border-radius:10px;padding:14px;text-align:center">
              <div style="font-size:22px">${icon}</div>
              <div style="font-size:20px;font-weight:800;color:${color}">${val}</div>
              <div style="font-size:11px;color:#6b7280">${label}</div>
            </div>`).join('')}
        </div>
        <div style="margin-bottom:16px">${blockCards||'<div style="text-align:center;color:#9ca3af;padding:20px">Chain empty — add events first</div>'}</div>
        <div style="display:flex;gap:8px">
          <button onclick="verifyBlockchain()" style="flex:1;padding:10px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">🔍 Verify Chain</button>
          <button onclick="addBlockchainEvent()" style="flex:1;padding:10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">➕ Add Event</button>
          <button onclick="this.closest('[style*=fixed]').remove()" style="flex:1;padding:10px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Close</button>
        </div>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function verifyBlockchain() {
  try {
    if(typeof toast==='function') toast('info', '🔍 Verifying blockchain...');
    const d = await p3api('/blockchain/verify');
    if(typeof toast==='function') toast(d.valid?'ok':'err', d.message);
    alert(d.message + '\n\nBlocks checked: ' + d.blocksChecked);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function addBlockchainEvent() {
  const eventType = prompt('Event type to record:', 'MANUAL_AUDIT');
  if (!eventType) return;
  try {
    const d = await p3api('/blockchain/add', { method: 'POST', body: JSON.stringify({ eventType, details: { source: 'manual' } }) });
    if(typeof toast==='function') toast('ok', `⛓️ Block #${d.block?.blockIndex} added to blockchain!`);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

// ════════════════════════════════════════════════════
// FEATURE 28 — AI ANOMALY DETECTION
// ════════════════════════════════════════════════════
async function showAnomalyDetection() {
  try {
    if(typeof toast==='function') toast('info', '🤖 Running anomaly detection...');
    const d = await p3api('/anomaly/detect', { method: 'POST' });
    const anomalies = d.anomalies || [];
    const riskColors = { none:'#10b981', low:'#10b981', medium:'#f59e0b', high:'#f97316', critical:'#ef4444' };
    const color = riskColors[d.overallRisk] || '#10b981';

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const anomalyCards = anomalies.length === 0
      ? '<div style="text-align:center;padding:24px;background:#ecfdf5;border-radius:12px"><div style="font-size:40px;margin-bottom:8px">✅</div><div style="font-size:15px;font-weight:700;color:#065f46">No anomalies detected!</div><div style="font-size:13px;color:#6b7280;margin-top:4px">Your account activity looks completely normal</div></div>'
      : anomalies.map(a => `
          <div style="padding:14px;background:#f9fafb;border-radius:10px;border-left:4px solid ${riskColors[a.severity]||'#6b7280'};margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:13px;font-weight:700;color:#1e1b4b">${a.type?.replace(/_/g,' ')}</span>
              <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:50px;background:${riskColors[a.severity]}22;color:${riskColors[a.severity]}">${(a.severity||'').toUpperCase()}</span>
            </div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${a.description}</div>
            <div style="font-size:11px;color:#9ca3af">💡 ${a.recommendation}</div>
          </div>`).join('');

    const s = d.stats || {};
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="margin:0;color:#1e1b4b">🤖 AI Anomaly Detection</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="background:${color}11;border:1px solid ${color}33;border-radius:12px;padding:16px;text-align:center;margin-bottom:20px">
          <div style="font-size:14px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:1px">Overall Risk: ${d.overallRisk||'None'}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px">${d.message}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px">
          ${[['🔑','Logins',s.logins||0],['❌','Failed',s.failedLogins||0],['🌍','IPs',s.uniqueIPs||0],['📁','Uploads',s.uploads||0],['🗑','Deletes',s.deletes||0],['⬇','Downloads',s.downloads||0]].map(([icon,label,val])=>`
            <div style="background:#f9fafb;border-radius:8px;padding:10px;text-align:center">
              <div style="font-size:16px">${icon}</div>
              <div style="font-size:18px;font-weight:800;color:#1e1b4b">${val}</div>
              <div style="font-size:10px;color:#9ca3af">${label}</div>
            </div>`).join('')}
        </div>
        <div style="margin-bottom:16px">${anomalyCards}</div>
        ${d.aiAnalysis ? `
          <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:10px;padding:14px;margin-bottom:16px">
            <div style="font-size:12px;font-weight:700;color:#4338ca;margin-bottom:6px">🤖 AI Analysis</div>
            <div style="font-size:12px;color:#374151">${d.aiAnalysis.aiInsight||''}</div>
            ${d.aiAnalysis.immediateAction?`<div style="font-size:12px;color:#4338ca;margin-top:6px;font-weight:600">Action: ${d.aiAnalysis.immediateAction}</div>`:''}
          </div>` : ''}
        <button onclick="this.closest('[style*=fixed]').remove()" 
          style="width:100%;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer">Close</button>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

// ════════════════════════════════════════════════════
// FEATURE 29 — SMART SEARCH
// ════════════════════════════════════════════════════
function showSmartSearch() {
  const modal = document.createElement('div');
  modal.id = 'smart-search-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-start;justify-content:center;padding:60px 20px';

  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:24px;max-width:620px;width:100%;max-height:80vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h3 style="margin:0;color:#1e1b4b">🔍 Smart Search</h3>
        <button onclick="document.getElementById('smart-search-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
      </div>
      <div style="position:relative;margin-bottom:16px">
        <input id="smart-q" type="text" placeholder="Search files by name, tag, type..." 
          style="width:100%;padding:12px 48px 12px 16px;border:2px solid #4f46e5;border-radius:50px;font-size:14px;outline:none;box-sizing:border-box"
          oninput="smartSearchSuggest(this.value)" onkeypress="if(event.key==='Enter')runSmartSearch()">
        <button onclick="runSmartSearch()" style="position:absolute;right:6px;top:50%;transform:translateY(-50%);background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:50px;padding:7px 16px;cursor:pointer;font-size:13px">Search</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        ${[['🖼 Images','image'],['📄 Documents','document'],['🎵 Audio','audio'],['🎬 Video','video'],['📦 Archives','archive'],['💻 Code','code']].map(([label,type])=>`
          <button onclick="runSmartSearchByType('${type}')" style="padding:6px 14px;background:#f3f4f6;border:none;border-radius:50px;cursor:pointer;font-size:12px;font-weight:600;color:#374151">${label}</button>`).join('')}
      </div>
      <div style="margin-bottom:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:11px;font-weight:700;color:#374151;display:block;margin-bottom:4px">Sort by</label>
            <select id="smart-sort" style="width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12px">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="largest">Largest first</option>
              <option value="smallest">Smallest first</option>
              <option value="name">Name A-Z</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:#374151;display:block;margin-bottom:4px">Folder</label>
            <input id="smart-folder" type="text" placeholder="Folder name..." style="width:100%;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:12px;box-sizing:border-box">
          </div>
        </div>
      </div>
      <div id="smart-suggestions" style="display:none;margin-bottom:8px"></div>
      <div id="smart-results">
        <div style="text-align:center;padding:24px;color:#9ca3af">
          <div style="font-size:32px;margin-bottom:8px">🔍</div>
          <div style="font-size:14px">Type to search your encrypted files</div>
          <div style="font-size:12px;margin-top:4px">Searches by name, tags, type, and folder</div>
        </div>
      </div>
      <button onclick="rebuildSearchIndex()" style="width:100%;margin-top:12px;padding:10px;background:#f3f4f6;border:none;border-radius:8px;cursor:pointer;font-size:12px;color:#6b7280">🔄 Rebuild Search Index</button>
    </div>`;
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  document.body.appendChild(modal);
}

async function runSmartSearch() {
  const query  = document.getElementById('smart-q')?.value?.trim();
  const sort   = document.getElementById('smart-sort')?.value || 'newest';
  const folder = document.getElementById('smart-folder')?.value?.trim();
  if (!query && !folder) return;

  const resultsDiv = document.getElementById('smart-results');
  resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ Searching...</div>';

  try {
    const params = new URLSearchParams({ sort });
    if (query) params.append('q', query);
    if (folder) params.append('folder', folder);

    const d = await p3api('/anomaly/search?' + params.toString());
    const results = d.results || [];

    if (!results.length) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#9ca3af">No files found. Try rebuilding the search index.</div>';
      return;
    }

    resultsDiv.innerHTML = `
      <div style="font-size:12px;color:#6b7280;margin-bottom:10px">${results.length} results</div>
      ${results.map(r=>`
        <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:6px;cursor:pointer" 
          onmouseover="this.style.background='#f5f3ff'" onmouseout="this.style.background='white'"
          onclick="document.getElementById('smart-search-modal').remove();showSection&&showSection('myfiles')">
          <span style="font-size:20px">${getFileIcon(r.fileName)}</span>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:#1e1b4b">${r.highlight||r.fileName}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:2px">${formatBytes(r.sizeBytes||0)} · ${r.algo||''} · ${r.folderName||'Root'}</div>
            ${r.tags?`<div style="font-size:10px;color:#4f46e5;margin-top:2px">${r.tags.split(' ').map(t=>`<span style="background:#f0f4ff;padding:1px 6px;border-radius:50px;margin-right:4px">${t}</span>`).join('')}</div>`:''}
          </div>
          <span style="font-size:11px;color:#9ca3af">${r.relevance>0?'⭐'.repeat(Math.min(3,Math.floor(r.relevance/30)+1)):''}</span>
        </div>`).join('')}`;
  } catch(e) { resultsDiv.innerHTML = `<div style="color:#dc2626;font-size:13px;padding:10px">${e.message}</div>`; }
}

async function runSmartSearchByType(type) {
  const resultsDiv = document.getElementById('smart-results');
  if (!resultsDiv) return;
  resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ Searching...</div>';
  try {
    const d = await p3api(`/anomaly/search?type=${type}&sort=newest`);
    const results = d.results || [];
    resultsDiv.innerHTML = results.length
      ? `<div style="font-size:12px;color:#6b7280;margin-bottom:10px">${results.length} ${type} files</div>` +
        results.map(r=>`<div style="padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;margin-bottom:6px"><div style="font-size:13px;font-weight:600">${getFileIcon(r.fileName)} ${r.fileName}</div><div style="font-size:11px;color:#9ca3af">${formatBytes(r.sizeBytes||0)}</div></div>`).join('')
      : `<div style="text-align:center;padding:20px;color:#9ca3af">No ${type} files found</div>`;
  } catch(e) {}
}

async function smartSearchSuggest(query) {
  const sugDiv = document.getElementById('smart-suggestions');
  if (!sugDiv || !query || query.length < 2) { if(sugDiv) sugDiv.style.display='none'; return; }
  try {
    const d = await p3api('/anomaly/search/suggest?q=' + encodeURIComponent(query));
    const sug = d.suggestions || [];
    if (!sug.length) { sugDiv.style.display='none'; return; }
    sugDiv.style.display = 'flex';
    sugDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px';
    sugDiv.innerHTML = sug.map(s=>`<button onclick="document.getElementById('smart-q').value='${s.text}';runSmartSearch()" style="padding:4px 12px;background:${s.type==='tag'?'#eff6ff':'#f3f4f6'};border:none;border-radius:50px;cursor:pointer;font-size:12px;color:#374151">${s.type==='tag'?'🏷️ ':''}${s.text}</button>`).join('');
  } catch(e) { if(sugDiv) sugDiv.style.display='none'; }
}

async function rebuildSearchIndex() {
  try {
    if(typeof toast==='function') toast('info', '🔄 Rebuilding search index...');
    const d = await p3api('/anomaly/index/rebuild', { method: 'POST' });
    if(typeof toast==='function') toast('ok', `✅ Indexed ${d.indexed} files!`);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

function getFileIcon(name) {
  const e = (name||'').split('.').pop().toLowerCase();
  return ['pdf'].includes(e)?'📄':['jpg','jpeg','png','gif','webp'].includes(e)?'🖼':['mp4','avi'].includes(e)?'🎬':['mp3','wav'].includes(e)?'🎵':['zip','tar','gz'].includes(e)?'📦':['js','ts','py'].includes(e)?'💻':'📁';
}

function formatBytes(b) {
  if(!b) return '0 B';
  const k=1024,s=['B','KB','MB','GB'];
  const i=Math.floor(Math.log(b)/Math.log(k));
  return +(b/Math.pow(k,i)).toFixed(1)+' '+s[i];
}

// ════════════════════════════════════════════════════
// FEATURE 30 — TEAM / ORGANIZATION
// ════════════════════════════════════════════════════
async function showOrganization() {
  try {
    const d = await p3api('/orgs/mine');
    const modal = document.createElement('div');
    modal.id = 'org-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    if (!d.hasOrg) {
      modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:28px;max-width:460px;width:100%">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <h3 style="margin:0;color:#1e1b4b">👥 Team / Organization</h3>
            <button onclick="document.getElementById('org-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
          </div>
          <div style="text-align:center;padding:20px">
            <div style="font-size:48px;margin-bottom:12px">👥</div>
            <div style="font-size:15px;font-weight:700;color:#1e1b4b;margin-bottom:6px">No Organization Yet</div>
            <div style="font-size:13px;color:#6b7280;margin-bottom:20px">Create an organization to collaborate with your team on encrypted files</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <input id="org-name" type="text" placeholder="Organization name (e.g. My Team)" 
              style="padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none">
            <button onclick="createOrganization()" 
              style="padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">
              ➕ Create Organization
            </button>
          </div>
          <div style="text-align:center;margin-top:12px;font-size:12px;color:#6b7280">
            Have an invite? <button onclick="joinWithToken()" style="background:none;border:none;color:#4f46e5;cursor:pointer;font-size:12px;font-weight:600">Join with token →</button>
          </div>
        </div>`;
    } else {
      const org     = d.org || {};
      const members = d.members || [];
      const roleColors = { owner:'#4f46e5', admin:'#06b6d4', member:'#10b981' };

      const memberRows = members.map(m => `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:10px"><div style="display:flex;align-items:center;gap:8px">
            <div style="width:30px;height:30px;border-radius:50%;background:#4f46e5;display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700">${(m.name||'?').charAt(0).toUpperCase()}</div>
            <div><div style="font-size:13px;font-weight:600;color:#1e1b4b">${m.name||'—'}</div><div style="font-size:11px;color:#9ca3af">${m.email||'—'}</div></div>
          </div></td>
          <td style="padding:10px"><span style="background:${roleColors[m.role]||'#6b7280'}22;color:${roleColors[m.role]||'#6b7280'};padding:2px 8px;border-radius:50px;font-size:11px;font-weight:700;text-transform:capitalize">${m.role}</span></td>
          <td style="padding:10px;font-size:11px;color:#9ca3af">${m.joinedAt?new Date(m.joinedAt).toLocaleDateString():'—'}</td>
          ${d.myRole==='owner'&&m.role!=='owner'?`<td style="padding:10px"><button onclick="removeMember('${m.userId}',this)" style="background:#fef2f2;color:#dc2626;border:none;padding:3px 8px;border-radius:6px;cursor:pointer;font-size:11px">Remove</button></td>`:'<td></td>'}
        </tr>`).join('');

      modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:24px;max-width:620px;width:100%;max-height:90vh;overflow-y:auto">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <div><h3 style="margin:0;color:#1e1b4b">👥 ${org.name}</h3><div style="font-size:12px;color:#6b7280;margin-top:2px">${d.myRole==='owner'?'You are the owner':'You are a '+d.myRole}</div></div>
            <button onclick="document.getElementById('org-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
            ${[['👥','Members',`${org.memberCount||0}/${org.maxMembers||10}`,'#4f46e5'],['📁','Files',org.fileCount||0,'#10b981'],['💾','Storage',formatBytes(org.storageUsed||0),'#f59e0b']].map(([icon,label,val,color])=>`
              <div style="background:${color}11;border:1px solid ${color}33;border-radius:10px;padding:14px;text-align:center">
                <div style="font-size:22px">${icon}</div>
                <div style="font-size:18px;font-weight:800;color:${color}">${val}</div>
                <div style="font-size:11px;color:#6b7280">${label}</div>
              </div>`).join('')}
          </div>
          <div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase">Members</div>
              ${d.myRole==='owner'||d.myRole==='admin'?`<button onclick="inviteMember()" style="padding:6px 14px;background:#eff6ff;color:#1d4ed8;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">+ Invite</button>`:''}
            </div>
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:#f9fafb"><th style="padding:10px;text-align:left;font-size:11px;color:#6b7280">Member</th><th style="padding:10px;text-align:left;font-size:11px;color:#6b7280">Role</th><th style="padding:10px;text-align:left;font-size:11px;color:#6b7280">Joined</th><th></th></tr></thead>
              <tbody>${memberRows}</tbody>
            </table>
          </div>
          <div style="display:flex;gap:8px">
            ${d.myRole!=='owner'?`<button onclick="leaveOrg()" style="flex:1;padding:10px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Leave Org</button>`:''}
            <button onclick="document.getElementById('org-modal').remove()" style="flex:1;padding:10px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Close</button>
          </div>
        </div>`;
    }
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function createOrganization() {
  const name = document.getElementById('org-name')?.value?.trim();
  if (!name) return alert('Enter organization name');
  try {
    const d = await p3api('/orgs', { method: 'POST', body: JSON.stringify({ name }) });
    if(typeof toast==='function') toast('ok', '🎉 ' + d.message);
    document.getElementById('org-modal')?.remove();
    setTimeout(showOrganization, 100);
  } catch(e) { alert(e.message); }
}

async function inviteMember() {
  const email = prompt('Enter email to invite:');
  if (!email) return;
  const role = prompt('Role (member/admin):', 'member') || 'member';
  try {
    const d = await p3api('/orgs/invite', { method: 'POST', body: JSON.stringify({ email, role }) });
    if(typeof toast==='function') toast('ok', `📧 Invite sent to ${email}!`);
    if (!d.emailSent) alert('Invite token: ' + d.token + '\n\nShare this with ' + email + ' to join.');
  } catch(e) { alert(e.message); }
}

async function joinWithToken() {
  const token = prompt('Enter invite token:');
  if (!token) return;
  try {
    const d = await p3api('/orgs/join/' + token, { method: 'POST' });
    if(typeof toast==='function') toast('ok', '🎉 ' + d.message);
    document.getElementById('org-modal')?.remove();
    setTimeout(showOrganization, 100);
  } catch(e) { alert(e.message); }
}

async function removeMember(userId, btn) {
  if (!confirm('Remove this member?')) return;
  try {
    await p3api('/orgs/members/' + userId, { method: 'DELETE' });
    btn.closest('tr').remove();
    if(typeof toast==='function') toast('ok', 'Member removed');
  } catch(e) { alert(e.message); }
}

async function leaveOrg() {
  if (!confirm('Leave organization? You will lose access to shared files.')) return;
  try {
    await p3api('/orgs/leave', { method: 'POST' });
    if(typeof toast==='function') toast('ok', 'You have left the organization');
    document.getElementById('org-modal')?.remove();
  } catch(e) { alert(e.message); }
}

// ════════════════════════════════════════════════════
// ADD PHASE 3 SIDEBAR ITEMS
// ════════════════════════════════════════════════════
(function addPhase3Sidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) { setTimeout(addPhase3Sidebar, 600); return; }
  if (document.getElementById('sb-phase3')) return;

  const sbBottom = sidebar.querySelector('.sb-bottom');
  const html = `
    <div id="sb-phase3">
      <div class="sb-section">Phase 3 — Advanced</div>
      <div class="sb-item" onclick="showZKPDemo()"><span class="si">🛡</span>Zero-Knowledge</div>
      <div class="sb-item" onclick="showBlockchain()"><span class="si">⛓️</span>Blockchain</div>
      <div class="sb-item" onclick="showAnomalyDetection()"><span class="si">🚨</span>Anomaly Detect</div>
      <div class="sb-item" onclick="showSmartSearch()"><span class="si">🔍</span>Smart Search</div>
      <div class="sb-item" onclick="showOrganization()"><span class="si">👥</span>My Team</div>
      <div class="sb-item" onclick="showZKPHistory()"><span class="si">📋</span>ZKP History</div>
    </div>`;

  if (sbBottom) sbBottom.insertAdjacentHTML('beforebegin', html);
  else sidebar.insertAdjacentHTML('beforeend', html);
})();

// Auto-init blockchain on load
setTimeout(async () => {
  try { await p3api('/blockchain/init', { method: 'POST' }); } catch(e) {}
  // Rebuild search index
  try { await p3api('/anomaly/index/rebuild', { method: 'POST' }); } catch(e) {}
}, 5000);

console.log('✅ Phase 3 loaded: ZKP, Blockchain, Anomaly Detection, Smart Search, Teams');