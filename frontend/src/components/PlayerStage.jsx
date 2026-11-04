import { useRef, useState } from 'react';
import { assetUrl } from '../api';
import { CountUp, reducedMotion } from '../motion';
import { PlayerAvatar, hasPhoto } from './PlayerCard';

// The top of a player's profile: a dark "stage" with a spotlight and the jersey number behind.
// With an intro clip (the player walks toward the camera and folds their arms, like a TV team
// intro) the clip plays once, stays on its last frame and a broadcast-style name plate slides in.
// Without one, the photo itself walks in from the back of the stage and settles into place.
export default function PlayerStage({ player }) {
  const video = hasPhoto(player.intro_video_url) ? assetUrl(player.intro_video_url) : null;
  const poster = hasPhoto(player.photo_url) ? assetUrl(player.photo_url) : undefined;
  const videoRef = useRef(null);
  const [take, setTake] = useState(0);
  const [played, setPlayed] = useState(reducedMotion());
  const bat = player.career?.batting || {};
  const bowl = player.career?.bowling || {};

  function replay() {
    if (video && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
      setPlayed(false);
    } else {
      setTake((t) => t + 1); // remount the figure so the walk-in runs again
    }
  }

  const stats = [
    ['Runs', bat.runs],
    ['Wickets', bowl.wickets],
    ['Highest', bat.highestScore],
    ['Strike rate', bat.strikeRate],
  ];

  return (
    <section className="stage">
      {player.jersey_number != null && <div className="stage-number" aria-hidden="true">{player.jersey_number}</div>}
      <div className="stage-spot" aria-hidden="true" />

      <div className={`stage-figure ${video ? 'has-video' : ''} ${played ? 'played' : ''}`} key={take}>
        {video ? (
          <div className="stage-clip">
            <video ref={videoRef} className="stage-video" src={video} poster={poster} muted playsInline preload="auto"
              autoPlay={!reducedMotion()} controls={reducedMotion()} onEnded={() => setPlayed(true)} />
            <div className="stage-plate" aria-hidden={!played}>
              {player.jersey_number != null && <span className="plate-no">{player.jersey_number}</span>}
              <span className="plate-text">
                <strong>{player.name}</strong>
                <span>{player.role}{player.is_captain ? ' · Captain' : player.is_vice_captain ? ' · Vice-Captain' : ''}</span>
              </span>
            </div>
          </div>
        ) : (
          <PlayerAvatar player={player} className="stage-avatar" />
        )}
        <span className="stage-floor" aria-hidden="true" />
      </div>

      <div className="stage-info">
        <div className="stage-kicker">
          <span className="role-tag">{player.role}</span>
          {player.is_captain && <span className="stage-chip">★ Captain</span>}
          {player.is_vice_captain && <span className="stage-chip">Vice-Captain</span>}
          {player.is_wicketkeeper && <span className="stage-chip">Wicketkeeper</span>}
        </div>
        <h1 className="stage-name">
          {player.name.split(' ').map((w, i) => <span key={i} style={{ '--w': i }}>{w}</span>)}
        </h1>
        {player.bio && <p className="stage-bio">{player.bio}</p>}
        <div className="stage-stats">
          {stats.map(([label, v], i) => (
            <div key={label} style={{ '--s': i }}>
              <strong><CountUp value={v} decimals={label === 'Strike rate' ? 1 : 0} /></strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className="stage-styles">
          {player.batting_style && <div><span>Batting</span>{player.batting_style}</div>}
          {player.bowling_style && <div><span>Bowling</span>{player.bowling_style}</div>}
          {player.fielding_notes && <div><span>Fielding</span>{player.fielding_notes}</div>}
        </div>
        <button type="button" className="stage-replay" onClick={replay}>
          {video ? '↻ Replay intro' : '↻ Replay entrance'}
        </button>
      </div>
    </section>
  );
}
