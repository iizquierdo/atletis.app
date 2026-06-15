import type { GlobalSettings } from "../types";

const BRANDING_STORAGE_KEY = "ecosistema_parent_branding";

export interface BrandingSnapshot {
  appName: string;
  logoUrl: string | null;
}

export const DEFAULT_BRANDING: BrandingSnapshot = {
  appName: "Ecosistema Deporbas",
  logoUrl: "https://deporbas.com/wp-content/uploads/2024/08/cropped-cropped-logo-contorno-blanco-192x192.png"
};

export const readBrandingFromStorage = () => {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;

    const parsed = JSON.parse(raw) as Partial<BrandingSnapshot>;
    return {
      appName: typeof parsed.appName === "string" && parsed.appName.trim() ? parsed.appName : DEFAULT_BRANDING.appName,
      logoUrl: typeof parsed.logoUrl === "string" && parsed.logoUrl.trim() ? parsed.logoUrl : DEFAULT_BRANDING.logoUrl
    } satisfies BrandingSnapshot;
  } catch {
    return DEFAULT_BRANDING;
  }
};

export const saveBrandingToStorage = (
  settings?: Pick<GlobalSettings, "appName" | "logoUrl"> | null
) => {
  if (!settings?.appName?.trim()) return;

  const snapshot: BrandingSnapshot = {
    appName: settings.appName,
    logoUrl: settings.logoUrl ?? null
  };

  localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(snapshot));
};

export const applyDocumentTitle = (appName: string) => {
  document.title = `${appName} | Parent PWA`;
};
