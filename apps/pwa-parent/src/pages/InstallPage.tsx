import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { fetchPublicBranding } from "../lib/data";
import { applyDocumentTitle, applyFavicon, saveBrandingToStorage } from "../lib/branding";
import { applyThemeFromSettings } from "../lib/theme";
import { setTenantId } from "../lib/tenant";

type Status = "loading" | "success" | "error";
type Platform = "android" | "ios" | "other";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const detectPlatform = (): Platform => {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
};

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export const InstallPage = () => {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const platform = useMemo(() => detectPlatform(), []);
  const [status, setStatus] = useState<Status>("loading");
  const [appName, setAppName] = useState("App Familias");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

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
          setAppName(data.appName || "App Familias");
          setLogoUrl(data.isologoUrl || data.logoUrl || null);
        }
        setStatus("success");
      } catch {
        setStatus("error");
      }
    };

    void run();
  }, [orgId, navigate]);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <main className="w-full max-w-md rounded-3xl bg-white p-6 text-center shadow-[0_16px_48px_rgb(15,23,42,0.10)]">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--primary)] shadow-lg">
          {logoUrl ? (
            <img src={logoUrl} alt={appName} className="h-16 w-16 rounded-2xl object-contain" />
          ) : (
            <MaterialIcon name="download_for_offline" filled className="text-4xl text-white" />
          )}
        </div>

        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {status === "loading" ? "Configurando" : installed ? "Instalada" : "Instalacion"}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{appName}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {status === "loading"
            ? "Estamos cargando la configuracion de tu organizacion."
            : "Instala la app para entrar rapido desde la pantalla principal."}
        </p>

        {status === "loading" && (
          <div className="mx-auto mt-6 h-1 w-48 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--primary)]" />
          </div>
        )}

        {status !== "loading" && platform === "android" && (
          <section className="mt-6 rounded-2xl bg-slate-50 p-4 text-left">
            <div className="mb-3 flex items-center gap-2">
              <MaterialIcon name="android" className="text-lg text-[var(--primary)]" />
              <h2 className="text-sm font-bold text-slate-800">Instalar en Android</h2>
            </div>
            <ol className="space-y-2 text-sm text-slate-600">
              <li>1. Toca el boton de instalacion si aparece disponible.</li>
              <li>2. Si Chrome muestra una invitacion arriba, toca Instalar.</li>
              <li>3. Si no aparece, abre el menu de tres puntos y elige Instalar app.</li>
            </ol>
            <button
              type="button"
              onClick={() => void handleInstall()}
              disabled={!installPrompt || installed}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 py-3 text-sm font-bold text-white shadow-lg transition-opacity disabled:opacity-45"
            >
              <MaterialIcon name={installed ? "check_circle" : "download"} filled className="text-base" />
              {installed ? "App instalada" : installPrompt ? "Instalar app" : "Esperando invitacion de Chrome"}
            </button>
          </section>
        )}

        {status !== "loading" && platform === "ios" && (
          <section className="mt-6 rounded-2xl bg-slate-50 p-4 text-left">
            <div className="mb-3 flex items-center gap-2">
              <MaterialIcon name="ios_share" className="text-lg text-[var(--primary)]" />
              <h2 className="text-sm font-bold text-slate-800">Instalar en iPhone/iPad</h2>
            </div>
            <ol className="space-y-2 text-sm text-slate-600">
              <li>1. Abre este enlace con Safari.</li>
              <li>2. Toca Compartir.</li>
              <li>3. Elige Agregar a pantalla de inicio.</li>
              <li>4. Confirma con Agregar.</li>
            </ol>
          </section>
        )}

        {status !== "loading" && platform === "other" && (
          <section className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            En Chrome o Edge puedes instalarla desde el icono de instalacion de la barra de direcciones.
          </section>
        )}

        <Link
          to="/login"
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Continuar al login
          <MaterialIcon name="arrow_forward" className="text-base" />
        </Link>

        {status === "error" && (
          <p className="mt-3 text-xs text-amber-600">
            No pudimos cargar toda la configuracion, pero ya puedes continuar.
          </p>
        )}
      </main>
    </div>
  );
};
