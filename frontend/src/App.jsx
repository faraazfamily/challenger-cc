import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Players from './pages/Players';
import PlayerProfile from './pages/PlayerProfile';
import Matches from './pages/Matches';
import MatchDetail from './pages/MatchDetail';
import Leaderboard from './pages/Leaderboard';
import Login from './pages/Login';
import MemberLogin from './pages/MemberLogin';
import MemberDashboard from './pages/MemberDashboard';
import Admin from './pages/Admin';

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:id" element={<PlayerProfile />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/member-login" element={<MemberLogin />} />
        <Route path="/me" element={<MemberDashboard />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
      <footer className="footer">
        The Challengers Cricket Club &copy; {new Date().getFullYear()}
      </footer>
    </>
  );
}
