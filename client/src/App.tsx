import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import ContentPage from './pages/ContentPage';
import { FriendsPage } from './pages/FriendsPages';
import HomePage from './pages/HomePage';
import InvitePage from './pages/InvitePage';
import { MyListPage } from './pages/ListViews';
import { ListDetailPage, ListsPage } from './pages/ListsPages';
import { LegacyFriendRedirect, LegacyShareRedirect, MyProfileRedirect } from './pages/LegacyRedirects';
import { ProfileFriendsPage, ProfileHomePage, ProfileListPage } from './pages/ProfilePages';
import ProfileShell from './profile/ProfileShell';
import {
  ForgotPage, Landing, LoginPage, PublicLayout, RegisterPage, ResetPage, VerifyPage,
} from './pages/PublicPages';
import RoadmapPage from './pages/RoadmapPage';
import SettingsPage from './pages/SettingsPage';
import SharedListGate from './pages/SharedListGate';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/roadmap" element={<RoadmapPage />} />

      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot" element={<ForgotPage />} />
        <Route path="/reset/:token" element={<ResetPage />} />
        <Route path="/verify/:token" element={<VerifyPage />} />
        <Route path="/u/:token" element={<LegacyShareRedirect />} />
        <Route path="/invite/:token" element={<InvitePage />} />
      </Route>

      {/* Perfiles con URL propia: públicos (con sesión se ven dentro de la app, sin sesión con la cabecera pública) */}
      <Route path="/perfil/:username" element={<ProfileShell />}>
        <Route index element={<ProfileHomePage />} />
        <Route path="lista" element={<ProfileListPage />} />
        <Route path="amigos" element={<ProfileFriendsPage />} />
        <Route path="vuestra-lista" element={<SharedListGate />} />
      </Route>

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/profile" element={<MyProfileRedirect />} />
        <Route path="/list" element={<MyListPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/lists/:id" element={<ListDetailPage />} />
        <Route path="/content/:id" element={<ContentPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/friend/:id/*" element={<LegacyFriendRedirect />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
