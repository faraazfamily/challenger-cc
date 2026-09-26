import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isLoggedIn } from '../api';

export default function Navbar() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const link = (to, label) => (
    <Link to={to} className={pathname === to ? 'active' : ''} onClick={() => setOpen(false)}>{label}</Link>
  );
  return (
    <header className="navbar">
      <div className="container">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <img className="crest-logo" src="/jersey-logo.png" alt="Chaillengers crest" />
          The Challengers
        </Link>
        <button className="nav-toggle" type="button" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Menu'}
        </button>
        <nav className={open ? 'open' : ''}>
          {link('/', 'Home')}
          {link('/players', 'Players')}
          {link('/matches', 'Matches')}
          {link('/leaderboard', 'Leaderboard')}
          {localStorage.getItem('cc_member') ? link('/me', 'My Dashboard') : link('/member-login', 'Member Login')}
          {isLoggedIn() ? link('/admin', 'Admin') : link('/login', 'Admin Login')}
        </nav>
      </div>
    </header>
  );
}
