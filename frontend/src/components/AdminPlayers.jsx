import { useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../api';

const BLANK = { name: '', role: 'Batsman', batting_style: '', bowling_style: '', jersey_number: '', bio: '', fielding_notes: '', is_captain: false, is_vice_captain: false, is_wicketkeeper: false };
const ROLES = ['Batsman', 'Bowler', 'All-rounder', 'Wicketkeeper'];

function LeadershipSelect({ form, setForm, players, editingId }) {
  const captain = players.find((p) => p.is_captain && p.id !== editingId);
  const vice = players.find((p) => p.is_vice_captain && p.id !== editingId);
  const value = form.is_captain ? 'captain' : form.is_vice_captain ? 'vice' : 'none';
  return (
    <div className="form-group">
      <label>Leadership</label>
      <select
        value={value}
        onChange={(e) => setForm({
          ...form,
          is_captain: e.target.value === 'captain',
          is_vice_captain: e.target.value === 'vice',
        })}
      >
        <option value="none">No leadership role</option>
        <option value="captain" disabled={!!captain}>
          {captain ? `Captain — already ${captain.name}` : 'Captain'}
        </option>
        <option value="vice" disabled={!!vice}>
          {vice ? `Vice-captain — already ${vice.name}` : 'Vice-captain'}
        </option>
      </select>
    </div>
  );
}

function KeeperSelect({ form, setForm, players, editingId }) {
  const keeper = players.find((p) => p.is_wicketkeeper && p.id !== editingId);
  return (
    <div className="form-group">
      <label>Wicketkeeper</label>
      <select
        value={form.is_wicketkeeper ? 'yes' : 'no'}
        onChange={(e) => setForm({ ...form, is_wicketkeeper: e.target.value === 'yes' })}
      >
        <option value="no">Not the wicketkeeper</option>
        <option value="yes" disabled={!!keeper}>
          {keeper ? `Wicketkeeper — already ${keeper.name}` : 'Wicketkeeper'}
        </option>
      </select>
    </div>
  );
}

export default function AdminPlayers() {
  const [players, setPlayers] = useState([]);
  const [form, setForm] = useState(BLANK);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const photoInput = useRef(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [jerseyFilter, setJerseyFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  function load() { api.getPlayers().then(setPlayers).catch(() => {}); }
  useEffect(load, []);

  function openAdd() {
    setEditingId(null);
    setForm(BLANK);
    setPhoto(null);
    setPreview('');
    setError('');
    setOpen(true);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      name: p.name, role: p.role, batting_style: p.batting_style || '', bowling_style: p.bowling_style || '',
      jersey_number: p.jersey_number || '', bio: p.bio || '', fielding_notes: p.fielding_notes || '',
      is_captain: p.is_captain, is_vice_captain: p.is_vice_captain, is_wicketkeeper: !!p.is_wicketkeeper,
      existing_photo_url: p.photo_url,
    });
    setPhoto(null);
    setPreview(assetUrl(p.photo_url) || '');
    setError('');
    setOpen(true);
  }

  function choosePhoto(file) {
    if (!file) return;
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
  }

  function removePhoto() {
    setPhoto(null);
    setPreview('');
    setForm((f) => ({ ...f, existing_photo_url: '' }));
    if (photoInput.current) photoInput.current.value = '';
  }

  function closeModal() {
    setOpen(false);
    setEditingId(null);
    setForm(BLANK);
    setPhoto(null);
    setPreview('');
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v === null || v === undefined || v === 'null') return;
      fd.append(k, v);
    });
    if (photo) fd.append('photo', photo);
    try {
      if (editingId) await api.updatePlayer(editingId, fd);
      else await api.createPlayer(fd);
      closeModal();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const filtered = players.filter((p) => {
    const nameOk = p.name.toLowerCase().includes(nameFilter.trim().toLowerCase());
    const jersey = p.jersey_number == null ? '' : String(p.jersey_number);
    const jerseyOk = !jerseyFilter.trim() || jersey.includes(jerseyFilter.trim());
    const roleOk = !roleFilter || p.role === roleFilter;
    return nameOk && jerseyOk && roleOk;
  });

  async function handleDelete(id) {
    if (!confirm('Delete this player? This also removes their match stats.')) return;
    await api.deletePlayer(id);
    load();
  }

  return (
    <div>
      <div className="squad-toolbar">
        <h3>Squad ({filtered.length})</h3>
        <button className="btn btn-primary" type="button" onClick={openAdd}>Add Player</button>
      </div>

      <div className="filter-bar">
        <div className="form-group">
          <label>Name</label>
          <input placeholder="Search by name" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Jersey</label>
          <input placeholder="e.g. 25" value={jerseyFilter} onChange={(e) => setJerseyFilter(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Role</label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            {ROLES.map((role) => <option key={role}>{role}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">No players match these filters.</div>
      ) : (
        <div className="card squad-list">
          {filtered.map((p) => (
            <div className="squad-row" key={p.id}>
              <div className="jersey-badge">{p.jersey_number ?? '—'}</div>
              <div className="squad-row-main">
                <strong>{p.name} {p.is_captain ? '★' : ''}{p.is_vice_captain ? ' VC' : ''}{p.is_wicketkeeper ? ' WK' : ''}</strong>
                <span className="role-tag">{p.role}</span>
              </div>
              <div className="squad-actions">
                <button className="btn btn-secondary btn-sm" type="button" onClick={() => startEdit(p)}>Edit</button>
                <button className="btn btn-danger btn-sm" type="button" onClick={() => handleDelete(p.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{editingId ? 'Edit Player' : 'Add Player'}</h3>
              <button className="btn btn-secondary btn-sm" type="button" onClick={closeModal}>Close</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {ROLES.map((role) => <option key={role}>{role}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Batting Style</label>
                  <input placeholder="e.g. Right-hand bat" value={form.batting_style} onChange={(e) => setForm({ ...form, batting_style: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Bowling Style</label>
                  <input placeholder="e.g. Right-arm fast" value={form.bowling_style} onChange={(e) => setForm({ ...form, bowling_style: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Jersey #</label>
                  <input type="number" value={form.jersey_number} onChange={(e) => setForm({ ...form, jersey_number: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Bio</label>
                <textarea rows={2} placeholder="e.g. Captain, aggressive top-order batsman" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Fielding Notes</label>
                <textarea rows={2} placeholder="e.g. One of the best fielders in the team" value={form.fielding_notes} onChange={(e) => setForm({ ...form, fielding_notes: e.target.value })} />
              </div>
              <div className="form-row">
                <LeadershipSelect form={form} setForm={setForm} players={players} editingId={editingId} />
                <KeeperSelect form={form} setForm={setForm} players={players} editingId={editingId} />
              </div>
              <div className="photo-picker">
                <div className="photo-preview">
                  {preview ? <img src={preview} alt="" /> : <span>{(form.name || '?').slice(0, 1).toUpperCase()}</span>}
                </div>
                <div>
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => photoInput.current?.click()}>Choose photo</button>
                  {preview && (
                    <button className="btn btn-secondary btn-sm" type="button" onClick={removePhoto}>Remove photo</button>
                  )}
                  <p>{photo ? photo.name : 'Optional. Any common photo format.'}</p>
                  <input ref={photoInput} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => choosePhoto(e.target.files?.[0])} />
                </div>
              </div>
              {error && <div className="error-text">{error}</div>}
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-primary" type="submit">{editingId ? 'Update Player' : 'Add Player'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
