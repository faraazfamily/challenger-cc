import { useSyncExternalStore } from 'react';

// Installing the site as an app. Only Chrome-family browsers offer a real install prompt, and even
// they decide for themselves when (and whether) to fire the event, so the site can never depend on
// it: without the event, the "Install app" buttons open steps written for the visitor's browser.
// This module is imported before React starts, so an early event is not missed.
let deferred = null;
let guideOpen = false;
const listeners = new Set();
let snapshot = { canPrompt: false, guideOpen: false, installed: false };

const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function publish(installed = snapshot.installed) {
  snapshot = { canPrompt: !!deferred, guideOpen, installed };
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  snapshot = { ...snapshot, installed: isStandalone() };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    guideOpen = false;
    publish(true);
  });
}

export function useInstall() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot);
}

export function closeInstallGuide() {
  guideOpen = false;
  publish();
}

// What every "Install app" button does. Returns the browser's answer when it could ask.
export async function startInstall() {
  if (!deferred) {
    guideOpen = true;
    publish();
    return 'guide';
  }
  const event = deferred;
  deferred = null; // an install prompt can only be used once
  publish();
  event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
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
    return { steps: ['Tap the Share button (the square with an arrow).', 'Scroll down and tap "Add to Home Screen".', 'Tap "Add".'] };
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
