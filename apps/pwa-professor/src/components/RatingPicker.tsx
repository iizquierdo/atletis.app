import { useState } from "react";

export const RATING_THEMES = [
  { key: "stars", emoji: "⭐", label: "Estrellas", empty: "☆", filled: "⭐", fillUp: true },
  { key: "hearts", emoji: "❤️", label: "Corazones", empty: "🤍", filled: "❤️", fillUp: true },
  { key: "faces", emoji: "😊", label: "Caritas", fillUp: false, icons: ["😢", "😕", "😐", "🙂", "😄"] },
  { key: "trophies", emoji: "🏆", label: "Copas", empty: "🥉", filled: "🏆", fillUp: true },
  { key: "fire", emoji: "🔥", label: "Fuego", empty: "⚪", filled: "🔥", fillUp: true },
  { key: "lightning", emoji: "⚡", label: "Rayos", empty: "⚪", filled: "⚡", fillUp: true },
  { key: "muscles", emoji: "💪", label: "Fuerza", empty: "⚪", filled: "💪", fillUp: true },
  { key: "medals", emoji: "🥇", label: "Medallas", empty: "⚪", filled: "🥇", fillUp: true }
] as const;

type FillUpTheme = (typeof RATING_THEMES)[number] & { fillUp: true; empty: string; filled: string };
type FacesTheme = (typeof RATING_THEMES)[number] & { fillUp: false; icons: readonly string[] };

const getTheme = (theme: string) => RATING_THEMES.find((x) => x.key === theme) ?? RATING_THEMES[0];

export const RatingDisplay = ({ rating, theme }: { rating: number; theme: string }) => {
  const t = getTheme(theme);
  if (!t.fillUp) {
    const faces = t as FacesTheme;
    const icon = faces.icons[rating - 1];
    return (
      <span className="flex items-center gap-1">
        <span className="text-xl leading-none">{icon}</span>
        <span className="text-[10px] text-slate-400">{rating}/5</span>
      </span>
    );
  }
  const fill = t as FillUpTheme;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`text-sm leading-none ${i < rating ? "opacity-100" : "opacity-20 grayscale"}`}>
          {i < rating ? fill.filled : fill.empty}
        </span>
      ))}
      <span className="ml-1 text-[10px] text-slate-400">{rating}/5</span>
    </span>
  );
};

interface RatingPickerProps {
  rating: number;
  theme: string;
  onChange: (rating: number, theme: string) => void;
}

export const RatingPicker = ({ rating, theme, onChange }: RatingPickerProps) => {
  const [hover, setHover] = useState(0);
  const t = getTheme(theme);

  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center justify-between gap-1">
        {RATING_THEMES.map((th) => (
          <button
            key={th.key}
            type="button"
            aria-label={th.label}
            title={th.label}
            onClick={() => onChange(rating, th.key)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none transition-all ${
              theme === th.key
                ? "bg-[var(--primary)] shadow-sm"
                : "border border-slate-200 bg-white"
            }`}
          >
            <span>{th.emoji}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {Array.from({ length: 5 }, (_, i) => {
          const pos = i + 1;
          const isFaces = !t.fillUp;
          const active = isFaces ? (hover ? hover === pos : rating === pos) : (hover || rating) >= pos;
          const icon = isFaces
            ? (t as FacesTheme).icons[i]
            : active
              ? (t as FillUpTheme).filled
              : (t as FillUpTheme).empty;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(rating === pos ? 0 : pos, theme)}
              onMouseEnter={() => setHover(pos)}
              onMouseLeave={() => setHover(0)}
              className={`text-3xl leading-none transition-all select-none focus:outline-none active:scale-110 ${
                active ? "opacity-100" : "opacity-25 grayscale"
              }`}
            >
              {icon}
            </button>
          );
        })}
        {rating > 0 && (
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{rating}/5</span>
        )}
      </div>
    </div>
  );
};
