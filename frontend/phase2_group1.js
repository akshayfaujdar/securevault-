// ═══════════════════════════════════════════════════════
// SECUREVAULT PHASE 2 GROUP 1 — FRONTEND
// File: C:\Projects\securevault\frontend\phase2_group1.js
// Add this just before </body> in index.html:
// <script src="phase2_group1.js"></script>
// ═══════════════════════════════════════════════════════

// ── API helper (reuses existing token) ───────────────
async function p2api(path, opts = {}) {
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
// FEATURE 12 — END-TO-END ENCRYPTION (E2E)
// ════════════════════════════════════════════════════

// Web Crypto API — encrypt in browser
async function e2eEncryptInBrowser(fileBuffer, passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits','deriveKey']);

  // Get salt from server
  const params = await p2api('/e2e/params');
  const salt = hexToBuffer(params.salt);

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt','decrypt']
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBuffer);

  return {
    encrypted: new Uint8Array(encrypted),
    iv: Array.from(iv),
    params: { salt: params.salt, iterations: 100000 }
  };
}

// Web Crypto API — decrypt in browser
async function e2eDecryptInBrowser(encryptedBuffer, iv, passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits','deriveKey']);

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: hexToBuffer(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt','decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    encryptedBuffer
  );
  return new Uint8Array(decrypted);
}

function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i/2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

// Show E2E Info Modal
function showE2EInfo() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;max-width:500px;width:100%;max-height:85vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h3 style="margin:0;color:#1e1b4b;font-size:18px">🔐 End-to-End Encryption</h3>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
      </div>
      <div style="background:linear-gradient(135deg,#4f46e5,#06b6d4);border-radius:12px;padding:20px;color:white;margin-bottom:20px">
        <div style="font-size:32px;margin-bottom:8px">🛡️</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:6px">Your files never leave your browser unencrypted</div>
        <div style="font-size:13px;opacity:0.85">Even the server cannot read your files</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
        ${[
          ['1️⃣','You enter a passphrase','Only you know it — never sent to server'],
          ['2️⃣','Browser derives AES-256 key','Using PBKDF2 with 100,000 iterations'],
          ['3️⃣','File encrypted in browser','AES-256-GCM before any network transmission'],
          ['4️⃣','Only ciphertext uploaded','Server stores encrypted bytes only'],
          ['5️⃣','Decryption in browser','Same passphrase recreates the key locally'],
        ].map(([step, title, desc]) => `
          <div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:#f8faff;border-radius:10px;border:1px solid #e0e7ff">
            <span style="font-size:20px;flex-shrink:0">${step}</span>
            <div>
              <div style="font-size:13px;font-weight:700;color:#1e1b4b">${title}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:2px">${desc}</div>
            </div>
          </div>`).join('')}
      </div>
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px;font-size:13px;color:#065f46">
        ✅ <strong>SecureVault uses E2E encryption on top of</strong> AES-256-CBC + Triple-DES + Blowfish triple encryption + LSB Steganography — making it one of the most secure file storage systems possible.
      </div>
      <button onclick="this.closest('[style*=fixed]').remove()" 
        style="width:100%;margin-top:16px;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer">
        Got it! 🔐
      </button>
    </div>`;
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  document.body.appendChild(modal);
}

// ════════════════════════════════════════════════════
// FEATURE 13 — DIGITAL SIGNATURES
// ════════════════════════════════════════════════════

async function generateKeyPair() {
  try {
    if (typeof toast === 'function') toast('info', '⚙️ Generating RSA-2048 key pair...');
    const d = await p2api('/signatures/generate-keypair', { method: 'POST' });
    if (d.alreadyExisted) {
      if (typeof toast === 'function') toast('info', '🔑 Key pair already exists!');
    } else {
      if (typeof toast === 'function') toast('ok', '🔑 RSA-2048 key pair generated!');
    }
    showKeyInfo(d.publicKey);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

function showKeyInfo(publicKey) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;max-width:560px;width:100%">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;color:#1e1b4b">🔑 Your RSA-2048 Public Key</h3>
        <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px;font-family:monospace;font-size:11px;color:#374151;max-height:200px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;margin-bottom:16px">${publicKey || 'No key generated yet'}</div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;font-size:12px;color:#92400e;margin-bottom:16px">
        ⚠️ Your private key is stored encrypted in the database. It is used to sign files — proving they came from you.
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="navigator.clipboard.writeText('${(publicKey||'').replace(/'/g,"\\'")}');this.textContent='Copied!'" 
          style="flex:1;padding:10px;background:#f3f4f6;border:none;border-radius:8px;cursor:pointer;font-size:13px">📋 Copy Public Key</button>
        <button onclick="this.closest('[style*=fixed]').remove()" 
          style="flex:1;padding:10px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Close</button>
      </div>
    </div>`;
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  document.body.appendChild(modal);
}

async function signFile(fileId, fileName) {
  try {
    // Check if user has keypair
    const keys = await p2api('/signatures/my-keys');
    if (!keys.hasKeypair) {
      if (confirm('You need an RSA key pair to sign files. Generate one now?')) {
        await generateKeyPair();
      }
      return;
    }
    if (typeof toast === 'function') toast('info', '✍️ Signing file...');
    const d = await p2api('/signatures/sign/' + fileId, { method: 'POST' });
    if (typeof toast === 'function') toast('ok', '✅ File signed with RSA-2048!');
    showSignResult(fileName, d, true);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

async function verifySignature(fileId, fileName) {
  try {
    const d = await p2api('/signatures/verify/' + fileId);
    showSignResult(fileName, d, false);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

function showSignResult(fileName, data, isSigning) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

  const isValid = data.valid !== false;
  const isSigned = data.signed !== false;

  modal.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;max-width:460px;width:100%">
      <div style="text-align:center;margin-bottom:20px">
        <div style="font-size:48px;margin-bottom:8px">${isSigning ? '✍️' : (isSigned && isValid ? '✅' : isSigned ? '❌' : '📄')}</div>
        <h3 style="margin:0 0 6px;color:#1e1b4b">${isSigning ? 'File Signed!' : 'Signature Verification'}</h3>
        <p style="color:#6b7280;font-size:13px;margin:0">${fileName}</p>
      </div>
      ${isSigned ? `
        <div style="background:${isValid ? '#ecfdf5' : '#fef2f2'};border:1px solid ${isValid ? '#a7f3d0' : '#fecaca'};border-radius:10px;padding:14px;margin-bottom:16px;text-align:center">
          <div style="font-size:15px;font-weight:700;color:${isValid ? '#065f46' : '#dc2626'}">${data.message}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
          ${data.signer ? `
            <div style="display:flex;justify-content:space-between;padding:10px 14px;background:#f9fafb;border-radius:8px">
              <span style="font-size:12px;color:#6b7280">Signed by</span>
              <span style="font-size:12px;font-weight:600;color:#1e1b4b">${data.signer.name || 'Unknown'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 14px;background:#f9fafb;border-radius:8px">
              <span style="font-size:12px;color:#6b7280">Email</span>
              <span style="font-size:12px;font-weight:600;color:#1e1b4b">${data.signer.email || '—'}</span>
            </div>` : ''}
          ${data.signedAt ? `
            <div style="display:flex;justify-content:space-between;padding:10px 14px;background:#f9fafb;border-radius:8px">
              <span style="font-size:12px;color:#6b7280">Signed at</span>
              <span style="font-size:12px;font-weight:600;color:#1e1b4b">${new Date(data.signedAt).toLocaleString()}</span>
            </div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:10px 14px;background:#f9fafb;border-radius:8px">
            <span style="font-size:12px;color:#6b7280">Algorithm</span>
            <span style="font-size:12px;font-weight:600;color:#4f46e5">${data.algorithm || 'RSA-SHA256'}</span>
          </div>
        </div>` : `
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;margin-bottom:16px;text-align:center">
          <div style="font-size:13px;color:#92400e">${data.message || 'File has not been signed'}</div>
        </div>`}
      <button onclick="this.closest('[style*=fixed]').remove()" 
        style="width:100%;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer">Close</button>
    </div>`;
  modal.onclick = e => { if(e.target===modal) modal.remove(); };
  document.body.appendChild(modal);
}

// ════════════════════════════════════════════════════
// FEATURE 14 — FOLDER STRUCTURE
// ════════════════════════════════════════════════════
let currentFolderId = 'root';
let folderTree = [];

async function openFolderManager() {
  try {
    const d = await p2api('/folders/tree/all');
    folderTree = d.flat || [];
    const rootFiles = await p2api('/folders/root');

    const modal = document.createElement('div');
    modal.id = 'folder-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const folderList = folderTree.length === 0
      ? '<div style="text-align:center;padding:20px;color:#9ca3af">No folders yet. Create one below!</div>'
      : folderTree.map(f => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;cursor:pointer;margin-bottom:6px"
            onclick="openFolder('${f.folderId}','${f.name.replace(/'/g,"\\'")}')">
            <span style="font-size:20px">${f.icon || '📁'}</span>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:#1e1b4b">${f.name}</div>
              <div style="font-size:11px;color:#9ca3af">${f.fileCount || 0} files</div>
            </div>
            <div style="display:flex;gap:4px">
              <button onclick="event.stopPropagation();renameFolder('${f.folderId}','${f.name.replace(/'/g,"\\'")}',this)" 
                style="background:none;border:none;cursor:pointer;font-size:14px;padding:4px">✏️</button>
              <button onclick="event.stopPropagation();deleteFolder('${f.folderId}','${f.name.replace(/'/g,"\\'")}',this)"
                style="background:none;border:none;cursor:pointer;font-size:14px;padding:4px">🗑️</button>
            </div>
          </div>`).join('');

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:500px;width:100%;max-height:85vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="margin:0;color:#1e1b4b">📁 Folder Manager</h3>
          <button onclick="document.getElementById('folder-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="margin-bottom:16px">${folderList}</div>
        <div style="background:#f9fafb;border-radius:10px;padding:14px;border:1px solid #e5e7eb">
          <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px">➕ Create New Folder</div>
          <div style="display:flex;gap:8px">
            <input id="new-folder-name" type="text" placeholder="Folder name..." maxlength="100"
              style="flex:1;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none"
              onkeypress="if(event.key==='Enter')createFolder()">
            <select id="new-folder-icon" style="padding:8px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:16px">
              ${['📁','💼','🏠','⭐','🔐','📊','🎨','📚','🎵','🎮'].map(i=>`<option value="${i}">${i}</option>`).join('')}
            </select>
            <button onclick="createFolder()" 
              style="padding:8px 16px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">Create</button>
          </div>
        </div>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

async function createFolder() {
  const name = document.getElementById('new-folder-name')?.value?.trim();
  const icon = document.getElementById('new-folder-icon')?.value || '📁';
  if (!name) return alert('Enter a folder name');
  try {
    await p2api('/folders', { method: 'POST', body: JSON.stringify({ name, icon }) });
    if (typeof toast === 'function') toast('ok', '📁 Folder "' + name + '" created!');
    document.getElementById('folder-modal')?.remove();
    setTimeout(openFolderManager, 100);
  } catch(e) { alert(e.message); }
}

async function renameFolder(folderId, oldName, btn) {
  const newName = prompt('Rename folder:', oldName);
  if (!newName || newName === oldName) return;
  try {
    await p2api('/folders/' + folderId, { method: 'PATCH', body: JSON.stringify({ name: newName }) });
    if (typeof toast === 'function') toast('ok', '✏️ Folder renamed!');
    document.getElementById('folder-modal')?.remove();
    setTimeout(openFolderManager, 100);
  } catch(e) { alert(e.message); }
}

async function deleteFolder(folderId, name, btn) {
  if (!confirm('Delete folder "' + name + '"?\nFiles will be moved to root.')) return;
  try {
    await p2api('/folders/' + folderId, { method: 'DELETE' });
    if (typeof toast === 'function') toast('ok', '🗑️ Folder deleted');
    document.getElementById('folder-modal')?.remove();
    setTimeout(openFolderManager, 100);
  } catch(e) { alert(e.message); }
}

async function moveFileToFolder(fileId, fileName) {
  try {
    const d = await p2api('/folders/tree/all');
    const folders = d.flat || [];

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:380px;width:100%">
        <h3 style="margin:0 0 16px;color:#1e1b4b">📁 Move "${fileName}"</h3>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;margin-bottom:16px">
          <div onclick="doMoveFile('${fileId}',null,this)" 
            style="padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;cursor:pointer;font-size:13px;font-weight:500">
            🏠 Root (no folder)
          </div>
          ${folders.map(f => `
            <div onclick="doMoveFile('${fileId}','${f.folderId}',this)"
              style="padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb;cursor:pointer;font-size:13px;font-weight:500">
              ${f.icon || '📁'} ${f.name}
            </div>`).join('')}
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" 
          style="width:100%;padding:10px;background:#f3f4f6;border:none;border-radius:8px;cursor:pointer;font-size:13px">Cancel</button>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) { alert(e.message); }
}

async function doMoveFile(fileId, folderId, btn) {
  try {
    await p2api('/folders/move-file', { method: 'POST', body: JSON.stringify({ fileId, folderId }) });
    btn.closest('[style*=fixed]').remove();
    if (typeof toast === 'function') toast('ok', '📁 File moved!');
    if (typeof loadMyFiles === 'function') loadMyFiles();
  } catch(e) { alert(e.message); }
}

// ════════════════════════════════════════════════════
// FEATURE 15 — FILE PREVIEW
// ════════════════════════════════════════════════════
async function showFilePreview(fileId, fileName) {
  try {
    const d = await p2api('/preview-roles/preview/' + fileId);

    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const typeInfo = {
      image: { icon: '🖼️', desc: 'Image file — decrypt to view in browser', color: '#06b6d4' },
      pdf:   { icon: '📄', desc: 'PDF document — decrypt to view in browser', color: '#ef4444' },
      text:  { icon: '📝', desc: 'Text file — decrypt to view content', color: '#10b981' },
      video: { icon: '🎬', desc: 'Video file — decrypt to play in browser', color: '#8b5cf6' },
      audio: { icon: '🎵', desc: 'Audio file — decrypt to play in browser', color: '#f59e0b' },
      none:  { icon: '📁', desc: 'Binary file — download to open', color: '#6b7280' }
    }[d.previewType] || { icon: '📁', desc: 'File', color: '#6b7280' };

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:460px;width:100%">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="margin:0;color:#1e1b4b">👁 File Preview Info</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="text-align:center;padding:24px;background:${typeInfo.color}11;border-radius:12px;border:2px solid ${typeInfo.color}33;margin-bottom:20px">
          <div style="font-size:52px;margin-bottom:8px">${typeInfo.icon}</div>
          <div style="font-size:15px;font-weight:700;color:#1e1b4b">${d.fileName}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px">${typeInfo.desc}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
          ${[
            ['File Type', d.extension?.toUpperCase() || '—'],
            ['Size', formatBytes(d.fileSize || 0)],
            ['Encryption', d.algo || 'AES+3DES+Blowfish'],
            ['Owner', d.owner || '—'],
            ['Preview Type', d.previewType || 'none'],
          ].map(([k,v]) => `
            <div style="display:flex;justify-content:space-between;padding:9px 14px;background:#f9fafb;border-radius:8px">
              <span style="font-size:12px;color:#6b7280">${k}</span>
              <span style="font-size:12px;font-weight:600;color:#1e1b4b">${v}</span>
            </div>`).join('')}
        </div>
        <div style="background:${d.previewable ? '#ecfdf5' : '#fffbeb'};border:1px solid ${d.previewable ? '#a7f3d0' : '#fde68a'};border-radius:10px;padding:12px;font-size:12px;color:${d.previewable ? '#065f46' : '#92400e'};margin-bottom:16px">
          ${d.previewable ? '✅ This file type supports in-browser preview. Decrypt the file to view it directly.' : '⚠️ This file type does not support browser preview. Download to open with an app.'}
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" 
          style="width:100%;padding:11px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:50px;font-size:14px;font-weight:600;cursor:pointer">Close</button>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

// Helper
function formatBytes(b) {
  if (!b) return '0 B';
  const k = 1024, s = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(b)/Math.log(k));
  return +(b/Math.pow(k,i)).toFixed(1)+' '+s[i];
}

// ════════════════════════════════════════════════════
// FEATURE 16 — ROLE BASED ACCESS
// ════════════════════════════════════════════════════
async function managePermissions(fileId, fileName) {
  try {
    const d = await p2api('/preview-roles/permissions/' + fileId);

    const modal = document.createElement('div');
    modal.id = 'perm-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:20px';

    const permRows = d.permissions?.length
      ? d.permissions.map(p => `
          <tr style="border-bottom:1px solid #f3f4f6">
            <td style="padding:10px;font-size:13px;font-weight:500">${p.userName || '—'}</td>
            <td style="padding:10px;font-size:12px;color:#6b7280">${p.userEmail || '—'}</td>
            <td style="padding:10px">
              <span style="background:${p.role==='editor'?'#eff6ff':p.role==='viewer'?'#ecfdf5':'#f5f3ff'};color:${p.role==='editor'?'#1d4ed8':p.role==='viewer'?'#065f46':'#4f46e5'};padding:3px 10px;border-radius:50px;font-size:11px;font-weight:700;text-transform:uppercase">${p.role}</span>
            </td>
            <td style="padding:10px;font-size:11px;color:#9ca3af">
              ${p.canDownload?'⬇':''}${p.canShare?'📤':''}${p.canDelete?'🗑':''}
            </td>
            <td style="padding:10px">
              <button onclick="revokePermission('${fileId}','${p.userId}',this)" 
                style="background:#fef2f2;color:#dc2626;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px">Revoke</button>
            </td>
          </tr>`)
        .join('')
      : '<tr><td colspan="5" style="text-align:center;padding:20px;color:#9ca3af">No permissions granted yet</td></tr>';

    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:24px;max-width:600px;width:100%;max-height:85vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;color:#1e1b4b">👥 File Permissions — ${fileName}</h3>
          <button onclick="document.getElementById('perm-modal').remove()" style="background:none;border:none;font-size:22px;cursor:pointer">✕</button>
        </div>
        <div style="background:#f5f3ff;border-radius:10px;padding:14px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:#4f46e5;margin-bottom:10px">➕ Grant Access</div>
          <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px">
            <input id="perm-email" type="email" placeholder="user@example.com"
              style="padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none">
            <select id="perm-role" style="padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">
              <option value="viewer">👁 Viewer</option>
              <option value="editor">✏️ Editor</option>
            </select>
            <button onclick="grantPermission('${fileId}')" 
              style="padding:8px 16px;background:linear-gradient(135deg,#4f46e5,#6366f1);color:white;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">Grant</button>
          </div>
          <div style="margin-top:10px;font-size:11px;color:#6b7280">
            👁 <strong>Viewer</strong>: Can view file info only &nbsp;|&nbsp;
            ✏️ <strong>Editor</strong>: Can view, download and share
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f9fafb">
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">User</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Email</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Role</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Can</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280">Action</th>
          </tr></thead>
          <tbody id="perm-tbody">${permRows}</tbody>
        </table>
      </div>`;
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  } catch(e) {
    if (typeof toast === 'function') toast('err', e.message);
  }
}

async function grantPermission(fileId) {
  const email = document.getElementById('perm-email')?.value?.trim();
  const role  = document.getElementById('perm-role')?.value;
  if (!email) return alert('Enter recipient email');
  try {
    const d = await p2api('/preview-roles/permissions/' + fileId, {
      method: 'POST',
      body: JSON.stringify({ targetEmail: email, role })
    });
    if (typeof toast === 'function') toast('ok', '✅ ' + d.message);
    document.getElementById('perm-modal')?.remove();
  } catch(e) { alert(e.message); }
}

async function revokePermission(fileId, userId, btn) {
  if (!confirm('Revoke this user\'s access?')) return;
  try {
    await p2api('/preview-roles/permissions/' + fileId + '/' + userId, { method: 'DELETE' });
    btn.closest('tr').remove();
    if (typeof toast === 'function') toast('ok', '🚫 Permission revoked');
  } catch(e) { alert(e.message); }
}

// ════════════════════════════════════════════════════
// ADD NEW BUTTONS TO MY FILES TABLE
// This function patches the existing renderMyFiles
// ════════════════════════════════════════════════════
(function patchRenderMyFiles() {
  if (typeof window.renderMyFiles !== 'function') {
    setTimeout(patchRenderMyFiles, 500);
    return;
  }

  const originalRender = window.renderMyFiles;
  window.renderMyFiles = function(files) {
    originalRender(files);

    // Add new Phase 2 buttons to each row
    const rows = document.querySelectorAll('#mf-tbl tr');
    rows.forEach((row, i) => {
      const file = files[i];
      if (!file) return;
      const actionCell = row.querySelector('td:last-child div');
      if (!actionCell) return;

      // Add Phase 2 buttons
      const btnGroup = [
        `<button class="btn btn-ghost btn-xs" onclick="signFile('${file.fileId}','${(file.originalName||'').replace(/'/g,"\\'")}')">✍️ Sign</button>`,
        `<button class="btn btn-ghost btn-xs" onclick="verifySignature('${file.fileId}','${(file.originalName||'').replace(/'/g,"\\'")}')">🔏 Verify</button>`,
        `<button class="btn btn-ghost btn-xs" onclick="showFilePreview('${file.fileId}','${(file.originalName||'').replace(/'/g,"\\'")}')">👁 Preview</button>`,
        `<button class="btn btn-ghost btn-xs" onclick="moveFileToFolder('${file.fileId}','${(file.originalName||'').replace(/'/g,"\\'")}')">📁 Move</button>`,
        `<button class="btn btn-ghost btn-xs" onclick="managePermissions('${file.fileId}','${(file.originalName||'').replace(/'/g,"\\'")}')">👥 Access</button>`,
      ].join('');

      actionCell.insertAdjacentHTML('beforeend', btnGroup);
    });
  };
})();

// ════════════════════════════════════════════════════
// ADD SIDEBAR ITEMS FOR GROUP 1 FEATURES
// ════════════════════════════════════════════════════
(function addSidebarItems() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) { setTimeout(addSidebarItems, 500); return; }

  // Check if already added
  if (document.getElementById('sb-phase2-section')) return;

  const sbBottom = sidebar.querySelector('.sb-bottom');
  const html = `
    <div id="sb-phase2-section">
      <div class="sb-section">Phase 2 Features</div>
      <div class="sb-item" onclick="openFolderManager()"><span class="si">📁</span>Folders</div>
      <div class="sb-item" onclick="showE2EInfo()"><span class="si">🔐</span>E2E Encryption</div>
      <div class="sb-item" onclick="generateKeyPair()"><span class="si">🔑</span>My Key Pair</div>
    </div>`;

  if (sbBottom) {
    sbBottom.insertAdjacentHTML('beforebegin', html);
  } else {
    sidebar.insertAdjacentHTML('beforeend', html);
  }
})();

console.log('✅ Phase 2 Group 1 features loaded: E2E, Digital Signatures, Folders, Preview, Role Access');
