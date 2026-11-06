import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

const HIDE_KEY = 'cc_install_hidden_until';
const hiddenForNow = () => {
  try { return Date.now() < Number(localStorage.getItem(HIDE_KEY) || 0); } catch { return false; }
};
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const isPhone = () => window.matchMedia('(max-width: 720px)').matches;

// "Install the app" card on phones. Chrome / Android gives a real install prompt; Safari has
// none, so iPhone users get the two steps instead. "Not now" hides it for 30 days.
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [ios, setIos] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (standalone() || hiddenForNow()) return undefined;
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => setGone(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (isIOS() && isPhone()) setIos(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismiss() {
    setGone(true);
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + 30 * 24 * 3600 * 1000)); } catch { /* private mode */ }
  }

  async function install() {
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome !== 'accepted') dismiss();
  }

  if (gone || (!deferred && !ios)) return null;

  return (
    <div className="install-card" role="dialog" aria-label="Install the app">
      <img src="/icon-192.png" alt="" width="44" height="44" />
      <div className="install-text">
        <strong>Install the app</strong>
        {deferred
          ? <span>Full screen, and it works offline.</span>
          : <span>Tap <Share size={13} aria-label="Share" className="install-share" /> then &quot;Add to Home Screen&quot;.</span>}
      </div>
      {deferred && <button type="button" className="btn btn-primary btn-sm btn-icon" onClick={install}><Download size={15} aria-hidden="true" /> Install</button>}
      <button type="button" className="install-x" aria-label="Not now" onClick={dismiss}><X size={18} /></button>
    </div>
  );
}
