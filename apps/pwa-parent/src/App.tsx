import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ActivateAccountPage } from "./pages/ActivateAccountPage";
import { InstallPage } from "./pages/InstallPage";
import { LoginPage } from "./pages/LoginPage";
import { MultimediaPage } from "./pages/MultimediaPage";
import { MultimediaResourcePage } from "./pages/MultimediaResourcePage";
import { NivelesPage } from "./pages/NivelesPage";
import { ResumenPage } from "./pages/ResumenPage";
import { SocialArticlePage } from "./pages/SocialArticlePage";
import { SocialPage } from "./pages/SocialPage";
import { CuadernoPage } from "./pages/CuadernoPage";
import { CuadernoReportsPage } from "./pages/CuadernoReportsPage";

const App = () => {
  return (
    <Routes>
      <Route path="/install/:orgId" element={<InstallPage />} />
      <Route path="/activate-account" element={<ActivateAccountPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/resumen" replace />} />
          <Route path="/resumen" element={<ResumenPage />} />
          <Route path="/niveles" element={<NivelesPage />} />
          <Route path="/multimedia" element={<MultimediaPage />} />
          <Route path="/multimedia/:resourceId" element={<MultimediaResourcePage />} />
          <Route path="/social" element={<SocialPage />} />
          <Route path="/social/:postId" element={<SocialArticlePage />} />
          <Route path="/cuaderno" element={<CuadernoReportsPage />} />
          <Route path="/chat" element={<CuadernoPage />} />
          <Route path="*" element={<Navigate to="/resumen" replace />} />
        </Route>
      </Route>
    </Routes>
  );
};

export default App;
