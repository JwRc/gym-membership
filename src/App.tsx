import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './auth/AppContext';
import { Loading } from './components/ui';
import { Layout } from './components/Layout';
import { AuthPage } from './pages/Auth';
import { HomePage } from './pages/Home';
import { StudentsPage } from './pages/Students';
import { StudentProfilePage } from './pages/StudentProfile';
import { StudentFinancePage } from './pages/StudentFinance';
import { ClassesPage } from './pages/Classes';
import { GraduationPage } from './pages/Graduation';
import { FinancePage } from './pages/Finance';
import { StorePage } from './pages/Store';
import { DisciplinesPage } from './pages/Disciplines';
import { SettingsPage } from './pages/Settings';
import { PortalHomePage } from './pages/portal/PortalHome';
import { PortalInvoicesPage } from './pages/portal/PortalInvoices';

export function App() {
  const { me, booting } = useApp();
  if (booting) return <Loading />;
  if (!me)
    return (
      <Routes>
        <Route path="/entrar" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/entrar" replace />} />
      </Routes>
    );

  if (me.role === 'STUDENT')
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<PortalHomePage />} />
          <Route path="mensalidades" element={<PortalInvoicesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="alunos" element={<StudentsPage />} />
        <Route path="alunos/:id" element={<StudentProfilePage />} />
        <Route path="alunos/:id/financeiro" element={<StudentFinancePage />} />
        <Route path="turmas" element={<ClassesPage />} />
        <Route path="graduacao" element={<GraduationPage />} />
        <Route path="financeiro" element={<FinancePage />} />
        <Route path="loja" element={<StorePage />} />
        <Route path="modalidades" element={<DisciplinesPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
