import { isConfigured, auth, signOut, onAuthStateChanged } from './firebase.js';

function showSetupBanner() {
  const banner = document.createElement('div');
  banner.className = 'setup-banner';
  banner.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <span>Firebase isn't configured yet — paste your project keys into <code>ledger/js/firebase-config.js</code> to enable login and saving.</span>
  `;
  document.body.prepend(banner);
}

// Gates a page behind login. Calls onReady(user) once signed in.
// Returns nothing; handles redirects itself.
export function requireAuth(onReady) {
  if (!isConfigured) {
    showSetupBanner();
    return;
  }
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    onReady(user);
  });
}

export function wireLogout(selector) {
  const btn = document.querySelector(selector);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'login.html';
  });
}
