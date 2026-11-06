import { Link } from 'react-router-dom';
import { Users, CalendarDays, Trophy, Swords } from 'lucide-react';

export default function Footer() {
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
        </nav>
      </div>
      <div className="footer-copy">The Challengers Cricket Club &copy; {new Date().getFullYear()}</div>
    </footer>
  );
}
