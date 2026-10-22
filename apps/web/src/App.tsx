import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import { isVerifiedMember, useMe } from './session.tsx';
import { Loading } from './ui.tsx';
import { RegisterPage } from './pages/Register.tsx';
import { LoginPage } from './pages/Login.tsx';
import { VerifyEmailPage } from './pages/VerifyEmail.tsx';
import { OnboardingPage } from './pages/Onboarding.tsx';
import { ProfileEditPage } from './pages/ProfileEdit.tsx';
import { DiscoverPage } from './pages/Discover.tsx';
import { ProfileViewPage } from './pages/ProfileView.tsx';
import { ConnectionsPage } from './pages/Connections.tsx';
import { AdminVerificationPage } from './pages/AdminVerification.tsx';

export function App() {
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  if (isLoading) return <Loading />;

  const member = isVerifiedMember(me);
  const signOut = async () => {
    await api('POST', '/api/auth/logout');
    qc.clear();
    navigate('/login');
  };

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          Alumni Network
        </Link>
        {me && (
          <nav aria-label="Main">
            {member && <NavLink to="/discover">Discover</NavLink>}
            {member && <NavLink to="/connections">Connections</NavLink>}
            <NavLink to="/profile">Profile</NavLink>
            {me.isAdmin && <NavLink to="/admin/verification">Verification queue</NavLink>}
            <button type="button" className="link" onClick={signOut}>
              Sign out
            </button>
          </nav>
        )}
      </header>
      <main>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          {me ? (
            <>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/profile" element={<ProfileEditPage />} />
              <Route
                path="/discover"
                element={member ? <DiscoverPage /> : <Navigate to="/onboarding" />}
              />
              <Route
                path="/people/:userId"
                element={member ? <ProfileViewPage /> : <Navigate to="/onboarding" />}
              />
              <Route
                path="/connections"
                element={member ? <ConnectionsPage /> : <Navigate to="/onboarding" />}
              />
              <Route path="/admin/verification" element={<AdminVerificationPage />} />
              <Route
                path="*"
                element={
                  <Navigate
                    to={member ? '/discover' : me.isAdmin ? '/admin/verification' : '/onboarding'}
                  />
                }
              />
            </>
          ) : (
            <Route path="*" element={<Navigate to="/login" />} />
          )}
        </Routes>
      </main>
    </>
  );
}
