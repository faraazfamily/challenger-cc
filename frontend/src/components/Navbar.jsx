import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, CalendarDays, Trophy, Swords, ShieldCheck, LogIn, Download, ExternalLink } from 'lucide-react';
import { isLoggedIn } from '../api';
import { appAction, useInstall } from '../install';

export default function Navbar() {
  const { pathname, search } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const { runningAsApp, hasApp } = useInstall();
  const stripRef = useRef(null);

  // Glass + shadow once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Keep the current section in view in the strip. Only the strip scrolls, never the page.
  useEffect(() => {
    const strip = stripRef.current;
    const active = strip?.querySelector('.active');
    if (active) strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  // While a match is being scored the bar scrolls away, leaving the screen to the run keys.
  const scoring = pathname === '/admin' && /[?&](live|new|view)=/.test(search);
  const links = [
    ['/', 'Home', Home],
    ['/players', 'Players', Users],
    ['/matches', 'Matches', CalendarDays],
    ['/leaderboard', 'Leaderboard', Trophy],
    ['/compare', 'Comparison', Swords],
    isLoggedIn() ? ['/admin', 'Admin', ShieldCheck] : ['/login', 'Admin Login', LogIn],
  ];
  const AppIcon = hasApp ? ExternalLink : Download;

  // The same items appear in the bar on wide screens and in the strip below it on narrow ones.
  const items = (
    <>
      {links.map(([to, label, Icon]) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
        return (
          <Link key={to} to={to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
            <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
      {!runningAsApp && (
        <button type="button" className="nav-app" onClick={appAction}>
          <AppIcon size={17} strokeWidth={2.2} aria-hidden="true" />
          <span>{hasApp ? 'Open in app' : 'Install app'}</span>
        </button>
      )}
    </>
  );

  return (
    <>
      <header className={`navbar ${scrolled ? 'scrolled' : ''} ${scoring ? 'static' : ''}`}>
        <div className="container">
          <Link to="/" className="brand">
            <img className="crest-logo" src="/crest-sm.webp" width="46" height="46" alt="The Challengers crest" />
            <span>The Challengers</span>
          </Link>
          <nav className="nav-bar-links" aria-label="Main">{items}</nav>
        </div>
      </header>
      {!scoring && <nav className="nav-strip" ref={stripRef} aria-label="Sections">{items}</nav>}
    </>
  );
}
