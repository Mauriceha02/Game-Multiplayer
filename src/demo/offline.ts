export function setupOffline(): void {
  const status = document.getElementById('offline-status');
  if (!status) return;
  if (!isSecureContext || !('serviceWorker' in navigator)) { status.textContent = 'Für den Handy-Test bitte die HTTPS-Adresse verwenden.'; return; }
  void navigator.serviceWorker.register(new URL('./sw.js', document.baseURI), { scope: new URL('./', document.baseURI).href, updateViaCache: 'none' }).then(async registration => {
    await navigator.serviceWorker.ready;
    status.textContent = 'Testseite auf diesem Gerät gespeichert.';
    const refresh = (): void => { if (registration.waiting) status.textContent = 'Update bereit. Schließe alle Fenster der Testseite und öffne sie erneut.'; };
    refresh();
    registration.addEventListener('updatefound', () => { registration.installing?.addEventListener('statechange', refresh); });
  }).catch(() => { status.textContent = 'Testseite konnte nicht offline gespeichert werden.'; });
}
