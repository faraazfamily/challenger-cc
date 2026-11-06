import { useEffect, useState } from 'react';
import { Check, Copy, Download, ExternalLink, X } from 'lucide-react';
import { appAction, closeInstallGuide, guideFor, openGuideFor, useInstall } from '../install';

const HIDE_KEY = 'cc_install_hidden_until';
const hiddenForNow = () => {
  try { return Date.now() < Number(localStorage.getItem(HIDE_KEY) || 0); } catch { return false; }
};
const isPhone = () => window.matchMedia('(max-width: 720px)').matches;

function AppGuide({ mode }) {
  const [copied, setCopied] = useState(false);
  const opening = mode === 'open';
  const guide = opening ? openGuideFor(navigator.userAgent) : guideFor(navigator.userAgent, navigator.maxTouchPoints);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeInstallGuide(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch { /* the address stays visible below for copying by hand */ }
  }

  return (
    <div className="modal-backdrop dlg-backdrop" onClick={closeInstallGuide}>
      <div className="modal-card dlg" role="dialog" aria-modal="true" aria-labelledby="install-title" onClick={(e) => e.stopPropagation()}>
        <div className="dlg-top">
          <img className="install-guide-icon" src="/icon-192.png" alt="" width="40" height="40" />
          <h3 id="install-title">{opening ? 'Open the app' : 'Install the app'}</h3>
          <button type="button" className="dlg-x" aria-label="Close" onClick={closeInstallGuide}><X size={18} /></button>
        </div>
        <ol className="install-steps">
          {guide.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        {guide.note && <p className="install-note">{guide.note}</p>}
        {guide.openElsewhere && (
          <button type="button" className="btn btn-primary btn-icon install-copy" onClick={copy}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        )}
        {!opening && <p className="install-url">{window.location.host}</p>}
      </div>
    </div>
  );
}

// The app card on phones, and the steps sheet every Install / Open button opens. The card shows on
// every phone browser, not only those that fire the install event. "Not now" hides the card for 30
// days; the same button in the navigation always stays.
export default function InstallPrompt() {
  const { canPrompt, guide, runningAsApp, hasApp } = useInstall();
  const [dismissed, setDismissed] = useState(hiddenForNow);
  const [phone] = useState(isPhone);

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + 30 * 24 * 3600 * 1000)); } catch { /* private mode */ }
  }

  async function act() {
    if (await appAction() === 'dismissed') dismiss();
  }

  if (runningAsApp) return null;

  return (
    <>
      {!dismissed && (phone || canPrompt || hasApp) && (
        <div className="install-card" role="region" aria-label={hasApp ? 'Open the app' : 'Install the app'}>
          <img src="/icon-192.png" alt="" width="44" height="44" />
          <div className="install-text">
            <strong>{hasApp ? 'App installed' : 'Install the app'}</strong>
            <span>{hasApp ? 'Open it in full screen.' : 'Full screen, and it works offline.'}</span>
          </div>
          <button type="button" className="btn btn-primary btn-sm btn-icon" onClick={act}>
            {hasApp ? <ExternalLink size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
            {hasApp ? 'Open' : 'Install'}
          </button>
          <button type="button" className="install-x" aria-label="Not now" onClick={dismiss}><X size={18} /></button>
        </div>
      )}
      {guide && <AppGuide mode={guide} />}
    </>
  );
}
