import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, CircleX, Users, ArrowRight, CalendarDays } from 'lucide-react';
import { api, cached } from '../api';
import PlayerCard from '../components/PlayerCard';
import { SkeletonCards, EmptyState } from '../components/Feedback';
import { CountUp } from '../motion';

const resultClass = (r) => (r === 'Won' ? 'won' : r === 'Lost' ? 'lost' : 'other');

export default function Home() {
  // Last visit's data first (instant), then the fresh copy from the server. null = still loading.
  const [team, setTeam] = useState(() => cached('/api/team'));
  const [players, setPlayers] = useState(() => cached('/api/players'));
  const [record, setRecord] = useState(() => cached('/api/stats/team-record') || []);
  const [matches, setMatches] = useState(() => cached('/api/matches'));

  useEffect(() => {
    api.getTeam().then(setTeam).catch(() => {});
    api.getPlayers().then(setPlayers).catch(() => setPlayers((p) => p || []));
    api.getTeamRecord().then(setRecord).catch(() => {});
    api.getMatches().then(setMatches).catch(() => setMatches((m) => m || []));
  }, []);

  const recordFor = (r) => record.find((x) => x.result === r)?.count || 0;
  const squad = players || [];
  const recent = (matches || []).filter((m) => m.result !== 'Upcoming').slice(0, 3);
  const stats = [
    ['won', Trophy, recordFor('Won'), 'Matches won'],
    ['lost', CircleX, recordFor('Lost'), 'Matches lost'],
    ['squad', Users, squad.length, 'Squad members'],
  ];

  return (
    <div>
      <div className="hero">
        <div className="container">
          <div className="hero-crest">
            <span className="hero-halo" aria-hidden="true" />
            <img className="hero-logo" src="/crest.png" alt="The Challengers crest" />
            <span className="hero-shine" aria-hidden="true" />
          </div>
          <h1 className="hero-title">{team?.name || 'The Challengers'}</h1>
          <p className="hero-tagline">{team?.tagline || 'Play Hard. Play Fair. Challenge Everything.'}</p>
          <div className="hero-actions">
            <Link to="/players" className="btn btn-primary">Meet the squad <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link to="/leaderboard" className="btn btn-ghost"><Trophy size={17} aria-hidden="true" /> Leaderboard</Link>
          </div>
        </div>
      </div>

      <div className="container section">
        <div className="stat-row">
          {stats.map(([key, Icon, value, label]) => (
            <div key={key} className={`card stat-tile ${key}`} data-reveal>
              <span className="stat-icon"><Icon size={20} aria-hidden="true" /></span>
              <h2><CountUp value={value} /></h2>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {recent.length > 0 && (
          <>
            <div className="section-head" data-reveal>
              <h2>Recent results</h2>
              <Link to="/matches" className="section-link">All matches <ArrowRight size={15} aria-hidden="true" /></Link>
            </div>
            <div className="result-grid">
              {recent.map((m) => (
                <Link key={m.id} to={`/matches/${m.id}`} className={`card result-card ${resultClass(m.result)}`} data-reveal>
                  <div className="result-top">
                    <span className={`badge ${m.result === 'Won' ? 'badge-won' : m.result === 'Lost' ? 'badge-lost' : 'badge-upcoming'}`}>{m.result}</span>
                    <span className="result-date"><CalendarDays size={13} aria-hidden="true" />{new Date(m.match_date).toLocaleDateString()}</span>
                  </div>
                  <strong className="result-opp">vs {m.opponent}</strong>
                  <div className="result-score">
                    <span>{m.our_score || '—'}</span>
                    <em>vs</em>
                    <span>{m.opponent_score || '—'}</span>
                  </div>
                  {m.tournament_name && <span className="result-tour">{m.tournament_name}</span>}
                </Link>
              ))}
            </div>
          </>
        )}

        {team?.about && (
          <div className="about-block">
            <h2 data-reveal>About the club</h2>
            <p data-reveal>{team.about}</p>
          </div>
        )}

        <div className="section-head" data-reveal>
          <h2>Squad highlights</h2>
          <Link to="/players" className="section-link">Full squad <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        {players === null ? <SkeletonCards /> : squad.length === 0 ? (
          <EmptyState icon={Users} title="No players yet">Head to the Admin panel to add your squad.</EmptyState>
        ) : (
          <div className="grid grid-3">
            {squad.map((p) => <PlayerCard key={p.id} player={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
