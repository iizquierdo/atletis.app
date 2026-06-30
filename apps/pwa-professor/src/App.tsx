import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { InstallPage } from "./pages/InstallPage";
import { LoginPage } from "./pages/LoginPage";
import { ResumenPage } from "./pages/ResumenPage";
import { ClasesPage } from "./pages/ClasesPage";
import { ClaseDetailPage } from "./pages/ClaseDetailPage";
import { SocialPage } from "./pages/SocialPage";
import { SocialArticlePage } from "./pages/SocialArticlePage";
import { CuadernoPage } from "./pages/CuadernoPage";
import { ChatPage } from "./pages/ChatPage";
import { PerfilPage } from "./pages/PerfilPage";

const App = () => {
  return (
    <Routes>
      <Route path="/install/:orgId" element={<InstallPage />} />
      <Route path="/installl/:orgId" element={<InstallPage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/resumen" replace />} />
          <Route path="/resumen" element={<ResumenPage />} />
          <Route path="/clases" element={<ClasesPage />} />
          <Route path="/clases/:classId" element={<ClaseDetailPage />} />
          <Route path="/social" element={<SocialPage />} />
          <Route path="/social/:postId" element={<SocialArticlePage />} />
          <Route path="/cuaderno" element={<CuadernoPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/perfil" element={<PerfilPage />} />
          <Route path="*" element={<Navigate to="/resumen" replace />} />
        </Route>
      </Route>
    </Routes>
  );
};

export default App;
