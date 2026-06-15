import type { GlobalSettings } from "../types";

const STORAGE_KEY = "ecosistema_parent_theme";

interface ThemePalette {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

const DEFAULT_THEME: ThemePalette = {
  primaryColor: "#00666d",
  secondaryColor: "#874e00",
  accentColor: "#006b1b"
};

const normalizeHex = (value: string | undefined | null, fallback: string) => {
  if (!value) return fallback;
  const hex = value.trim();
  const shortMatch = /^#([a-fA-F0-9]{3})$/;
  const longMatch = /^#([a-fA-F0-9]{6})$/;

  if (shortMatch.test(hex)) {
    const channels = hex.slice(1).split("");
    return `#${channels.map((channel) => `${channel}${channel}`).join("")}`.toLowerCase();
  }

  if (longMatch.test(hex)) {
    return hex.toLowerCase();
  }

  return fallback;
};

const hexToRgb = (hex: string) => {
  const normalized = normalizeHex(hex, "#000000").replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) => {
  const clamp = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
};

const mix = (baseHex: string, targetHex: string, amount: number) => {
  const base = hexToRgb(baseHex);
  const target = hexToRgb(targetHex);
  const ratio = Math.max(0, Math.min(1, amount));

  return rgbToHex({
    r: base.r + (target.r - base.r) * ratio,
    g: base.g + (target.g - base.g) * ratio,
    b: base.b + (target.b - base.b) * ratio
  });
};

const darken = (hex: string, amount: number) => mix(hex, "#000000", amount);
const lighten = (hex: string, amount: number) => mix(hex, "#ffffff", amount);

const applyThemePalette = (palette: ThemePalette) => {
  const root = document.documentElement;

  root.style.setProperty("--primary", palette.primaryColor);
  root.style.setProperty("--primary-dim", darken(palette.primaryColor, 0.14));
  root.style.setProperty("--secondary", palette.secondaryColor);
  root.style.setProperty("--secondary-soft", lighten(palette.secondaryColor, 0.82));
  root.style.setProperty("--tertiary", palette.accentColor);
  root.style.setProperty("--tertiary-soft", lighten(palette.accentColor, 0.72));
  root.style.setProperty("--surface-high", lighten(palette.primaryColor, 0.72));
  root.style.setProperty("--surface-highest", lighten(palette.primaryColor, 0.62));
  root.style.setProperty("--outline", lighten(palette.primaryColor, 0.45));
};

const resolvePalette = (settings?: Pick<GlobalSettings, "primaryColor" | "secondaryColor" | "accentColor"> | null) => {
  const base = settings ?? DEFAULT_THEME;
  return {
    primaryColor: normalizeHex(base.primaryColor, DEFAULT_THEME.primaryColor),
    secondaryColor: normalizeHex(base.secondaryColor, DEFAULT_THEME.secondaryColor),
    accentColor: normalizeHex(base.accentColor, DEFAULT_THEME.accentColor)
  };
};

export const applyThemeFromSettings = (
  settings?: Pick<GlobalSettings, "primaryColor" | "secondaryColor" | "accentColor"> | null
) => {
  const palette = resolvePalette(settings);
  applyThemePalette(palette);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(palette));
};

export const hydrateThemeFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<ThemePalette>;
    const palette = resolvePalette({
      primaryColor: parsed.primaryColor ?? DEFAULT_THEME.primaryColor,
      secondaryColor: parsed.secondaryColor ?? DEFAULT_THEME.secondaryColor,
      accentColor: parsed.accentColor ?? DEFAULT_THEME.accentColor
    });
    applyThemePalette(palette);
  } catch {
    // Ignore invalid persisted theme and keep defaults.
  }
};
