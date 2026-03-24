// ═══════════════════════════════════════════════════════
// SECUREVAULT PWA INSTALLER
// File: C:\Projects\securevault\frontend\pwa.js
// Add to index.html AND auth.html before </body>:
// <link rel="manifest" href="manifest.json">
// <script src="pwa.js"></script>
// ═══════════════════════════════════════════════════════

(function initPWA() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('✅ SecureVault PWA: Service Worker registered', reg.scope);
        
        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      })
      .catch(err => console.log('SW registration failed:', err));
  }

  // Install prompt
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', () => {
    console.log('✅ SecureVault installed as PWA');
    hideInstallBanner();
    if (typeof toast === 'function') toast('ok', '✅ SecureVault installed! Check your home screen.');
  });

  function showInstallBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      z-index: 8000; background: linear-gradient(135deg, #1e1b4b, #312e70);
      border: 1px solid #4f46e566; border-radius: 50px; padding: 12px 20px;
      display: flex; align-items: center; gap: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); animation: slide-up 0.4s ease;
      white-space: nowrap;
    `;
    banner.innerHTML = `
      <span style="font-size: 20px">📱</span>
      <div>
        <div style="font-size: 13px; font-weight: 700; color: #e8e6f0">Install SecureVault</div>
        <div style="font-size: 11px; color: #9ca3af">Add to home screen for app experience</div>
      </div>
      <button onclick="installPWA()" style="background: linear-gradient(135deg, #4f46e5, #6366f1); color: white; border: none; padding: 8px 16px; border-radius: 50px; cursor: pointer; font-size: 12px; font-weight: 700; white-space: nowrap">
        Install ⬇
      </button>
      <button onclick="document.getElementById('pwa-install-banner').remove()" style="background: none; border: none; color: #6b7280; cursor: pointer; font-size: 16px; padding: 4px">✕</button>
    `;

    // Add animation keyframes
    if (!document.getElementById('pwa-styles')) {
      const style = document.createElement('style');
      style.id = 'pwa-styles';
      style.textContent = `
        @keyframes slide-up { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes slide-down { to { opacity: 0; transform: translateX(-50%) translateY(20px); } }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(banner);

    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (banner.isConnected) banner.remove();
    }, 10000);
  }

  function hideInstallBanner() {
    document.getElementById('pwa-install-banner')?.remove();
  }

  function showUpdateBanner() {
    if (document.getElementById('pwa-update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'pwa-update-banner';
    banner.style.cssText = `
      position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
      z-index: 8000; background: #0d3d2e; border: 1px solid #10b98144;
      border-radius: 50px; padding: 10px 18px; display: flex; align-items: center;
      gap: 10px; box-shadow: 0 4px 14px rgba(0,0,0,0.3); white-space: nowrap;
    `;
    banner.innerHTML = `
      <span style="font-size: 16px">🔄</span>
      <span style="font-size: 12px; color: #6ee7b7">SecureVault update available!</span>
      <button onclick="window.location.reload()" style="background: #10b981; color: white; border: none; padding: 5px 12px; border-radius: 50px; cursor: pointer; font-size: 11px; font-weight: 700">Refresh</button>
    `;
    document.body.appendChild(banner);
  }

  // Make installPWA globally accessible
  window.installPWA = async function() {
    if (!deferredPrompt) {
      alert('To install:\n• Chrome/Edge: Menu (⋮) → "Install SecureVault"\n• Safari/iOS: Share (↑) → "Add to Home Screen"\n• Firefox: Menu → "Install"');
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log('PWA install outcome:', outcome);
    deferredPrompt = null;
    hideInstallBanner();
  };

  // Show install instructions for iOS (which doesn't support beforeinstallprompt)
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  if (isIOS() && !window.navigator.standalone) {
    setTimeout(() => {
      if (document.getElementById('pwa-install-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'pwa-install-banner';
      banner.style.cssText = `
        position: fixed; bottom: 24px; left: 16px; right: 16px;
        z-index: 8000; background: linear-gradient(135deg, #1e1b4b, #312e70);
        border: 1px solid #4f46e566; border-radius: 14px; padding: 14px 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      `;
      banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px">
          <span style="font-size: 24px">📱</span>
          <div>
            <div style="font-size: 13px; font-weight: 700; color: #e8e6f0">Install SecureVault on iPhone</div>
          </div>
          <button onclick="document.getElementById('pwa-install-banner').remove()" style="margin-left: auto; background: none; border: none; color: #6b7280; cursor: pointer; font-size: 16px">✕</button>
        </div>
        <div style="font-size: 12px; color: #9ca3af; line-height: 1.6">
          Tap <strong style="color: #e8e6f0">Share ↑</strong> in Safari → then tap <strong style="color: #e8e6f0">Add to Home Screen</strong> to install SecureVault as an app.
        </div>
      `;
      document.body.appendChild(banner);
      setTimeout(() => banner.isConnected && banner.remove(), 8000);
    }, 2000);
  }

  // Network status indicator
  function updateNetworkStatus() {
    let indicator = document.getElementById('network-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'network-indicator';
      indicator.style.cssText = `
        position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
        z-index: 7000; padding: 6px 16px; border-radius: 50px; font-size: 12px;
        font-weight: 600; transition: all 0.3s; pointer-events: none;
        display: flex; align-items: center; gap: 6px;
      `;
      document.body.appendChild(indicator);
    }

    if (navigator.onLine) {
      indicator.style.display = 'none';
    } else {
      indicator.style.display = 'flex';
      indicator.style.background = '#3d2d08';
      indicator.style.border = '1px solid #f59e0b44';
      indicator.style.color = '#fcd34d';
      indicator.innerHTML = '⚠️ Offline mode — cached data only';
    }
  }

  window.addEventListener('online',  updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();

  console.log('✅ SecureVault PWA initialized');
})();