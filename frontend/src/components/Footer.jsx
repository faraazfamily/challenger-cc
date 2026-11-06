import { Link } from 'react-router-dom';
import { Users, CalendarDays, Trophy, Swords, Download } from 'lucide-react';
import { startInstall, useInstall } from '../install';

export default function Footer() {
  const { installed } = useInstall();
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <img src="/crest-sm.webp" alt="" width="44" height="44" loading="lazy" />
          <div>
            <strong>The Challengers</strong>
            <span>Play Hard. Play Fair. Challenge Everything.</span>
          </div>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link to="/players"><Users size={15} aria-hidden="true" /> Squad</Link>
          <Link to="/matches"><CalendarDays size={15} aria-hidden="true" /> Matches</Link>
          <Link to="/leaderboard"><Trophy size={15} aria-hidden="true" /> Leaderboard</Link>
          <Link to="/compare"><Swords size={15} aria-hidden="true" /> Comparison</Link>
          {!installed && <button type="button" onClick={startInstall}><Download size={15} aria-hidden="true" /> Install app</button>}
        </nav>
      </div>
      <div className="footer-copy">The Challengers Cricket Club &copy; {new Date().getFullYear()}</div>
    </footer>
  );
}
