import { useEffect, type ReactNode } from "react";
import { HeroScene, SpotPanel, SpotFamily, SpotCoach, SpotBlocks } from "./illustrations";

/* Material Symbols Rounded helper (font is loaded in index.html). */
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

type Tone = "teal" | "coral" | "green" | "sand" | "lilac";

/* Flat icon chip — Material Symbol on a soft pastel rounded square. */
function FlatIcon({ name, tone = "teal", className }: { name: string; tone?: Tone; className?: string }) {
  return (
    <span className={`flat-icon tone-${tone}${className ? ` ${className}` : ""}`}>
      <Icon name={name} filled />
    </span>
  );
}

/* Lightweight scroll-reveal: adds `.in` to `.reveal` elements as they enter. */
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

function Section({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`section${className ? ` ${className}` : ""}`}>
      <div className="shell">{children}</div>
    </section>
  );
}

function Nav() {
  return (
    <header className="nav">
      <div className="shell nav-inner">
        <a className="brand" href="#top">
          <span className="brand-logo">
            <Icon name="exercise" filled />
          </span>
          <span className="brand-name">Atletis</span>
        </a>
        <nav className="nav-links">
          <a href="#apps">Plataforma</a>
          <a href="#modulos">Funciones</a>
          <a href="#roles">Para cada quien</a>
          <a href="#crece">Crece con vos</a>
        </nav>
        <div className="nav-cta">
          <a className="btn btn-ghost" href="#apps">
            Ver el ecosistema
          </a>
          <a className="btn btn-primary" href="#cta">
            Solicitar demo
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <div className="hero" id="top">
      <div className="shell hero-grid">
        <div className="reveal in">
          <span className="hero-pill">
            <span className="dot" /> Una plataforma · tres experiencias conectadas
          </span>
          <h1>
            El deporte de tus hijos, <em>todo en un solo lugar</em>.
          </h1>
          <p className="hero-lead">
            Atletis conecta a tu club, a las familias y a los profesores en un mismo ecosistema.
            Seguí el progreso, los niveles, los informes y la comunidad — al instante y desde el
            celular.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#cta">
              Empezar ahora <Icon name="arrow_forward" />
            </a>
            <a className="btn btn-ghost" href="#apps">
              <Icon name="play_circle" /> Conocer las apps
            </a>
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <strong>3</strong>
              <span>Apps en un ecosistema</span>
            </div>
            <div className="hero-stat">
              <strong>4</strong>
              <span>Roles, cada quien lo suyo</span>
            </div>
            <div className="hero-stat">
              <strong>+10</strong>
              <span>Disciplinas deportivas</span>
            </div>
          </div>
        </div>

        <div className="hero-visual reveal in">
          <div className="hero-art">
            <HeroScene className="hero-illustration" />
            {/* friendly floating product hints */}
            <div className="float-card level" aria-hidden="true">
              <span className="float-kicker">Nivel actual</span>
              <strong>Delfín · Nivel 3</strong>
              <div className="float-bar">
                <span style={{ width: "72%" }} />
              </div>
            </div>
            <div className="float-chip" aria-hidden="true">
              <FlatIcon name="emoji_events" tone="sand" />
              <div>
                <small>¡Nuevo logro!</small>
                <p>Respiración bilateral</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Trust() {
  const items: [string, Tone, string][] = [
    ["pool", "teal", "Natación"],
    ["sports_gymnastics", "coral", "Gimnasia"],
    ["sports_soccer", "green", "Fútbol"],
    ["sports_tennis", "sand", "Tenis"],
    ["sports_martial_arts", "lilac", "Artes marciales"]
  ];
  return (
    <div className="trust">
      <div className="shell trust-inner">
        <span className="trust-label">Pensado para cualquier disciplina deportiva</span>
        <div className="trust-items">
          {items.map(([icon, tone, label]) => (
            <span className="trust-item" key={label}>
              <FlatIcon name={icon} tone={tone} /> {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type Surface = {
  badge: string;
  tone: Tone;
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
    tone: "teal",
    Art: SpotPanel,
    title: "Atletis Web",
    role: "Administración de sede",
    blurb:
      "El centro de mando del club. Multi-sede nativo: cada sede tiene su catálogo, su staff y sus familias.",
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
    tone: "coral",
    Art: SpotFamily,
    title: "Atletis Familias",
    role: "Padres y tutores",
    blurb:
      "Las familias siguen el progreso de cada hijo en tiempo real, desde el celular y sin instalar nada de una tienda.",
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
    tone: "green",
    Art: SpotCoach,
    title: "Atletis Profesores",
    role: "Cuerpo técnico",
    blurb:
      "Los profesores gestionan sus clases y registran el avance de cada alumno desde el borde de la pileta o la cancha.",
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
    <Section id="apps">
      <div className="section-head center reveal">
        <span className="eyebrow">
          <Icon name="grid_view" /> El ecosistema
        </span>
        <h2>Tres apps, una sola fuente de verdad</h2>
        <p>
          Lo que un profesor carga aparece al instante para la familia y queda registrado en el panel
          de la sede. Sin planillas sueltas, sin datos duplicados.
        </p>
      </div>
      <div className="surfaces">
        {SURFACES.map((s) => (
          <article className={`surface-card tone-${s.tone} reveal`} key={s.title}>
            <div className="surface-art">
              <s.Art className="surface-illustration" />
              <span className="badge">{s.badge}</span>
            </div>
            <h3>{s.title}</h3>
            <span className="surface-role">{s.role}</span>
            <p>{s.blurb}</p>
            <ul className="surface-list">
              {s.bullets.map((b) => (
                <li key={b}>
                  <Icon name="check_circle" filled /> {b}
                </li>
              ))}
            </ul>
            <span className="surface-foot">
              <Icon name="bolt" filled /> {s.foot}
            </span>
          </article>
        ))}
      </div>
    </Section>
  );
}

const FEATURES: { icon: string; tone: Tone; title: string; text: string }[] = [
  {
    icon: "exercise",
    tone: "teal",
    title: "Disciplinas y niveles",
    text: "Catálogo de disciplinas con niveles ordenables y una biblioteca de recursos con visibilidad configurable."
  },
  {
    icon: "groups",
    tone: "coral",
    title: "Alumnos",
    text: "Ficha completa: inscripción a disciplinas y niveles, asignación de profesores y tutores, informes y mensajería."
  },
  {
    icon: "forum",
    tone: "green",
    title: "Comunidades",
    text: "Comunidades por sede con miembros y publicaciones, para mantener a las familias conectadas con el club."
  },
  {
    icon: "monitoring",
    tone: "sand",
    title: "Informes y seguimiento",
    text: "Los profesores registran avances y publican informes; las familias los reciben al instante en su app."
  },
  {
    icon: "apartment",
    tone: "lilac",
    title: "Multi-sede nativo",
    text: "Cada sede es independiente, con su propio equipo y familias. El multi-sede se resuelve sin fricción."
  },
  {
    icon: "chat",
    tone: "teal",
    title: "Mensajería contextual",
    text: "Conversaciones ancladas a cada alumno, para que el diálogo entre familia y profesor no se pierda."
  }
];

function Features() {
  return (
    <Section id="modulos">
      <div className="section-head reveal">
        <span className="eyebrow">
          <Icon name="auto_awesome" /> Qué resuelve
        </span>
        <h2>Todo lo que tu club necesita, sin complicaciones</h2>
        <p>
          Atletis reúne la gestión deportiva en funciones simples y claras. Activás solo lo que tu
          sede necesita y cada pieza llega lista para usar.
        </p>
      </div>
      <div className="feature-grid">
        {FEATURES.map((f) => (
          <article className="feature-card reveal" key={f.title}>
            <FlatIcon name={f.icon} tone={f.tone} className="feature-chip" />
            <h4>{f.title}</h4>
            <p>{f.text}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

const ROLES: { icon: string; tone: Tone; title: string; text: string }[] = [
  { icon: "shield_person", tone: "teal", title: "Super Admin", text: "Acceso total a toda la organización y todas las sedes." },
  { icon: "admin_panel_settings", tone: "coral", title: "Admin Sede", text: "Gestiona su(s) sede(s): staff, alumnos, catálogo y comunidad." },
  { icon: "sports", tone: "green", title: "Profesor", text: "Solo los alumnos donde está asignado; crea informes y conversaciones." },
  { icon: "family_restroom", tone: "sand", title: "Tutor", text: "Solo sus alumnos vinculados; ve informes y participa del chat." }
];

function Roles() {
  return (
    <Section id="roles">
      <div className="roles reveal">
        <div className="roles-head">
          <span className="eyebrow">
            <Icon name="verified_user" /> Para cada quien
          </span>
          <h2>Cada persona ve exactamente lo que le corresponde</h2>
          <p>
            Atletis cuida la privacidad de cada familia. Los permisos son finos: cada rol accede solo
            a la información que necesita, sin exponer la del resto.
          </p>
        </div>
        <div className="roles-grid">
          {ROLES.map((r) => (
            <div className="role-card" key={r.title}>
              <FlatIcon name={r.icon} tone={r.tone} />
              <h4>{r.title}</h4>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Grow() {
  const points: { icon: string; tone: Tone; title: string; text: string }[] = [
    {
      icon: "extension",
      tone: "teal",
      title: "Activás solo lo que usás",
      text: "Disciplinas, alumnos, comunidades… sumás las piezas que tu sede necesita, cuando las necesita."
    },
    {
      icon: "rocket_launch",
      tone: "coral",
      title: "Listo para usar",
      text: "Cada función llega con su pantalla, sus permisos y su lugar en el menú. Sin configuraciones eternas."
    },
    {
      icon: "favorite",
      tone: "green",
      title: "Pensado para familias",
      text: "Una experiencia simple y cálida para que padres y chicos disfruten cada logro del camino."
    }
  ];
  return (
    <Section id="crece">
      <div className="grow-grid">
        <div className="grow-art reveal">
          <SpotBlocks className="grow-illustration" />
        </div>
        <div>
          <div className="section-head reveal">
            <span className="eyebrow">
              <Icon name="trending_up" /> Crece con vos
            </span>
            <h2>Una plataforma que acompaña a tu club</h2>
            <p>
              Atletis se arma como bloques: empezás simple y vas sumando funciones a medida que tu
              sede crece, siempre con la misma experiencia clara.
            </p>
          </div>
          <div className="grow-points">
            {points.map((p) => (
              <div className="grow-point reveal" key={p.title}>
                <FlatIcon name={p.icon} tone={p.tone} />
                <div>
                  <h4>{p.title}</h4>
                  <p>{p.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function CTA() {
  return (
    <Section id="cta">
      <div className="cta-band reveal">
        <span className="cta-blob blob-1" aria-hidden="true" />
        <span className="cta-blob blob-2" aria-hidden="true" />
        <div className="cta-inner">
          <h2>Llevá tu club al siguiente nivel</h2>
          <p>
            Un panel para administrar tu sede, una app para cada familia y una app para cada
            profesor. Pedí una demo y la armamos con los datos de tu club.
          </p>
          <div className="cta-actions">
            <a
              className="btn btn-light"
              href="mailto:hola@atletis.app?subject=Quiero%20una%20demo%20de%20Atletis"
            >
              <Icon name="mail" /> Solicitar demo
            </a>
            <a className="btn btn-light" href="#apps">
              <Icon name="explore" /> Recorrer el ecosistema
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer-grid">
          <div className="footer-about">
            <a className="brand" href="#top">
              <span className="brand-logo">
                <Icon name="exercise" filled />
              </span>
              <span className="brand-name">Atletis</span>
            </a>
            <p>
              La plataforma de gestión deportiva que conecta a la sede, las familias y el cuerpo
              técnico en un mismo ecosistema.
            </p>
          </div>
          <div className="footer-col">
            <h5>Plataforma</h5>
            <a href="#apps">Panel web</a>
            <a href="#apps">App de familias</a>
            <a href="#apps">App de profesores</a>
          </div>
          <div className="footer-col">
            <h5>Producto</h5>
            <a href="#modulos">Funciones</a>
            <a href="#roles">Roles y permisos</a>
            <a href="#crece">Crece con vos</a>
          </div>
          <div className="footer-col">
            <h5>Empezar</h5>
            <a href="#cta">Solicitar demo</a>
            <a href="mailto:hola@atletis.app">Contacto</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Atletis · Plataforma de gestión deportiva</span>
          <span>Hecho con cariño para clubes, academias y escuelas deportivas.</span>
        </div>
      </div>
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
