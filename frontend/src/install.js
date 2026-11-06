import { useSyncExternalStore } from 'react';

// Installing the site as an app, and getting back to it afterwards.
//
// Install: only Chrome-family browsers offer a real install prompt, and even they decide for
// themselves when (and whether) to fire the event, so the site can never depend on it: without the
// event, the "Install app" buttons open steps written for the visitor's browser.
//
// After install: browsers give a page no way to open its installed app for certain, so "Open in
// app" tries where it can (Android) and otherwise shows where the app is. Whether the app is on
// this device is known from three signals below. iPhone gives none, because Safari and the home
// screen app share nothing, so Safari always offers the install steps there.
//
// This module is imported before React starts, so an early event is not missed.
const APP_KEY = 'cc_app_on_device';
const OPEN_TRIED_KEY = 'cc_open_app_tried';

let deferred = null;
const listeners = new Set();
let snapshot = { canPrompt: false, guide: null, runningAsApp: false, hasApp: false };

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function read(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

function rememberApp(on) {
  try {
    if (on) localStorage.setItem(APP_KEY, '1');
    else localStorage.removeItem(APP_KEY);
  } catch { /* private mode: it is simply not remembered */ }
}

function publish(changes = {}) {
  snapshot = { ...snapshot, canPrompt: !!deferred, ...changes };
  listeners.forEach((l) => l());
}

function appFound() {
  rememberApp(true);
  publish({ hasApp: true });
}

if (typeof window !== 'undefined') {
  const runningAsApp = isStandalone();
  if (runningAsApp) rememberApp(true); // the browser and the app share storage (not on iPhone)
  snapshot = { ...snapshot, runningAsApp, hasApp: runningAsApp || read(localStorage, APP_KEY) === '1' };

  // A browser only offers to install an app that is not installed, so this also catches an uninstall.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    rememberApp(false);
    publish({ hasApp: false });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    appFound();
    publish({ guide: null });
  });
  // Installed from another tab or before this was added. An empty answer proves nothing: it can
  // lag behind an install, and older desktop browsers always answer empty.
  navigator.getInstalledRelatedApps?.().then((apps) => { if (apps.length) appFound(); }).catch(() => {});

  // The last "Open in app" try only reloaded this page in the browser: show where the app is instead.
  if (read(sessionStorage, OPEN_TRIED_KEY)) {
    try { sessionStorage.removeItem(OPEN_TRIED_KEY); } catch { /* nothing to clear */ }
    snapshot = { ...snapshot, guide: 'open' };
  }
}

export function useInstall() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot);
}

export function closeInstallGuide() {
  publish({ guide: null });
}

async function startInstall() {
  if (!deferred) {
    publish({ guide: 'install' });
    return 'guide';
  }
  const event = deferred;
  deferred = null; // an install prompt can only be used once
  publish();
  event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

function openApp() {
  if (!/android/i.test(navigator.userAgent)) {
    publish({ guide: 'open' });
    return 'guide';
  }
  // The installed app claims this site's links, so Android may hand this one to it. If it does,
  // this page goes to the background. If not, the page reloads or stays, and the steps show.
  try { sessionStorage.setItem(OPEN_TRIED_KEY, '1'); } catch { /* the timer below still covers it */ }
  const { host, pathname, search } = window.location;
  window.location.href = `intent://${host}${pathname}${search}#Intent;scheme=https;end`;
  setTimeout(() => {
    try { sessionStorage.removeItem(OPEN_TRIED_KEY); } catch { /* nothing to clear */ }
    if (document.visibilityState === 'visible') publish({ guide: 'open' });
  }, 1500);
  return 'tried';
}

// What every "Install app" / "Open in app" button does. Returns the browser's answer when it could ask.
export function appAction() {
  return snapshot.hasApp ? openApp() : startInstall();
}

// Where to find the installed app.
export function openGuideFor(ua) {
  if (/android/i.test(ua)) {
    return { steps: ['Go to your home screen or app list.', 'Tap "Challengers" to open it.'], note: 'Or open the browser menu and look for "Open in Challengers".' };
  }
  return { steps: ['Click the "Open in app" icon at the right end of the address bar.', 'If there is no icon, open "The Challengers" from your Start menu or Applications.'] };
}

// The steps for this browser. `openElsewhere` means this browser cannot install at all.
export function guideFor(ua, maxTouchPoints = 0) {
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|; wv\)/i.test(ua);

  if (inApp) {
    const browser = ios ? 'Safari' : 'Chrome';
    return {
      openElsewhere: true,
      steps: [
        `This page is open inside another app, which cannot install it. Open it in ${browser} first.`,
        'Tap "Copy link" below.',
        `Open ${browser}, paste the link, and tap "Install app" again.`,
      ],
    };
  }
  if (ios) {
    return {
      steps: ['Tap the Share button (the square with an arrow).', 'Scroll down and tap "Add to Home Screen".', 'Tap "Add".'],
      note: 'Already added it? Open "Challengers" from your home screen.',
    };
  }
  if (android) {
    if (/SamsungBrowser/i.test(ua)) return { steps: ['Tap the menu button (three lines) at the bottom.', 'Tap "Add page to".', 'Tap "Home screen".'] };
    if (/Firefox/i.test(ua)) return { steps: ['Tap the menu button (three dots).', 'Tap "Install" or "Add to Home screen".'] };
    return { steps: ['Tap the menu button (three dots) at the top right.', 'Tap "Install app" or "Add to Home screen".', 'Tap "Install".'] };
  }
  if (/Firefox/i.test(ua)) {
    return { openElsewhere: true, steps: ['Firefox on a computer cannot install websites.', 'Tap "Copy link" below, and open it in Chrome or Edge.', 'Click "Install app" there.'] };
  }
  if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)) {
    return { steps: ['Open the File menu.', 'Click "Add to Dock".'] };
  }
  return { steps: ['Click the install icon at the right end of the address bar.', 'If there is no icon, open the browser menu and look for "Install The Challengers".', 'Click "Install".'] };
}
