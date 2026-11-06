import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import Players from './pages/Players';
import PlayerProfile from './pages/PlayerProfile';
import Matches from './pages/Matches';
import MatchDetail from './pages/MatchDetail';
import Leaderboard from './pages/Leaderboard';
import Login from './pages/Login';
import Compare from './pages/Compare';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';
import { DialogProvider } from './components/Dialog';
import InstallPrompt from './components/InstallPrompt';

export default function App() {
  return (
    <DialogProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/players" element={<Players />} />
        <Route path="/players/:id" element={<PlayerProfile />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/compare" element={<Compare />} />
        {/* old links */}
        <Route path="/member-login" element={<Navigate to="/compare" replace />} />
        <Route path="/me" element={<Navigate to="/compare" replace />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
      <InstallPrompt />
    </DialogProvider>
  );
}
