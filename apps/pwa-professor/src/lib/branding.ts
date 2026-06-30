import type { GlobalSettings } from "../types";

const BRANDING_STORAGE_KEY = "ecosistema_professor_branding";

export interface BrandingSnapshot {
  appName: string;
  logoUrl: string | null;
  isologoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
}

export const DEFAULT_BRANDING: BrandingSnapshot = {
  appName: "Ecosistema Deporbas",
  logoUrl: null,
  isologoUrl: null,
  faviconUrl: null,
  loginBackgroundUrl: null
};

const str = (v: unknown): string | null => {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
};

export const readBrandingFromStorage = (): BrandingSnapshot => {
  try {
    const raw = localStorage.getItem(BRANDING_STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;

    const parsed = JSON.parse(raw) as Partial<BrandingSnapshot>;
    return {
      appName: str(parsed.appName) ?? DEFAULT_BRANDING.appName,
      logoUrl: str(parsed.logoUrl),
      isologoUrl: str(parsed.isologoUrl),
      faviconUrl: str(parsed.faviconUrl),
      loginBackgroundUrl: str(parsed.loginBackgroundUrl)
    };
  } catch {
    return DEFAULT_BRANDING;
  }
};

export const saveBrandingToStorage = (
  settings?: Pick<GlobalSettings, "appName" | "logoUrl" | "isologoUrl" | "faviconUrl" | "loginBackgroundUrl"> | null
) => {
  if (!settings?.appName?.trim()) return;

  const snapshot: BrandingSnapshot = {
    appName: settings.appName,
    logoUrl: settings.logoUrl ?? null,
    isologoUrl: settings.isologoUrl ?? null,
    faviconUrl: settings.faviconUrl ?? null,
    loginBackgroundUrl: settings.loginBackgroundUrl ?? null
  };

  localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(snapshot));
};

export const applyDocumentTitle = (appName: string) => {
  document.title = `${appName} | Profesores`;
};

export const applyFavicon = (faviconUrl?: string | null) => {
  const href = str(faviconUrl);
  if (!href) return;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
};
