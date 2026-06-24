import { useEffect, type ReactNode } from "react";

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
            <Icon name="hub" filled />
          </span>
          <span className="brand-name">Sinapsis</span>
        </a>
        <nav className="nav-links">
          <a href="#apps">Plataforma</a>
          <a href="#modulos">Módulos</a>
          <a href="#roles">Roles</a>
          <a href="#extensible">Extensible</a>
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
            Gestioná tu club como un equipo de <em>alto rendimiento</em>.
          </h1>
          <p className="hero-lead">
            Sinapsis reúne la gestión de tu sede, la app de las familias y la app de los profesores en
            un mismo ecosistema. Disciplinas, alumnos, niveles, informes y comunidades — todo
            sincronizado, en tiempo real.
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
              <span>Roles con permisos finos</span>
            </div>
            <div className="hero-stat">
              <strong>∞</strong>
              <span>Módulos plug-and-play</span>
            </div>
          </div>
        </div>

        <div className="hero-visual reveal in" aria-hidden="true">
          <span className="glow" />
          {/* Back phone — professor view */}
          <div className="phone back">
            <div className="phone-screen">
              <div className="mini-row">
                <span className="mini-avatar">P</span>
                <div>
                  <span className="mini-kicker">Profesor</span>
                  <h5>Mis clases</h5>
                </div>
              </div>
              <div className="mini-card">
                <small>Hoy · 18:00</small>
                <strong>Natación · Nivel 3</strong>
                <div className="mini-chips">
                  <span className="mini-chip">12 alumnos</span>
                  <span className="mini-chip green">Pileta A</span>
                </div>
              </div>
              <div className="mini-card">
                <small>Cuaderno</small>
                <strong>3 informes</strong>
              </div>
            </div>
          </div>
          {/* Front phone — parent view */}
          <div className="phone front">
            <div className="phone-screen">
              <div className="mini-row">
                <span className="mini-avatar">M</span>
                <div>
                  <span className="mini-kicker">Familia</span>
                  <h5>Mateo, 9</h5>
                </div>
              </div>
              <div className="mini-card brand">
                <small>Nivel actual</small>
                <strong>Delfín · Nivel 3</strong>
                <div className="mini-bar">
                  <span style={{ width: "72%" }} />
                </div>
              </div>
              <div className="mini-card accent">
                <small>Objetivo de la semana</small>
                <strong>Respiración bilateral</strong>
              </div>
              <div className="mini-chips">
                <span className="mini-chip">Informe nuevo</span>
                <span className="mini-chip green">Mensaje del profe</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Trust() {
  const items: [string, string][] = [
    ["pool", "Natación"],
    ["sports_gymnastics", "Gimnasia"],
    ["sports_soccer", "Fútbol"],
    ["sports_tennis", "Tenis"],
    ["sports_martial_arts", "Artes marciales"]
  ];
  return (
    <div className="trust">
      <div className="shell trust-inner">
        <span className="trust-label">Pensado para cualquier disciplina deportiva</span>
        <div className="trust-items">
          {items.map(([icon, label]) => (
            <span className="trust-item" key={label}>
              <Icon name={icon} /> {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type Surface = {
  badge: string;
  tone: "teal" | "orange" | "green";
  icon: string;
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
    icon: "dashboard",
    title: "Sinapsis Web",
    role: "Administración de sede",
    blurb:
      "El centro de mando del club. Multi-sede nativo: cada sede es su propia compañía, con su catálogo, su staff y sus familias.",
    bullets: [
      "Disciplinas, niveles ordenables y biblioteca de recursos",
      "Fichas de alumnos, inscripciones y asignaciones",
      "Informes, comunidades y publicaciones",
      "ABM de usuarios, roles y permisos (RBAC)"
    ],
    foot: "Para directores y administradores"
  },
  {
    badge: "PWA",
    tone: "orange",
    icon: "family_restroom",
    title: "App de Familias",
    role: "Padres y tutores",
    blurb:
      "Las familias siguen el progreso de cada hijo en tiempo real, desde el celular y sin instalar nada de una tienda.",
    bullets: [
      "Nivel actual, objetivos y evolución del alumno",
      "Informes publicados por los profesores",
      "Mensajería directa con el cuerpo técnico",
      "Recursos, multimedia y comunidad de la sede"
    ],
    foot: "Instalable como app · 100% móvil"
  },
  {
    badge: "PWA",
    tone: "green",
    icon: "sports",
    title: "App de Profesores",
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
          <article className="surface-card reveal" key={s.title}>
            <span className="badge">{s.badge}</span>
            <div className={`surface-icon ${s.tone}`}>
              <Icon name={s.icon} filled />
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

const FEATURES = [
  {
    icon: "exercise",
    title: "Disciplinas y niveles",
    text: "Catálogo de disciplinas a nivel organización, con niveles ordenables y una biblioteca de recursos con visibilidad configurable."
  },
  {
    icon: "groups",
    title: "Alumnos",
    text: "Ficha completa: inscripción a disciplinas y niveles, asignación de profesores y tutores, informes y mensajería por alumno."
  },
  {
    icon: "forum",
    title: "Comunidades",
    text: "Comunidades por sede con miembros y publicaciones, para mantener a las familias conectadas con la vida del club."
  },
  {
    icon: "monitoring",
    title: "Informes y seguimiento",
    text: "Los profesores registran avances y publican informes; las familias los reciben con estado PUBLICADO o solo-tutores."
  },
  {
    icon: "apartment",
    title: "Multi-sede nativo",
    text: "Cada sede se modela como una compañía. Un Admin de Sede ve lo suyo; el multi-sede se resuelve con accesos adicionales."
  },
  {
    icon: "chat",
    title: "Mensajería contextual",
    text: "Conversaciones ancladas a cada alumno, para que el diálogo entre familia y cuerpo técnico no se pierda en el chat general."
  }
];

function Features() {
  return (
    <Section id="modulos">
      <div className="section-head reveal">
        <span className="eyebrow">
          <Icon name="widgets" /> Qué resuelve
        </span>
        <h2>Toda la gestión deportiva, en módulos</h2>
        <p>
          Sinapsis nace de un framework de módulos. Activás solo lo que tu sede necesita y cada
          módulo trae su UI, su API y sus permisos listos para usar.
        </p>
      </div>
      <div className="feature-grid">
        {FEATURES.map((f) => (
          <article className="feature-card reveal" key={f.title}>
            <div className="fi">
              <Icon name={f.icon} filled />
            </div>
            <h4>{f.title}</h4>
            <p>{f.text}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

const ROLES = [
  {
    icon: "shield_person",
    title: "Super Admin",
    text: "Acceso total a toda la organización y todas las sedes."
  },
  {
    icon: "admin_panel_settings",
    title: "Admin Sede",
    text: "Gestiona su(s) compañía(s): staff, alumnos, catálogo y comunidad."
  },
  {
    icon: "sports",
    title: "Profesor",
    text: "Solo los alumnos donde está asignado; crea informes y conversaciones."
  },
  {
    icon: "family_restroom",
    title: "Tutor",
    text: "Solo sus alumnos vinculados; ve informes publicados y participa del chat."
  }
];

function Roles() {
  return (
    <Section id="roles">
      <div className="roles reveal">
        <div className="roles-head">
          <span className="eyebrow">
            <Icon name="lock" /> Permisos finos
          </span>
          <h2>Cada quien ve exactamente lo que le corresponde</h2>
          <p>
            El control de acceso por roles (RBAC) está integrado en el framework. El acceso grueso lo
            resuelve el middleware; el scoping fino vive en cada módulo, resuelto desde la identidad
            del usuario.
          </p>
        </div>
        <div className="roles-grid">
          {ROLES.map((r) => (
            <div className="role-card" key={r.title}>
              <Icon name={r.icon} filled />
              <h4>{r.title}</h4>
              <p>{r.text}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Modules() {
  return (
    <Section id="extensible">
      <div className="section-head reveal">
        <span className="eyebrow">
          <Icon name="extension" /> Arquitectura
        </span>
        <h2>Extensible por diseño, plug-and-play</h2>
        <p>
          Cada módulo es una pieza autocontenida: manifest, migraciones, hooks de instalación y su
          mitad de cliente y servidor. Se instala, se actualiza y se desinstala sin tocar el núcleo.
        </p>
      </div>
      <div className="modules-grid">
        <div className="code-card reveal">
          <div className="code-top">
            <span className="dot r" />
            <span className="dot y" />
            <span className="dot g" />
            <span>terminal</span>
          </div>
          <pre className="code-body">
            <code>
              <span className="c"># Instalar un módulo en tu sede</span>
              {"\n"}
              <span className="k">pnpm</span> module:install <span className="s">disciplines</span>
              {"\n"}
              <span className="k">pnpm</span> module:install <span className="s">students</span>
              {"\n"}
              <span className="k">pnpm</span> module:install <span className="s">communities</span>
              {"\n\n"}
              <span className="c"># Corre migraciones + siembra roles,</span>
              {"\n"}
              <span className="c"># permisos y el menú del sidebar.</span>
              {"\n"}
              <span className="k">✓</span> 3 módulos activos
            </code>
          </pre>
        </div>
        <div className="module-points">
          {[
            {
              icon: "deployed_code",
              title: "Autocontenido",
              text: "client/ + server/ + migrations/ + module.json. Cada módulo trae todo lo que necesita."
            },
            {
              icon: "database",
              title: "Migraciones seguras",
              text: "Instalar aplica solo las migraciones pendientes; desinstalar conserva los datos salvo que pidas purgarlos."
            },
            {
              icon: "menu_open",
              title: "Se integra solo",
              text: "Al instalar, el módulo siembra sus roles, permisos y su grupo de menú: aparece en el panel automáticamente."
            }
          ].map((p) => (
            <div className="module-point reveal" key={p.title}>
              <div className="mp-icon">
                <Icon name={p.icon} filled />
              </div>
              <div>
                <h4>{p.title}</h4>
                <p>{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function CTA() {
  return (
    <Section id="cta">
      <div className="cta-band reveal">
        <h2>Llevá tu club al siguiente nivel</h2>
        <p>
          Una plataforma para administrar tu sede, una app para cada familia y una app para cada
          profesor. Pedí una demo y la armamos con los datos de tu club.
        </p>
        <div className="cta-actions">
          <a className="btn btn-light" href="mailto:hola@sinapsis.app?subject=Quiero%20una%20demo%20de%20Sinapsis">
            <Icon name="mail" /> Solicitar demo
          </a>
          <a className="btn btn-light" href="#apps">
            <Icon name="explore" /> Recorrer el ecosistema
          </a>
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
                <Icon name="hub" filled />
              </span>
              <span className="brand-name">Sinapsis</span>
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
            <a href="#modulos">Módulos</a>
            <a href="#roles">Roles y permisos</a>
            <a href="#extensible">Arquitectura</a>
          </div>
          <div className="footer-col">
            <h5>Empezar</h5>
            <a href="#cta">Solicitar demo</a>
            <a href="mailto:hola@sinapsis.app">Contacto</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Sinapsis · Plataforma de gestión deportiva</span>
          <span>Hecho con foco en clubes, academias y escuelas deportivas.</span>
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
        <Modules />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
