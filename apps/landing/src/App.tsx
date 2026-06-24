import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { SportScene, SpotPanel, SpotFamily, SpotCoach, SpotBlocks, type SportVariant } from "./illustrations";

/* ── Design tokens (Tailwind utility strings) ────────────────────────────── */
const CARD = "rounded-3xl bg-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]";

type Tone = "blue" | "purple" | "red" | "emerald" | "amber" | "cyan";

const CHIP: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-500",
  purple: "bg-purple-50 text-purple-500",
  red: "bg-red-50 text-red-500",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  cyan: "bg-cyan-50 text-cyan-600"
};

const PASTEL: Record<Tone, string> = {
  blue: "bg-blue-50",
  purple: "bg-purple-50",
  red: "bg-red-50",
  emerald: "bg-emerald-50",
  amber: "bg-amber-50",
  cyan: "bg-cyan-50"
};

/* ── Primitives ──────────────────────────────────────────────────────────── */
function Icon({ name, className, filled }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      className={`material-symbols-rounded${filled ? " icon-filled" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function FlatIcon({ name, tone = "blue", className }: { name: string; tone?: Tone; className?: string }) {
  return (
    <span
      className={`inline-grid place-items-center w-12 h-12 rounded-2xl ${CHIP[tone]}${className ? ` ${className}` : ""}`}
    >
      <Icon name={name} filled className="text-[1.6rem]" />
    </span>
  );
}

function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`w-full max-w-6xl mx-auto px-5 sm:px-6${className ? ` ${className}` : ""}`}>{children}</div>;
}

function Eyebrow({ icon, children, className }: { icon: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400${className ? ` ${className}` : ""}`}
    >
      <Icon name={icon} className="text-base text-slate-400" /> {children}
    </span>
  );
}

const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-full bg-[#fb4e84] text-white px-6 py-3 text-base font-semibold shadow-[0_10px_24px_-6px_rgba(251,78,132,0.5)] transition hover:-translate-y-0.5 hover:bg-[#f23a73] hover:shadow-[0_14px_28px_-6px_rgba(251,78,132,0.6)]";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-full bg-white text-slate-700 px-6 py-3 text-base font-semibold border border-slate-200 shadow-sm transition hover:-translate-y-0.5";

/* Splash background — the same rising sports-icon animation as the parent PWA
   splash screen: colored sports icons drifting up over a transparent backdrop.
   Sits behind the hero cards. */
const SPLASH_PARTICLES = [
  { icon: "pool", x: 7, size: 60, color: "#0a858c", opacity: 0.22, dur: 13, delay: 0 },
  { icon: "sports_soccer", x: 19, size: 40, color: "#16a34a", opacity: 0.18, dur: 10, delay: -4 },
  { icon: "sports_basketball", x: 33, size: 68, color: "#f59e0b", opacity: 0.2, dur: 15, delay: -8 },
  { icon: "sports_tennis", x: 48, size: 36, color: "#22c55e", opacity: 0.26, dur: 11, delay: -1.5 },
  { icon: "sports_volleyball", x: 62, size: 52, color: "#3b82f6", opacity: 0.18, dur: 14, delay: -6 },
  { icon: "fitness_center", x: 77, size: 44, color: "#8b5cf6", opacity: 0.2, dur: 10, delay: -10 },
  { icon: "directions_run", x: 88, size: 56, color: "#f97316", opacity: 0.16, dur: 16, delay: -2.5 },
  { icon: "surfing", x: 13, size: 48, color: "#06b6d4", opacity: 0.18, dur: 12, delay: -7 },
  { icon: "kayaking", x: 41, size: 40, color: "#0d9488", opacity: 0.2, dur: 9, delay: -3 },
  { icon: "skateboarding", x: 56, size: 64, color: "#f43f5e", opacity: 0.16, dur: 13, delay: -11 },
  { icon: "sports_gymnastics", x: 70, size: 44, color: "#a855f7", opacity: 0.24, dur: 11, delay: -5 },
  { icon: "sports_handball", x: 24, size: 36, color: "#2563eb", opacity: 0.18, dur: 14, delay: -9 },
  { icon: "snowboarding", x: 82, size: 52, color: "#0ea5e9", opacity: 0.16, dur: 12, delay: -0.5 },
  { icon: "sports_martial_arts", x: 95, size: 40, color: "#ef4444", opacity: 0.2, dur: 10, delay: -13 },
  { icon: "pool", x: 3, size: 44, color: "#0ea5e9", opacity: 0.18, dur: 11, delay: -6 },
  { icon: "sports_basketball", x: 16, size: 52, color: "#f97316", opacity: 0.16, dur: 14, delay: -2 },
  { icon: "fitness_center", x: 28, size: 40, color: "#8b5cf6", opacity: 0.22, dur: 9, delay: -12 },
  { icon: "directions_run", x: 37, size: 60, color: "#ef4444", opacity: 0.16, dur: 16, delay: -7 },
  { icon: "sports_tennis", x: 52, size: 44, color: "#16a34a", opacity: 0.2, dur: 10, delay: -9.5 },
  { icon: "kayaking", x: 60, size: 36, color: "#2563eb", opacity: 0.24, dur: 13, delay: -3.5 },
  { icon: "sports_soccer", x: 67, size: 56, color: "#0d9488", opacity: 0.17, dur: 15, delay: -0.8 },
  { icon: "sports_gymnastics", x: 74, size: 40, color: "#f43f5e", opacity: 0.22, dur: 11, delay: -8.5 },
  { icon: "surfing", x: 85, size: 64, color: "#06b6d4", opacity: 0.15, dur: 14, delay: -5.5 },
  { icon: "skateboarding", x: 91, size: 44, color: "#a855f7", opacity: 0.2, dur: 12, delay: -11.5 },
  { icon: "sports_volleyball", x: 45, size: 38, color: "#f59e0b", opacity: 0.22, dur: 10, delay: -4.5 },
  { icon: "snowboarding", x: 9, size: 56, color: "#3b82f6", opacity: 0.16, dur: 15, delay: -10.5 },
  { icon: "sports_handball", x: 30, size: 48, color: "#06b6d4", opacity: 0.18, dur: 12, delay: -6.5 },
  { icon: "sports_martial_arts", x: 64, size: 44, color: "#a855f7", opacity: 0.2, dur: 13, delay: -1.2 }
];

function SplashBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {SPLASH_PARTICLES.map((p, i) => (
        <span
          key={i}
          className="splash-particle material-symbols-rounded icon-filled absolute select-none"
          style={{
            left: `${p.x}%`,
            bottom: "-10%",
            fontSize: `${p.size}px`,
            color: p.color,
            opacity: p.opacity,
            animation: `splash-rise ${p.dur}s linear ${p.delay}s infinite`
          }}
        >
          {p.icon}
        </span>
      ))}
    </div>
  );
}

/* Subtle aurora gradient blobs for select section backgrounds. */
function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="absolute -top-10 right-0 h-72 w-72 rounded-full bg-purple-200/40 blur-3xl" />
      <div className="absolute top-32 left-1/3 h-72 w-72 rounded-full bg-rose-200/30 blur-3xl" />
    </div>
  );
}

/* ── Scroll reveal ───────────────────────────────────────────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

/* ── Nav ─────────────────────────────────────────────────────────────────── */
function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-slate-50/80 backdrop-blur-md border-b border-slate-200/60">
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-[#ff7aa6] to-[#fb4e84] text-white shadow-lg shadow-[#fb4e84]/30">
            <Icon name="exercise" filled className="text-[1.35rem]" />
          </span>
          <span className="font-display text-xl font-extrabold text-slate-900">Atletis</span>
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-500">
          <a href="#apps" className="hover:text-slate-900 transition">Plataforma</a>
          <a href="#funciones" className="hover:text-slate-900 transition">Funciones</a>
          <a href="#roles" className="hover:text-slate-900 transition">Para cada quien</a>
          <a href="#crece" className="hover:text-slate-900 transition">Crece con vos</a>
        </nav>
        <a href="#cta" className={BTN_PRIMARY + " !px-5 !py-2.5 text-sm"}>
          Solicitar demo
        </a>
      </Container>
    </header>
  );
}

/* ── Hero (bento) ────────────────────────────────────────────────────────── */
const HERO_STATS: { num: string; label: string; tone: Tone }[] = [
  { num: "3", label: "Apps en un ecosistema", tone: "blue" },
  { num: "4", label: "Roles, cada quien lo suyo", tone: "purple" },
  { num: "100%", label: "Desde el celular", tone: "red" },
  { num: "+10", label: "Disciplinas deportivas", tone: "emerald" }
];

type HeroSlide = { variant: SportVariant; sport: string; level: string; pct: number; achievement: string };

const HERO_SLIDES: HeroSlide[] = [
  { variant: "swim", sport: "Natación", level: "Delfín · Nivel 3", pct: 72, achievement: "Respiración bilateral" },
  { variant: "soccer", sport: "Fútbol", level: "Goleador · Nivel 2", pct: 55, achievement: "Primer gol del año" },
  { variant: "gym", sport: "Gimnasia", level: "Equilibrio · Nivel 4", pct: 84, achievement: "Rueda sin manos" },
  { variant: "basket", sport: "Básquet", level: "Encestador · Nivel 3", pct: 66, achievement: "Doble limpio" }
];

/* Confetti burst — a handful of pieces flying up and out from an origin point.
   Replays whenever its key changes (i.e. on each slide). */
const CONFETTI = [
  { dx: -30, dy: -36, r: -40, c: "#fb4e84" },
  { dx: -12, dy: -48, r: 30, c: "#f59e0b" },
  { dx: 14, dy: -44, r: -20, c: "#22c55e" },
  { dx: 32, dy: -32, r: 50, c: "#3b82f6" },
  { dx: -36, dy: -16, r: 20, c: "#a855f7" },
  { dx: 38, dy: -12, r: -30, c: "#fb923c" },
  { dx: -22, dy: -54, r: 60, c: "#06b6d4" },
  { dx: 6, dy: -58, r: -50, c: "#fb4e84" },
  { dx: 24, dy: -52, r: 15, c: "#f43f5e" },
  { dx: -44, dy: -30, r: -60, c: "#16a34a" },
  { dx: 46, dy: -34, r: 40, c: "#f59e0b" },
  { dx: -4, dy: -40, r: -15, c: "#22c55e" }
];

function Confetti() {
  return (
    <span className="pointer-events-none absolute left-6 top-1 z-40 block h-0 w-0">
      {CONFETTI.map((p, idx) => (
        <span
          key={idx}
          className="confetti-piece"
          style={
            {
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--r": `${p.r}deg`,
              background: p.c,
              animationDelay: `${1.35 + idx * 0.014}s`
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/* Level card — fades in while the progress bar fills and the % counts up.
   Remounted per slide (keyed by index) so the animation replays each time. */
function LevelCard({ level, pct }: { level: string; pct: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(pct);
      return;
    }
    let raf = 0;
    let start = 0;
    const delay = 450;
    const dur = 1100;
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const tick = (t: number) => {
      if (!start) start = t;
      const e = Math.min(1, Math.max(0, (t - start - delay) / dur));
      setShown(Math.round(ease(e) * pct));
      if (e < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pct]);

  return (
    <div className="hero-float absolute left-1 top-4 z-30 rounded-2xl bg-white shadow-lg shadow-slate-900/10 px-4 py-3 w-44">
      <span className="text-[0.62rem] font-bold uppercase tracking-widest text-[#fb4e84]">Nivel actual</span>
      <strong className="block mt-0.5 font-display text-base text-slate-900">{level}</strong>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-blue-100 overflow-hidden">
          <span
            className="hero-bar-fill block h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-8 text-right text-[0.7rem] font-bold tabular-nums text-slate-600">{shown}%</span>
      </div>
    </div>
  );
}

/* Auto-advancing carousel of sport scenes, each with its own level/achievement
   cards. The floating cards live outside the clipped track so they can overhang
   the card edges, and reflect the active slide. The inner track is `h-full` so
   the card stretches to the column height instead of collapsing. A timer line
   drives the auto-advance (via animationend) and pauses on hover. */
function HeroCarousel() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = HERO_SLIDES.length;
  const active = HERO_SLIDES[i];

  return (
    <div
      className="reveal in relative h-full min-h-[24rem]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* clipped sliding track — fills the column height */}
      <div className="relative h-full overflow-hidden rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-gradient-to-br from-blue-50 via-cyan-50 to-white">
        <div className="pointer-events-none absolute -top-10 -right-10 z-0 h-40 w-40 rounded-full bg-purple-200/40 blur-2xl" />
        {/* timer line — drives auto-advance, pauses on hover */}
        <span
          key={`timer-${i}`}
          onAnimationEnd={() => setI((p) => (p + 1) % n)}
          style={{ animationPlayState: paused ? "paused" : "running" }}
          className="hero-timer absolute top-0 left-0 z-20 h-1 rounded-full bg-[#fb4e84]/70"
        />
        <div
          className="flex h-full transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {HERO_SLIDES.map((s) => (
            <div key={s.variant} className="relative z-10 shrink-0 basis-full grid place-items-center p-5 sm:p-7">
              <SportScene variant={s.variant} className="hero-scene w-full max-w-md h-auto" />
            </div>
          ))}
        </div>
        {/* dots */}
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
          {HERO_SLIDES.map((s, idx) => (
            <button
              key={s.variant}
              type="button"
              onClick={() => setI(idx)}
              aria-label={`Mostrar ${s.sport}`}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-[#fb4e84]" : "w-1.5 bg-slate-300 hover:bg-slate-400"}`}
            />
          ))}
        </div>
      </div>

      {/* Level card — fades in, progress bar fills, % counts up */}
      <LevelCard key={`lvl-${i}`} level={active.level} pct={active.pct} />

      {/* Achievement notification — rises from below + confetti + trophy sheen */}
      <div
        key={`ach-${i}`}
        className="hero-notif absolute right-1 bottom-7 z-30 flex items-center gap-2.5 rounded-2xl bg-white shadow-lg shadow-slate-900/10 pl-2 pr-3.5 py-2"
      >
        <Confetti />
        <span className="hero-trophy relative grid place-items-center w-9 h-9 rounded-xl bg-amber-50 text-amber-600 overflow-hidden">
          <Icon name="emoji_events" filled className="relative z-10 text-[1.3rem]" />
          <span className="hero-sheen-el" />
        </span>
        <div>
          <small className="block text-[0.6rem] font-bold uppercase tracking-wider text-amber-600">¡Nuevo logro!</small>
          <p className="font-display text-sm font-bold text-slate-900">{active.achievement}</p>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <SplashBackground />
      <Container className="relative z-10 py-12 sm:py-16">
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Headline card */}
          <div className={`${CARD} reveal in p-7 sm:p-10 flex flex-col justify-center`}>
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-slate-50 border border-slate-200 px-3.5 py-1.5 text-[0.78rem] font-semibold text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-[#fb4e84] shadow-[0_0_0_4px_rgba(251,78,132,0.18)]" />
              Una plataforma · tres experiencias
            </span>
            <h1 className="mt-6 text-4xl sm:text-5xl font-extrabold text-slate-900 leading-[1.04] tracking-tight">
              El deporte de tus hijos, <span className="text-[#fb4e84]">todo en un lugar</span>.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-slate-500 leading-relaxed">
              Atletis conecta a tu club, a las familias y a los profesores en un mismo ecosistema.
              Seguí el progreso, los niveles y los informes — al instante, desde el celular.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#cta" className={BTN_PRIMARY}>
                Empezar ahora <Icon name="arrow_forward" className="text-xl" />
              </a>
              <a href="#apps" className={BTN_GHOST}>
                <Icon name="play_circle" className="text-xl" /> Conocer las apps
              </a>
            </div>
          </div>

          {/* Illustration carousel */}
          <HeroCarousel />
        </div>

        {/* Stat bento row */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {HERO_STATS.map((s) => (
            <div key={s.label} className={`reveal ${PASTEL[s.tone]} rounded-3xl p-6 border border-slate-200/40`}>
              <div className="font-display text-3xl sm:text-4xl font-bold text-slate-900">{s.num}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── Trust strip ─────────────────────────────────────────────────────────── */
function Trust() {
  const items: [string, Tone, string][] = [
    ["pool", "blue", "Natación"],
    ["sports_gymnastics", "red", "Gimnasia"],
    ["sports_soccer", "emerald", "Fútbol"],
    ["sports_tennis", "amber", "Tenis"],
    ["sports_martial_arts", "purple", "Artes marciales"]
  ];
  return (
    <Container className="py-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-y border-slate-200/70 py-5">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
          Para cualquier disciplina deportiva
        </span>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {items.map(([icon, tone, label]) => (
            <span key={label} className="inline-flex items-center gap-2.5 font-display font-bold text-slate-700">
              <FlatIcon name={icon} tone={tone} className="!w-9 !h-9 !rounded-xl" />
              {label}
            </span>
          ))}
        </div>
      </div>
    </Container>
  );
}

/* ── Ecosystem (3 apps) ──────────────────────────────────────────────────── */
type Surface = {
  badge: string;
  artBg: string;
  Art: (props: { className?: string }) => ReactNode;
  title: string;
  role: string;
  blurb: string;
  bullets: string[];
  foot: string;
};

const SURFACES: Surface[] = [
  {
    badge: "Panel web",
    artBg: "bg-blue-50",
    Art: SpotPanel,
    title: "Atletis Web",
    role: "Administración de sede",
    blurb: "El centro de mando del club. Multi-sede nativo: cada sede tiene su catálogo, su staff y sus familias.",
    bullets: [
      "Disciplinas, niveles y biblioteca de recursos",
      "Fichas de alumnos, inscripciones y asignaciones",
      "Informes, comunidades y publicaciones",
      "Usuarios, roles y permisos a medida"
    ],
    foot: "Para directores y administradores"
  },
  {
    badge: "App",
    artBg: "bg-red-50",
    Art: SpotFamily,
    title: "Atletis Familias",
    role: "Padres y tutores",
    blurb: "Las familias siguen el progreso de cada hijo en tiempo real, desde el celular y sin instalar nada de una tienda.",
    bullets: [
      "Nivel actual, objetivos y evolución del alumno",
      "Informes publicados por los profesores",
      "Mensajería directa con el cuerpo técnico",
      "Recursos, multimedia y comunidad de la sede"
    ],
    foot: "Se instala como app · 100% móvil"
  },
  {
    badge: "App",
    artBg: "bg-purple-50",
    Art: SpotCoach,
    title: "Atletis Profesores",
    role: "Cuerpo técnico",
    blurb: "Los profesores gestionan sus clases y registran el avance de cada alumno desde el borde de la pileta o la cancha.",
    bullets: [
      "Sus clases, alumnos y niveles asignados",
      "Cuaderno: informes y seguimiento por alumno",
      "Mensajería y novedades con las familias",
      "Social: publicaciones y momentos de la sede"
    ],
    foot: "Solo ve a los alumnos que le asignaron"
  }
];

function Surfaces() {
  return (
    <section id="apps" className="py-14 sm:py-20">
      <Container>
        <div className="reveal max-w-2xl mx-auto text-center">
          <Eyebrow icon="grid_view" className="justify-center">El ecosistema</Eyebrow>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900">
            Tres apps, una sola fuente de verdad
          </h2>
          <p className="mt-4 text-lg text-slate-500 leading-relaxed">
            Lo que un profesor carga aparece al instante para la familia y queda registrado en el
            panel de la sede. Sin planillas sueltas, sin datos duplicados.
          </p>
        </div>
        <div className="mt-10 grid lg:grid-cols-3 gap-4">
          {SURFACES.map((s) => (
            <article key={s.title} className={`${CARD} reveal p-5 flex flex-col`}>
              <div className={`relative rounded-2xl ${s.artBg} p-4 grid place-items-center`}>
                <s.Art className="w-full h-auto max-h-40" />
                <span className="absolute top-3 right-3 rounded-full bg-white/85 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-slate-600">
                  {s.badge}
                </span>
              </div>
              <h3 className="mt-5 text-2xl font-bold text-slate-900">{s.title}</h3>
              <span className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">{s.role}</span>
              <p className="mt-3 text-slate-500 leading-relaxed">{s.blurb}</p>
              <ul className="mt-4 space-y-2.5 flex-1">
                {s.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[0.95rem] text-slate-700">
                    <Icon name="check_circle" filled className="text-lg text-emerald-500 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Icon name="bolt" filled className="text-base text-amber-500" /> {s.foot}
              </span>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── Functions (bento) ───────────────────────────────────────────────────── */
const FEATURES: { icon: string; tone: Tone; title: string; text: string }[] = [
  { icon: "exercise", tone: "blue", title: "Disciplinas y niveles", text: "Catálogo de disciplinas con niveles ordenables y una biblioteca de recursos con visibilidad configurable." },
  { icon: "groups", tone: "red", title: "Alumnos", text: "Ficha completa: inscripción a disciplinas y niveles, asignación de profesores y tutores, informes y mensajería." },
  { icon: "forum", tone: "purple", title: "Comunidades", text: "Comunidades por sede con miembros y publicaciones, para mantener a las familias conectadas con el club." },
  { icon: "monitoring", tone: "emerald", title: "Informes y seguimiento", text: "Los profesores registran avances y publican informes; las familias los reciben al instante en su app." },
  { icon: "apartment", tone: "amber", title: "Multi-sede nativo", text: "Cada sede es independiente, con su propio equipo y familias. El multi-sede se resuelve sin fricción." },
  { icon: "chat", tone: "cyan", title: "Mensajería contextual", text: "Conversaciones ancladas a cada alumno, para que el diálogo entre familia y profesor no se pierda." }
];

function Features() {
  return (
    <section id="funciones" className="relative py-14 sm:py-20">
      <Container>
        <div className="reveal max-w-2xl">
          <Eyebrow icon="auto_awesome">Qué resuelve</Eyebrow>
          <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900">
            Todo lo que tu club necesita, sin complicaciones
          </h2>
          <p className="mt-4 text-lg text-slate-500 leading-relaxed">
            Atletis reúne la gestión deportiva en funciones simples y claras. Activás solo lo que tu
            sede necesita y cada pieza llega lista para usar.
          </p>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <article key={f.title} className={`${CARD} reveal p-6 transition hover:-translate-y-1`}>
              <FlatIcon name={f.icon} tone={f.tone} />
              <h4 className="mt-4 text-xl font-bold text-slate-900">{f.title}</h4>
              <p className="mt-2 text-[0.95rem] text-slate-500 leading-relaxed">{f.text}</p>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}

/* ── Roles ───────────────────────────────────────────────────────────────── */
const ROLES: { icon: string; tone: Tone; title: string; text: string }[] = [
  { icon: "shield_person", tone: "blue", title: "Super Admin", text: "Acceso total a toda la organización y todas las sedes." },
  { icon: "admin_panel_settings", tone: "red", title: "Admin Sede", text: "Gestiona su(s) sede(s): staff, alumnos, catálogo y comunidad." },
  { icon: "sports", tone: "emerald", title: "Profesor", text: "Solo los alumnos donde está asignado; crea informes y conversaciones." },
  { icon: "family_restroom", tone: "purple", title: "Tutor", text: "Solo sus alumnos vinculados; ve informes y participa del chat." }
];

function Roles() {
  return (
    <section id="roles" className="py-14 sm:py-20">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-7 sm:p-10">
          <Aurora />
          <div className="relative reveal max-w-2xl">
            <Eyebrow icon="verified_user">Para cada quien</Eyebrow>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900">
              Cada persona ve exactamente lo que le corresponde
            </h2>
            <p className="mt-4 text-lg text-slate-500 leading-relaxed">
              Atletis cuida la privacidad de cada familia. Los permisos son finos: cada rol accede
              solo a la información que necesita, sin exponer la del resto.
            </p>
          </div>
          <div className="relative mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {ROLES.map((r) => (
              <div key={r.title} className="reveal rounded-2xl bg-slate-50 border border-slate-200/60 p-5">
                <FlatIcon name={r.icon} tone={r.tone} />
                <h4 className="mt-4 text-lg font-bold text-slate-900">{r.title}</h4>
                <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ── Grow (illustration + points) ────────────────────────────────────────── */
function Grow() {
  const points: { icon: string; tone: Tone; title: string; text: string }[] = [
    { icon: "extension", tone: "blue", title: "Activás solo lo que usás", text: "Disciplinas, alumnos, comunidades… sumás las piezas que tu sede necesita, cuando las necesita." },
    { icon: "rocket_launch", tone: "red", title: "Listo para usar", text: "Cada función llega con su pantalla, sus permisos y su lugar en el menú. Sin configuraciones eternas." },
    { icon: "favorite", tone: "purple", title: "Pensado para familias", text: "Una experiencia simple y cálida para que padres y chicos disfruten cada logro del camino." }
  ];
  return (
    <section id="crece" className="py-14 sm:py-20">
      <Container>
        <div className="grid lg:grid-cols-2 gap-4 items-stretch">
          <div className="reveal relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-50 via-blue-50 to-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 grid place-items-center">
            <div className="pointer-events-none absolute -bottom-10 -left-10 h-44 w-44 rounded-full bg-rose-200/40 blur-2xl" />
            <SpotBlocks className="relative w-full max-w-sm h-auto" />
          </div>
          <div className={`${CARD} reveal p-7 sm:p-10`}>
            <Eyebrow icon="trending_up">Crece con vos</Eyebrow>
            <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold text-slate-900">
              Una plataforma que acompaña a tu club
            </h2>
            <p className="mt-4 text-lg text-slate-500 leading-relaxed">
              Atletis se arma como bloques: empezás simple y vas sumando funciones a medida que tu
              sede crece, siempre con la misma experiencia clara.
            </p>
            <div className="mt-8 space-y-5">
              {points.map((p) => (
                <div key={p.title} className="flex gap-4">
                  <FlatIcon name={p.icon} tone={p.tone} />
                  <div>
                    <h4 className="text-lg font-bold text-slate-900">{p.title}</h4>
                    <p className="mt-1 text-[0.95rem] text-slate-500 leading-relaxed">{p.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ── CTA ─────────────────────────────────────────────────────────────────── */
function CTA() {
  return (
    <section id="cta" className="py-10 sm:py-16">
      <Container>
        <div className="reveal relative overflow-hidden rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] bg-gradient-to-br from-blue-50 via-purple-50 to-rose-50 px-6 py-14 sm:py-20 text-center">
          <Aurora />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-3xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              Llevá tu club al siguiente nivel
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600 leading-relaxed">
              Un panel para administrar tu sede, una app para cada familia y una app para cada
              profesor. Pedí una demo y la armamos con los datos de tu club.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href="mailto:hola@atletis.app?subject=Quiero%20una%20demo%20de%20Atletis" className={BTN_PRIMARY}>
                <Icon name="mail" className="text-xl" /> Solicitar demo
              </a>
              <a href="#apps" className={BTN_GHOST}>
                <Icon name="explore" className="text-xl" /> Recorrer el ecosistema
              </a>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="py-12">
      <Container>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="max-w-xs">
            <a href="#top" className="flex items-center gap-2.5">
              <span className="grid place-items-center w-10 h-10 rounded-2xl bg-gradient-to-br from-[#ff7aa6] to-[#fb4e84] text-white">
                <Icon name="exercise" filled className="text-[1.35rem]" />
              </span>
              <span className="font-display text-xl font-extrabold text-slate-900">Atletis</span>
            </a>
            <p className="mt-4 text-[0.95rem] text-slate-500 leading-relaxed">
              La plataforma de gestión deportiva que conecta a la sede, las familias y el cuerpo
              técnico en un mismo ecosistema.
            </p>
          </div>
          {[
            { h: "Plataforma", links: [["Panel web", "#apps"], ["App de familias", "#apps"], ["App de profesores", "#apps"]] },
            { h: "Producto", links: [["Funciones", "#funciones"], ["Roles y permisos", "#roles"], ["Crece con vos", "#crece"]] },
            { h: "Empezar", links: [["Solicitar demo", "#cta"], ["Contacto", "mailto:hola@atletis.app"]] }
          ].map((col) => (
            <div key={col.h}>
              <h5 className="font-display text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{col.h}</h5>
              <div className="mt-4 space-y-3">
                {col.links.map(([label, href]) => (
                  <a key={label} href={href} className="block text-[0.95rem] text-slate-600 hover:text-slate-900 transition">
                    {label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-10 pt-6 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <span>© {new Date().getFullYear()} Atletis · Plataforma de gestión deportiva</span>
          <span>Hecho con cariño para clubes, academias y escuelas deportivas.</span>
        </div>
      </Container>
    </footer>
  );
}

export default function App() {
  useScrollReveal();
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Trust />
        <Surfaces />
        <Features />
        <Roles />
        <Grow />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
