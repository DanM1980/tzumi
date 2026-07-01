import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import KidView from './pages/KidView';
import AdminView from './pages/AdminView';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/kid" element={<KidView />} />
      <Route path="/admin" element={<AdminView />} />
    </Routes>
  );
}
