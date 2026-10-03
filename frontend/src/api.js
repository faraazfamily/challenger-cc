const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

// Photos are served by the API server (/uploads/...), not by the website host,
// so they need the API address in front when the two live on different domains.
export function assetUrl(path) {
  if (path && path.startsWith('/uploads/')) return `${BASE}${path}`;
  return path;
}

function authHeaders() {
  const token = localStorage.getItem('cc_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  login: (username, password) =>
    fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ username, password }),
    }).then(handle),

  memberLogin: (name) =>
    fetch(`${BASE}/api/members/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name }),
    }).then(handle),

  // Team
  getTeam: () => fetch(`${BASE}/api/team`, { headers: authHeaders() }).then(handle),
  updateTeam: (formData) =>
    fetch(`${BASE}/api/team`, { method: 'PUT', headers: { ...authHeaders() }, body: formData }).then(handle),

  // Players
  getPlayers: () => fetch(`${BASE}/api/players`, { headers: authHeaders() }).then(handle),
  getPlayer: (id) => fetch(`${BASE}/api/players/${id}`, { headers: authHeaders() }).then(handle),
  createPlayer: (formData) =>
    fetch(`${BASE}/api/players`, { method: 'POST', headers: { ...authHeaders() }, body: formData }).then(handle),
  updatePlayer: (id, formData) =>
    fetch(`${BASE}/api/players/${id}`, { method: 'PUT', headers: { ...authHeaders() }, body: formData }).then(handle),
  deletePlayer: (id) =>
    fetch(`${BASE}/api/players/${id}`, { method: 'DELETE', headers: { ...authHeaders() } }).then(handle),

  // Tournaments
  getTournaments: () => fetch(`${BASE}/api/tournaments`, { headers: authHeaders() }).then(handle),
  createTournament: (payload) =>
    fetch(`${BASE}/api/tournaments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  updateTournament: (id, payload) =>
    fetch(`${BASE}/api/tournaments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteTournament: (id) =>
    fetch(`${BASE}/api/tournaments/${id}`, { method: 'DELETE', headers: { ...authHeaders() } }).then(handle),

  // Matches
  getMatches: () => fetch(`${BASE}/api/matches`, { headers: authHeaders() }).then(handle),
  getMatch: (id) => fetch(`${BASE}/api/matches/${id}`, { headers: authHeaders() }).then(handle),
  createMatch: (payload) =>
    fetch(`${BASE}/api/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  updateMatch: (id, payload) =>
    fetch(`${BASE}/api/matches/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),
  deleteMatch: (id) =>
    fetch(`${BASE}/api/matches/${id}`, { method: 'DELETE', headers: { ...authHeaders() } }).then(handle),
  saveMatchStats: (id, payload) =>
    fetch(`${BASE}/api/matches/${id}/stats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
    }).then(handle),

  // Scorecards
  importScorecard: (formData) =>
    fetch(`${BASE}/api/scorecards/upload`, { method: 'POST', headers: { ...authHeaders() }, body: formData }).then(handle),
  uploadScorecard: (matchId, formData) =>
    fetch(`${BASE}/api/scorecards/${matchId}/upload`, { method: 'POST', headers: { ...authHeaders() }, body: formData }).then(handle),

  // Stats
  getLeaderboard: () => fetch(`${BASE}/api/stats/leaderboard`, { headers: authHeaders() }).then(handle),
  getTeamRecord: () => fetch(`${BASE}/api/stats/team-record`, { headers: authHeaders() }).then(handle),
};

export function isLoggedIn() {
  return !!localStorage.getItem('cc_token');
}
