import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { fetchPublicBranding } from "../lib/data";
import { applyDocumentTitle, applyFavicon, saveBrandingToStorage } from "../lib/branding";
import { applyThemeFromSettings } from "../lib/theme";
import { setTenantId } from "../lib/tenant";

type Status = "loading" | "success" | "error";

export const InstallPage = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [appName, setAppName] = useState<string | null>(null);

  useEffect(() => {
    const id = orgId?.trim();
    if (!id) {
      navigate("/login", { replace: true });
      return;
    }

    const run = async () => {
      setTenantId(id);
      try {
        const data = await fetchPublicBranding();
        if (data) {
          applyThemeFromSettings(data);
          saveBrandingToStorage(data);
          applyDocumentTitle(data.appName);
          applyFavicon(data.faviconUrl);
          setAppName(data.appName);
        }
        setStatus("success");
      } catch {
        setStatus("error");
      } finally {
        setTimeout(() => navigate("/login", { replace: true }), 1800);
      }
    };

    void run();
  }, [orgId, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex w-full max-w-xs flex-col items-center gap-6 text-center">
        {status === "loading" && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--primary)] shadow-lg">
              <MaterialIcon name="download_for_offline" filled className="text-4xl text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Configurando tu app</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Cargando la configuración de tu organización…
              </p>
            </div>
            <div className="h-1 w-48 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--primary)]" />
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--primary)] shadow-lg">
              <MaterialIcon name="check_circle" filled className="text-4xl text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">{appName ?? "Listo"}</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Aplicación configurada. Ingresando al login…
              </p>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500 shadow-lg">
              <MaterialIcon name="wifi_off" filled className="text-4xl text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Sin conexión</h1>
              <p className="mt-1.5 text-sm text-slate-500">
                No pudimos conectar con el servidor. Continuando de todas formas…
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
