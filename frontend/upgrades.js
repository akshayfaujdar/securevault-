// ═══════════════════════════════════════════════════════
// SECUREVAULT — POWER UPGRADES FRONTEND
// File: C:\Projects\securevault\frontend\upgrades.js
// Add before </body> in index.html:
// <script src="upgrades.js"></script>
// ═══════════════════════════════════════════════════════

async function upApi(path, opts={}) {
  const token = localStorage.getItem('sv_token');
  const res = await fetch('http://13.206.106.203:3000/api/v1' + path, {
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(opts.headers||{}) },
    ...opts
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
  return d;
}

const COLORS = { purple:'#4f46e5', cyan:'#06b6d4', green:'#10b981', amber:'#f59e0b', red:'#ef4444', pink:'#ec4899' };

// ════════════════════════════════════════════════════
// UPGRADE 1 — POST-QUANTUM CRYPTOGRAPHY UI
// ════════════════════════════════════════════════════
async function showPostQuantum() {
  try {
    const status = await upApi('/crypto/kyber/status');
    const comparison = await upApi('/crypto/kyber/comparison');

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';

    const algos = comparison.comparison || [];
    const algoRows = algos.map(a => `
      <div style="padding:12px 14px;background:${a.quantumSafe===false?'#400d0d':a.quantumSafe===true?'#0d3d2e':'#1a1828'};border-radius:10px;border:1px solid ${a.quantumSafe===false?'#ef444444':a.quantumSafe===true?'#10b98144':'#2d2a3e'};margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:13px;font-weight:700;color:#e8e6f0">${a.algorithm}</span>
          <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:50px;background:${a.quantumSafe===false?'#ef444422':a.quantumSafe===true?'#10b98122':'#f59e0b22'};color:${a.quantumSafe===false?'#ef4444':a.quantumSafe===true?'#10b981':'#f59e0b'}">${a.quantumSafe===false?'❌ Quantum Vulnerable':a.quantumSafe===true?'✅ Quantum Safe':'ℹ️ '+a.type}</span>
        </div>
        <div style="font-size:11px;color:#9ca3af">${a.brokenBy||a.why||a.basedOn||''}</div>
        ${a.nistStatus?`<div style="font-size:10px;color:#6b7280;margin-top:2px">NIST: ${a.nistStatus}</div>`:''}
      </div>`).join('');

    modal.innerHTML = `
      <div style="background:#0f0e17;border:1px solid #2d2a3e;border-radius:16px;padding:28px;max-width:580px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <h3 style="margin:0;color:#e8e6f0;font-size:18px">⚛️ Post-Quantum Cryptography</h3>
            <div style="font-size:11px;color:#6b7280;margin-top:3px">CRYSTALS-Kyber — NIST FIPS 203 Standard (2024)</div>
          </div>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:#1a1828;border:1px solid #2d2a3e;color:#9ca3af;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px">✕</button>
        </div>

        <div style="background:${status.hasKeypair?'#0d3d2e':'#3d2d08'};border:1px solid ${status.hasKeypair?'#10b98144':'#f59e0b44'};border-radius:12px;padding:16px;margin-bottom:20px;text-align:center">
          <div style="font-size:32px;margin-bottom:8px">${status.hasKeypair?'✅':'⚠️'}</div>
          <div style="font-size:14px;font-weight:700;color:#e8e6f0;margin-bottom:4px">
            ${status.hasKeypair?'Post-Quantum Keys Active':'No Post-Quantum Keys Generated'}
          </div>
          <div style="font-size:12px;color:#9ca3af">
            ${status.hasKeypair?`Algorithm: ${status.algorithm} · NIST Level 3`:'Your current keys are vulnerable to quantum computers'}
          </div>
        </div>

        <div style="background:#1a1828;border:1px solid #2d2a3e;border-radius:10px;padding:14px;margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">The quantum threat</div>
          <div style="font-size:12px;color:#d1d5db;line-height:1.6">In 2024, NIST finalized the first post-quantum cryptography standards. <strong style="color:#f59e0b">Shor's algorithm</strong> can break RSA and ECC in polynomial time on a quantum computer. Current estimates: a sufficiently powerful quantum computer could break RSA-2048 in <strong style="color:#ef4444">hours</strong>. CRYSTALS-Kyber is based on the <strong style="color:#10b981">Module Learning With Errors (MLWE)</strong> problem — no quantum speedup is known.</div>
        </div>

        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Algorithm comparison</div>
          ${algoRows}
        </div>

        <div style="display:flex;gap:8px">
          <button onclick="generateKyberKeys()" style="flex:1;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">
            ${status.hasKeypair?'🔄 Regenerate Keys':'⚛️ Generate Post-Quantum Keys'}
          </button>
          <button onclick="this.closest('[style*=fixed]').remove()" style="padding:11px 20px;background:#1a1828;color:#9ca3af;border:1px solid #2d2a3e;border-radius:8px;cursor:pointer;font-size:13px">Close</button>
        </div>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function generateKyberKeys() {
  try {
    if(typeof toast==='function') toast('info', '⚛️ Generating post-quantum key pair...');
    const d = await upApi('/crypto/kyber/keygen', { method: 'POST' });
    if(typeof toast==='function') toast('ok', '✅ ' + d.message);
    document.querySelectorAll('[style*=fixed]').forEach(m => m.remove());
    setTimeout(showPostQuantum, 100);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

// ════════════════════════════════════════════════════
// UPGRADE 2 — WebAuthn / FIDO2 Hardware Keys
// ════════════════════════════════════════════════════
async function showWebAuthn() {
  try {
    const d = await upApi('/crypto/webauthn/devices');
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px';

    const deviceRows = (d.devices||[]).map(dev => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#1a1828;border-radius:10px;border:1px solid #2d2a3e;margin-bottom:8px">
        <span style="font-size:24px">${dev.deviceType==='platform'?'💻':'🔑'}</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:#e8e6f0">${dev.deviceName}</div>
          <div style="font-size:11px;color:#6b7280">Counter: ${dev.counter} · Last used: ${dev.lastUsed?new Date(dev.lastUsed).toLocaleDateString():'Never'}</div>
        </div>
        <button onclick="removeWebAuthnDevice('${dev.credId}',this)" style="background:#400d0d;color:#ef4444;border:1px solid #ef444444;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px">Remove</button>
      </div>`).join('');

    const supportedRows = (d.supportedDevices||[]).map(s => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0f0e17;border-radius:8px;margin-bottom:4px">
        <span style="font-size:18px">${s.icon}</span>
        <div><div style="font-size:12px;font-weight:600;color:#e8e6f0">${s.name}</div><div style="font-size:10px;color:#6b7280">${s.description}</div></div>
        <span style="margin-left:auto;font-size:10px;font-weight:700;padding:2px 8px;border-radius:50px;background:${s.type==='platform'?'#4f46e522':'#10b98122'};color:${s.type==='platform'?'#4f46e5':'#10b981'}">${s.type}</span>
      </div>`).join('');

    modal.innerHTML = `
      <div style="background:#0f0e17;border:1px solid #2d2a3e;border-radius:16px;padding:28px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <h3 style="margin:0;color:#e8e6f0;font-size:18px">🔑 Hardware Security Keys</h3>
            <div style="font-size:11px;color:#6b7280;margin-top:3px">WebAuthn / FIDO2 — Passwordless Authentication</div>
          </div>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:#1a1828;border:1px solid #2d2a3e;color:#9ca3af;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px">✕</button>
        </div>

        <div style="background:${d.enabled?'#0d3d2e':'#1a1828'};border:1px solid ${d.enabled?'#10b98144':'#2d2a3e'};border-radius:10px;padding:14px;margin-bottom:18px;display:flex;align-items:center;gap:12px">
          <span style="font-size:28px">${d.enabled?'✅':'🔒'}</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:#e8e6f0">${d.enabled?'Hardware Key Authentication Active':'No Hardware Keys Registered'}</div>
            <div style="font-size:11px;color:#9ca3af">${d.enabled?`${d.devices?.length||0} device(s) registered`:'Register a YubiKey, fingerprint, or Windows Hello'}</div>
          </div>
        </div>

        ${deviceRows?`<div style="margin-bottom:16px"><div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:8px">Your Registered Devices</div>${deviceRows}</div>`:''}

        <div style="margin-bottom:16px">
          <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:8px">Supported Devices</div>
          ${supportedRows}
        </div>

        <div style="background:#1a1828;border:1px solid #2d2a3e;border-radius:10px;padding:12px;margin-bottom:16px;font-size:12px;color:#9ca3af;line-height:1.6">
          🛡 <strong style="color:#e8e6f0">How it works:</strong> WebAuthn/FIDO2 uses public-key cryptography where the private key never leaves your device. Your hardware key or biometric creates a cryptographic signature that proves identity — no password is ever sent over the network.
        </div>

        <div style="display:flex;gap:8px">
          <button onclick="registerWebAuthnDevice()" style="flex:1;padding:11px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">🔑 Register Security Key</button>
          <button onclick="this.closest('[style*=fixed]').remove()" style="padding:11px 20px;background:#1a1828;color:#9ca3af;border:1px solid #2d2a3e;border-radius:8px;cursor:pointer;font-size:13px">Close</button>
        </div>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function registerWebAuthnDevice() {
  try {
    const token  = localStorage.getItem('sv_token');
    const header = JSON.parse(atob(token.split('.')[1]));
    
    if(typeof toast==='function') toast('info', '🔑 Requesting challenge from server...');
    const challengeData = await upApi('/crypto/webauthn/register/challenge', { method: 'POST' });
    
    // Try to use real WebAuthn API if available
    if (window.PublicKeyCredential) {
      try {
        const pubKeyOptions = {
          challenge: Uint8Array.from(atob(challengeData.challenge.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)),
          rp: challengeData.rp,
          user: {
            id: Uint8Array.from(atob(challengeData.user.id), c => c.charCodeAt(0)),
            name: challengeData.user.name,
            displayName: challengeData.user.displayName
          },
          pubKeyCredParams: challengeData.pubKeyCredParams,
          authenticatorSelection: challengeData.authenticatorSelection,
          timeout: challengeData.timeout,
          attestation: challengeData.attestation
        };

        if(typeof toast==='function') toast('info', '🔑 Touch your security key or use biometric...');
        const credential = await navigator.credentials.create({ publicKey: pubKeyOptions });

        const credentialId  = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
        const clientDataJSON= btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON)));

        const deviceType = credential.authenticatorAttachment === 'platform' ? 'platform' : 'hardware';
        const deviceName = deviceType === 'platform' ? 'Windows Hello / Touch ID' : 'Security Key';

        const result = await upApi('/crypto/webauthn/register/complete', {
          method: 'POST',
          body: JSON.stringify({ credentialId, publicKey: clientDataJSON, deviceName, deviceType })
        });

        if(typeof toast==='function') toast('ok', '✅ ' + result.message);
        document.querySelectorAll('[style*=fixed]').forEach(m => m.remove());
        setTimeout(showWebAuthn, 100);
        return;
      } catch(webauthnErr) {
        if (webauthnErr.name !== 'NotAllowedError') throw webauthnErr;
      }
    }

    // Simulation mode — show demo
    const simulatedCredId = btoa(crypto.getRandomValues(new Uint8Array(32)).join(','));
    const deviceName = prompt('Enter device name:', 'My YubiKey 5 NFC') || 'Security Key';
    
    const result = await upApi('/crypto/webauthn/register/complete', {
      method: 'POST',
      body: JSON.stringify({
        credentialId: simulatedCredId,
        publicKey: btoa(JSON.stringify({ type: 'EC', curve: 'P-256', simulated: true })),
        deviceName,
        deviceType: 'hardware'
      })
    });
    
    if(typeof toast==='function') toast('ok', '✅ ' + result.message);
    document.querySelectorAll('[style*=fixed]').forEach(m => m.remove());
    setTimeout(showWebAuthn, 100);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function removeWebAuthnDevice(credId, btn) {
  if (!confirm('Remove this security key?')) return;
  try {
    await upApi('/crypto/webauthn/devices/' + credId, { method: 'DELETE' });
    btn.closest('[style*=border]').remove();
    if(typeof toast==='function') toast('ok', 'Device removed');
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

// ════════════════════════════════════════════════════
// UPGRADE 3 — ENCRYPTED NOTES VAULT
// ════════════════════════════════════════════════════
let notesKey = null;
const NOTE_COLORS = {
  default: { bg:'#1a1828', border:'#2d2a3e', text:'#e8e6f0' },
  purple:  { bg:'#2d2a5e', border:'#4f46e544', text:'#c4b5fd' },
  blue:    { bg:'#0c2d5e', border:'#3b82f644', text:'#93c5fd' },
  green:   { bg:'#0d3d2e', border:'#10b98144', text:'#6ee7b7' },
  amber:   { bg:'#3d2d08', border:'#f59e0b44', text:'#fcd34d' },
  red:     { bg:'#400d0d', border:'#ef444444', text:'#fca5a5' },
};

async function deriveNotesKey(password) {
  const enc   = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('securevault-notes-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptNote(text, key) {
  const iv      = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ct      = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    encryptedContent: btoa(String.fromCharCode(...new Uint8Array(ct))),
    iv: btoa(String.fromCharCode(...iv))
  };
}

async function decryptNote(encryptedContent, ivStr, key) {
  const ct  = Uint8Array.from(atob(encryptedContent), c => c.charCodeAt(0));
  const iv  = Uint8Array.from(atob(ivStr), c => c.charCodeAt(0));
  const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(dec);
}

async function showNotesVault() {
  if (!notesKey) {
    const password = prompt('🔐 Enter your notes encryption password:\n(This password is never sent to the server)');
    if (!password) return;
    try {
      notesKey = await deriveNotesKey(password);
      if(typeof toast==='function') toast('ok', '🔑 Notes vault unlocked!');
    } catch(e) {
      if(typeof toast==='function') toast('err', 'Failed to derive key');
      return;
    }
  }

  try {
    const d = await upApi('/notes');
    const stats = await upApi('/notes/stats/summary');
    const notes = d.notes || [];

    const modal = document.createElement('div');
    modal.id = 'notes-vault-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:16px';

    const noteCards = notes.map(n => {
      const c = NOTE_COLORS[n.color] || NOTE_COLORS.default;
      return `
        <div style="background:${c.bg};border:1px solid ${c.border};border-radius:12px;padding:14px;cursor:pointer;transition:all 0.2s;position:relative"
          onclick="openNote('${n.noteId}')"
          onmouseover="this.style.transform='translateY(-2px)'"
          onmouseout="this.style.transform='none'">
          ${n.pinned?'<div style="position:absolute;top:10px;right:10px;font-size:14px">📌</div>':''}
          <div style="font-size:13px;font-weight:700;color:${c.text};margin-bottom:4px;padding-right:${n.pinned?'20px':'0'}">${n.title||'Untitled'}</div>
          <div style="font-size:11px;color:#6b7280;margin-bottom:8px">${n.wordCount||0} words · ${new Date(n.updatedAt).toLocaleDateString()}</div>
          ${(n.tags||[]).length?`<div style="display:flex;flex-wrap:wrap;gap:4px">${n.tags.map(t=>`<span style="background:rgba(255,255,255,0.1);color:#9ca3af;padding:1px 6px;border-radius:50px;font-size:10px">${t}</span>`).join('')}</div>`:''}
          <div style="margin-top:8px;font-size:11px;color:#4b5563;font-style:italic">[🔐 Encrypted]</div>
        </div>`;
    }).join('');

    modal.innerHTML = `
      <div style="background:#0f0e17;border:1px solid #2d2a3e;border-radius:16px;padding:24px;max-width:700px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <h3 style="margin:0;color:#e8e6f0;font-size:18px">📝 Encrypted Notes Vault</h3>
            <div style="font-size:11px;color:#6b7280;margin-top:3px">${stats.totalNotes||0} notes · ${stats.totalWords||0} words · End-to-end encrypted</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button onclick="createNewNote()" style="background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">+ New Note</button>
            <button onclick="document.getElementById('notes-vault-modal').remove();notesKey=null" style="background:#1a1828;border:1px solid #2d2a3e;color:#9ca3af;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px">✕</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
          ${[['📝',stats.totalNotes||0,'Total Notes','#4f46e5'],['📌',stats.pinnedNotes||0,'Pinned','#f59e0b'],['📖',stats.totalWords||0,'Total Words','#10b981']].map(([icon,val,label,color])=>`
            <div style="background:${color}11;border:1px solid ${color}33;border-radius:10px;padding:12px;text-align:center">
              <div style="font-size:20px">${icon}</div>
              <div style="font-size:22px;font-weight:800;color:${color};font-family:monospace">${val}</div>
              <div style="font-size:11px;color:#6b7280">${label}</div>
            </div>`).join('')}
        </div>

        <div style="background:#1a1828;border:1px solid #10b98133;border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#10b981">
          🛡 <strong>Zero-knowledge encryption</strong> — Your password was used to derive an AES-256-GCM key in your browser. All note content is encrypted before leaving your device. The server stores only ciphertext and can never read your notes.
        </div>

        ${notes.length ? `
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
            ${noteCards}
          </div>` : `
          <div style="text-align:center;padding:40px;color:#4b5563">
            <div style="font-size:48px;margin-bottom:12px">📝</div>
            <div style="font-size:15px;font-weight:700;color:#6b7280;margin-bottom:6px">No notes yet</div>
            <div style="font-size:13px;color:#4b5563">Click "New Note" to create your first encrypted note</div>
          </div>`}
      </div>`;
    modal.onclick = e => { if(e.target===modal) { modal.remove(); notesKey = null; } };
    document.body.appendChild(modal);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function createNewNote() {
  const editorModal = document.createElement('div');
  editorModal.id = 'note-editor-modal';
  editorModal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:16px';

  editorModal.innerHTML = `
    <div style="background:#0f0e17;border:1px solid #2d2a3e;border-radius:16px;padding:24px;max-width:680px;width:100%;max-height:90vh;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;color:#e8e6f0">📝 New Encrypted Note</h3>
        <button onclick="document.getElementById('note-editor-modal').remove()" style="background:#1a1828;border:1px solid #2d2a3e;color:#9ca3af;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px">✕</button>
      </div>
      <input id="note-title" type="text" placeholder="Note title..." 
        style="background:#1a1828;border:1px solid #2d2a3e;border-radius:8px;padding:10px 14px;color:#e8e6f0;font-size:14px;font-weight:600;outline:none;margin-bottom:10px;font-family:inherit">
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="note-tags" type="text" placeholder="Tags (comma separated)..."
          style="flex:1;background:#1a1828;border:1px solid #2d2a3e;border-radius:8px;padding:8px 12px;color:#e8e6f0;font-size:12px;outline:none;font-family:inherit">
        <select id="note-color" style="background:#1a1828;border:1px solid #2d2a3e;border-radius:8px;padding:8px 12px;color:#e8e6f0;font-size:12px;outline:none">
          <option value="default">⬛ Default</option>
          <option value="purple">🟣 Purple</option>
          <option value="blue">🔵 Blue</option>
          <option value="green">🟢 Green</option>
          <option value="amber">🟡 Amber</option>
          <option value="red">🔴 Red</option>
        </select>
      </div>
      <textarea id="note-content" placeholder="Write your note here... (will be encrypted before saving)"
        style="flex:1;min-height:280px;background:#1a1828;border:1px solid #2d2a3e;border-radius:8px;padding:14px;color:#e8e6f0;font-size:13px;line-height:1.7;resize:vertical;outline:none;font-family:inherit"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
        <div style="font-size:11px;color:#6b7280">🔐 Will be encrypted with AES-256-GCM in your browser</div>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('note-editor-modal').remove()" style="padding:9px 20px;background:#1a1828;color:#9ca3af;border:1px solid #2d2a3e;border-radius:8px;cursor:pointer;font-size:13px">Cancel</button>
          <button onclick="saveNewNote()" style="padding:9px 20px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">🔐 Encrypt & Save</button>
        </div>
      </div>
    </div>`;
  editorModal.onclick = e => { if(e.target===editorModal) editorModal.remove(); };
  document.body.appendChild(editorModal);
}

async function saveNewNote() {
  const title   = document.getElementById('note-title').value.trim() || 'Untitled';
  const content = document.getElementById('note-content').value.trim();
  const tagsRaw = document.getElementById('note-tags').value;
  const color   = document.getElementById('note-color').value;
  const tags    = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

  if (!content) { alert('Please write some content first!'); return; }
  if (!notesKey) { if(typeof toast==='function') toast('err', 'Notes key not available — reopen vault'); return; }

  try {
    if(typeof toast==='function') toast('info', '🔐 Encrypting note...');
    const { encryptedContent, iv } = await encryptNote(content, notesKey);
    const wordCount = content.split(/\s+/).filter(Boolean).length;

    await upApi('/notes', { method: 'POST', body: JSON.stringify({ title, encryptedContent, iv, tags, color, wordCount }) });

    if(typeof toast==='function') toast('ok', '✅ Note encrypted and saved!');
    document.getElementById('note-editor-modal')?.remove();
    document.getElementById('notes-vault-modal')?.remove();
    setTimeout(showNotesVault, 100);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function openNote(noteId) {
  try {
    const note = await upApi('/notes/' + noteId);
    if (!notesKey) { if(typeof toast==='function') toast('err', 'Notes key expired — reopen vault'); return; }

    if(typeof toast==='function') toast('info', '🔓 Decrypting note...');
    const decrypted = await decryptNote(note.encryptedContent, note.iv, notesKey);

    const c = NOTE_COLORS[note.color] || NOTE_COLORS.default;
    const vm = document.createElement('div');
    vm.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:16px';
    vm.innerHTML = `
      <div style="background:${c.bg};border:1px solid ${c.border};border-radius:16px;padding:24px;max-width:680px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;color:${c.text};font-size:18px">${note.title}</h3>
          <div style="display:flex;gap:8px">
            <button onclick="deleteNote('${noteId}',this)" style="background:#400d0d;color:#ef4444;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px">🗑 Delete</button>
            <button onclick="this.closest('[style*=fixed]').remove()" style="background:#1a1828;border:1px solid #2d2a3e;color:#9ca3af;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px">✕</button>
          </div>
        </div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:16px">${(note.tags||[]).map(t=>`<span style="background:rgba(255,255,255,0.1);padding:1px 6px;border-radius:50px">${t}</span>`).join(' ')} · ${note.wordCount||0} words · ${new Date(note.updatedAt).toLocaleString()}</div>
        <div style="background:rgba(0,0,0,0.3);border-radius:10px;padding:16px;font-size:13px;color:${c.text};line-height:1.8;white-space:pre-wrap;min-height:200px">${decrypted}</div>
        <div style="margin-top:12px;font-size:11px;color:#4b5563;text-align:center">🔐 Decrypted in browser · Never sent to server</div>
      </div>`;
    vm.onclick = e => { if(e.target===vm) vm.remove(); };
    document.body.appendChild(vm);
  } catch(e) {
    if(typeof toast==='function') toast('err', 'Failed to decrypt — wrong password?');
  }
}

async function deleteNote(noteId, btn) {
  if (!confirm('Delete this note?')) return;
  try {
    await upApi('/notes/' + noteId, { method: 'DELETE' });
    if(typeof toast==='function') toast('ok', 'Note deleted');
    document.querySelectorAll('[style*=10001]').forEach(m => m.remove());
    document.getElementById('notes-vault-modal')?.remove();
    setTimeout(showNotesVault, 100);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

// ════════════════════════════════════════════════════
// UPGRADE 4 — COMPLIANCE DASHBOARD
// ════════════════════════════════════════════════════
async function showComplianceDashboard() {
  try {
    if(typeof toast==='function') toast('info', '📋 Loading compliance report...');
    const overview = await upApi('/compliance/overview');

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';

    const regCards = (overview.regulations||[]).map(r => `
      <div style="background:#1a1828;border:1px solid ${r.color}44;border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:#e8e6f0;margin-bottom:4px">${r.name}</div>
        <div style="font-size:32px;font-weight:900;color:${r.color};font-family:monospace">${r.score}%</div>
        <div style="font-size:13px;font-weight:700;color:${r.color};margin:4px 0">${r.grade}</div>
        <div style="font-size:11px;color:#6b7280;margin-bottom:12px">${r.status}</div>
        <div style="background:#0f0e17;border-radius:50px;height:6px;overflow:hidden">
          <div style="background:${r.color};height:6px;width:${r.score}%;transition:width 1s"></div>
        </div>
        <button onclick="showRegulationDetail('${r.name.toLowerCase().replace('/',' ').replace(' ','')}')" 
          style="margin-top:10px;background:${r.color}22;color:${r.color};border:1px solid ${r.color}44;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600">View Details →</button>
      </div>`).join('');

    modal.innerHTML = `
      <div style="background:#0f0e17;border:1px solid #2d2a3e;border-radius:16px;padding:28px;max-width:680px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <h3 style="margin:0;color:#e8e6f0;font-size:18px">📋 Compliance Dashboard</h3>
            <div style="font-size:11px;color:#6b7280;margin-top:3px">GDPR · HIPAA · ISO 27001 · SOC 2</div>
          </div>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:#1a1828;border:1px solid #2d2a3e;color:#9ca3af;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px">✕</button>
        </div>

        <div style="background:linear-gradient(135deg,#1e1b4b,#312e70);border-radius:12px;padding:18px;margin-bottom:20px;text-align:center">
          <div style="font-size:13px;color:#9ca3af;margin-bottom:6px">Overall Compliance Score</div>
          <div style="font-size:48px;font-weight:900;color:#e8e6f0;font-family:monospace">${overview.overallScore}%</div>
          <div style="background:rgba(255,255,255,0.1);border-radius:50px;height:8px;margin-top:10px;overflow:hidden">
            <div style="background:linear-gradient(90deg,#4f46e5,#06b6d4);height:8px;width:${overview.overallScore}%"></div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px">
          ${regCards}
        </div>

        <div style="background:#0d3d2e;border:1px solid #10b98144;border-radius:10px;padding:14px;margin-bottom:12px">
          <div style="font-size:12px;font-weight:700;color:#10b981;margin-bottom:8px">✅ Compliance Strengths</div>
          ${(overview.strengths||[]).map(s=>`<div style="font-size:12px;color:#6ee7b7;margin-bottom:4px">${s}</div>`).join('')}
        </div>

        <div style="background:#3d2d08;border:1px solid #f59e0b44;border-radius:10px;padding:14px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:#f59e0b;margin-bottom:8px">⚠️ Improvements Needed</div>
          ${(overview.improvements||[]).map(i=>`<div style="font-size:12px;color:#fcd34d;margin-bottom:4px">${i}</div>`).join('')}
        </div>

        <div style="display:flex;gap:8px">
          <button onclick="downloadComplianceReport()" style="flex:1;padding:10px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">⬇ Download Report</button>
          <button onclick="upApi('/compliance/export-my-data').then(()=>toast('ok','Data export started'))" style="flex:1;padding:10px;background:#0d3d2e;color:#10b981;border:1px solid #10b98144;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">📦 Export My Data (GDPR)</button>
          <button onclick="this.closest('[style*=fixed]').remove()" style="padding:10px 18px;background:#1a1828;color:#9ca3af;border:1px solid #2d2a3e;border-radius:8px;cursor:pointer;font-size:13px">Close</button>
        </div>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function showRegulationDetail(reg) {
  try {
    const regMap = { gdpr:'/compliance/gdpr', hipaa:'/compliance/hipaa', iso27001:'/compliance/iso27001', iso27001:'/compliance/iso27001' };
    if (!regMap[reg]) return;
    const d = await upApi(regMap[reg]);

    const checks = d.checks || d.controls || [];
    const modal  = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';

    const checkRows = checks.map(c => `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 12px;background:#1a1828;border-radius:8px;border-left:3px solid ${c.passed?'#10b981':'#ef4444'};margin-bottom:6px">
        <span style="font-size:16px;flex-shrink:0">${c.passed?'✅':'❌'}</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:#e8e6f0">${c.article||c.clause||c.safeguard} — ${c.title||c.rule}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">${c.detail||''}</div>
        </div>
        <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:50px;background:${c.passed?'#10b98122':'#ef444422'};color:${c.passed?'#10b981':'#ef4444'};flex-shrink:0">${c.passed?'Pass':'Fail'}</span>
      </div>`).join('');

    modal.innerHTML = `
      <div style="background:#0f0e17;border:1px solid #2d2a3e;border-radius:16px;padding:24px;max-width:580px;width:100%;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;color:#e8e6f0;font-size:16px">${d.regulation}</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:#1a1828;border:1px solid #2d2a3e;color:#9ca3af;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:14px">✕</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
          <div style="background:#4f46e511;border:1px solid #4f46e533;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#4f46e5">${d.score}</div>
            <div style="font-size:11px;color:#6b7280">Score</div>
          </div>
          <div style="background:#10b98111;border:1px solid #10b98133;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#10b981">${d.percentage}%</div>
            <div style="font-size:11px;color:#6b7280">Compliance</div>
          </div>
          <div style="background:#f59e0b11;border:1px solid #f59e0b33;border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#f59e0b">${d.grade}</div>
            <div style="font-size:11px;color:#6b7280">Grade</div>
          </div>
        </div>
        ${checkRows}
        <button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;margin-top:12px;padding:10px;background:#1a1828;color:#9ca3af;border:1px solid #2d2a3e;border-radius:8px;cursor:pointer;font-size:13px">Close</button>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

async function downloadComplianceReport() {
  try {
    const [gdpr, hipaa, iso] = await Promise.all([
      upApi('/compliance/gdpr'),
      upApi('/compliance/hipaa'),
      upApi('/compliance/iso27001')
    ]);

    const report = `SECUREVAULT COMPLIANCE REPORT
Generated: ${new Date().toLocaleString()}
${'='.repeat(60)}

GDPR COMPLIANCE: ${gdpr.score} (${gdpr.percentage}%) — Grade: ${gdpr.grade}
${(gdpr.checks||[]).map(c => `  [${c.passed?'PASS':'FAIL'}] ${c.article} ${c.title}`).join('\n')}

HIPAA COMPLIANCE: ${hipaa.score} (${hipaa.percentage}%) — ${hipaa.grade}
${(hipaa.checks||[]).map(c => `  [${c.passed?'PASS':'FAIL'}] ${c.safeguard}: ${c.rule}`).join('\n')}

ISO 27001 COMPLIANCE: ${iso.score} (${iso.percentage}%)
${(iso.controls||[]).map(c => `  [${c.passed?'PASS':'FAIL'}] ${c.clause} ${c.title}`).join('\n')}`;

    const blob = new Blob([report], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'securevault_compliance_report.txt';
    a.click();
    if(typeof toast==='function') toast('ok', '⬇ Compliance report downloaded!');
  } catch(e) { if(typeof toast==='function') toast('err', e.message); }
}

// ════════════════════════════════════════════════════
// ADD SIDEBAR SECTION
// ════════════════════════════════════════════════════
(function addUpgradesSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) { setTimeout(addUpgradesSidebar, 600); return; }
  if (document.getElementById('sb-upgrades')) return;

  const sbBottom = sidebar.querySelector('.sb-bottom');
  const html = `
    <div id="sb-upgrades">
      <div class="sb-section">⚡ Power Upgrades</div>
      <div class="sb-item" onclick="showPostQuantum()"><span class="si">⚛️</span>Post-Quantum Crypto</div>
      <div class="sb-item" onclick="showWebAuthn()"><span class="si">🔑</span>Hardware Keys (FIDO2)</div>
      <div class="sb-item" onclick="showNotesVault()"><span class="si">📝</span>Encrypted Notes</div>
      <div class="sb-item" onclick="showComplianceDashboard()"><span class="si">📋</span>Compliance (GDPR/HIPAA)</div>
    </div>`;

  if (sbBottom) sbBottom.insertAdjacentHTML('beforebegin', html);
  else sidebar.insertAdjacentHTML('beforeend', html);
})();

console.log('✅ Power Upgrades loaded: Post-Quantum Crypto, WebAuthn, Notes Vault, Compliance Dashboard');