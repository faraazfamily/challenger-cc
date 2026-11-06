import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, CalendarDays, Trophy, Swords, ShieldCheck, LogIn, Menu, X } from 'lucide-react';
import { isLoggedIn } from '../api';

export default function Navbar() {
  const { pathname, search } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Glass + shadow once the page scrolls; close the phone menu on every page change.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => { setOpen(false); }, [pathname, search]);

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

  return (
    <header className={`navbar ${scrolled ? 'scrolled' : ''} ${scoring ? 'static' : ''} ${open ? 'menu-open' : ''}`}>
      <div className="container">
        <Link to="/" className="brand">
          <img className="crest-logo" src="/crest-sm.webp" width="46" height="46" alt="The Challengers crest" />
          <span>The Challengers</span>
        </Link>
        <button className="nav-toggle" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
        <nav className={open ? 'open' : ''}>
          {links.map(([to, label, Icon]) => {
            const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
            return (
              <Link key={to} to={to} className={active ? 'active' : ''}>
                <Icon size={17} strokeWidth={2.2} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
