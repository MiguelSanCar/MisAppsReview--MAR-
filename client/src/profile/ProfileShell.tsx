import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Layout from '../components/Layout';
import { Spinner } from '../components/ui';
import { PublicLayout } from '../pages/PublicPages';
import { ProfileCtx, useProfileState } from './ProfileContext';

/**
 * Envoltorio de /perfil/:username. Es una ruta pública: con sesión se ve dentro de la app (menú lateral),
 * sin sesión con la cabecera pública. El perfil se carga una sola vez y lo comparten el menú y las páginas.
 */
export default function ProfileShell() {
  const { username = '' } = useParams();
  const { user, loading } = useAuth();
  const value = useProfileState(username, user?.id ?? 0);
  if (loading) return <Spinner />;
  return <ProfileCtx.Provider value={value}>{user ? <Layout /> : <PublicLayout />}</ProfileCtx.Provider>;
}
