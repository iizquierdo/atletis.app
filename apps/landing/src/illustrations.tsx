/* ───────────────────────────────────────────────────────────────────────────
   Atletis · Flat illustrations
   Hand-built SVGs in a flat, friendly, pastel style for a family audience.
   Solid pastel fills, rounded shapes, no photographic assets.
   ─────────────────────────────────────────────────────────────────────────── */

const PASTEL = {
  water: "#bfeeff",
  waterMid: "#9fe0f5",
  waterDeep: "#7cd0ee",
  sky: "#e7f6fb",
  sun: "#ffd07a",
  sunSoft: "#ffe2b0",
  cloud: "#ffffff",
  skin: "#ffd9b8",
  cheek: "#ffb39c",
  teal: "#0a858c",
  tealDeep: "#00666d",
  coral: "#ff8a6b",
  green: "#7fd89a",
  greenDeep: "#3fb46e",
  gold: "#ffd166",
  ink: "#0c2b33",
  lilac: "#cdd6ff",
  sand: "#ffe1bc"
};

export type SportVariant = "swim" | "soccer" | "gym" | "basket";

const SCENE: Record<
  SportVariant,
  { backdrop: string; jersey: string; ribbon: string; label: string }
> = {
  swim: { backdrop: "#e7f6fb", jersey: "#ff8a6b", ribbon: "#0a858c", label: "niño nadador" },
  soccer: { backdrop: "#e9f7e4", jersey: "#16a34a", ribbon: "#15803d", label: "niño futbolista" },
  gym: { backdrop: "#f1eafd", jersey: "#a855f7", ribbon: "#7c3aed", label: "gimnasta" },
  basket: { backdrop: "#fdf1e5", jersey: "#f97316", ribbon: "#c2410c", label: "jugador de básquet" }
};

/* Head accessory per sport. */
function Head({ variant }: { variant: SportVariant }) {
  const hair = "#5a3b2e";
  return (
    <>
      <circle cx="240" cy="196" r="42" fill={PASTEL.skin} />
      {variant === "swim" && (
        <>
          <path d="M198 192 a42 42 0 0 1 84 0 z" fill={PASTEL.teal} />
          <path d="M198 192 a42 42 0 0 1 84 0" fill="none" stroke={PASTEL.tealDeep} strokeWidth="3" opacity="0.4" />
          <g>
            <circle cx="224" cy="184" r="9" fill={PASTEL.water} stroke={PASTEL.tealDeep} strokeWidth="3" />
            <circle cx="256" cy="184" r="9" fill={PASTEL.water} stroke={PASTEL.tealDeep} strokeWidth="3" />
            <line x1="233" y1="184" x2="247" y2="184" stroke={PASTEL.tealDeep} strokeWidth="3" />
          </g>
        </>
      )}
      {variant === "soccer" && (
        <path d="M196 196 a44 44 0 0 1 88 0 q-22 -10 -44 -10 t-44 10 z" fill={hair} />
      )}
      {variant === "gym" && (
        <>
          <path d="M196 196 a44 44 0 0 1 88 0 q-22 -10 -44 -10 t-44 10 z" fill={hair} />
          <circle cx="240" cy="150" r="14" fill={hair} />
          <path d="M201 182 q39 -16 78 0" fill="none" stroke="#ff5ea0" strokeWidth="6" strokeLinecap="round" />
        </>
      )}
      {variant === "basket" && (
        <>
          <path d="M198 192 a42 42 0 0 1 84 0 z" fill="#3a2b26" />
          <path d="M200 184 a40 40 0 0 1 80 0" fill="none" stroke="#f97316" strokeWidth="9" strokeLinecap="round" />
        </>
      )}
      {/* face */}
      <circle cx="227" cy="206" r="3.4" fill={PASTEL.ink} />
      <circle cx="253" cy="206" r="3.4" fill={PASTEL.ink} />
      <path d="M228 216 q12 11 24 0" fill="none" stroke={PASTEL.ink} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="216" cy="212" r="6" fill={PASTEL.cheek} opacity="0.7" />
      <circle cx="264" cy="212" r="6" fill={PASTEL.cheek} opacity="0.7" />
    </>
  );
}

/* Ground band + sport prop per sport. */
function Ground({ variant }: { variant: SportVariant }) {
  if (variant === "swim") {
    return (
      <>
        <path d="M40 286 q60 -22 120 0 t120 0 t120 0 t60 0 v94 a40 40 0 0 1 -40 40 H80 a40 40 0 0 1 -40 -40 z" fill={PASTEL.water} />
        <path d="M40 300 q60 -20 120 0 t120 0 t120 0 t60 0 v80 a40 40 0 0 1 -40 40 H80 a40 40 0 0 1 -40 -40 z" fill={PASTEL.waterMid} />
        <path d="M40 318 q60 -20 120 0 t120 0 t120 0 t60 0 v62 a40 40 0 0 1 -40 40 H80 a40 40 0 0 1 -40 -40 z" fill={PASTEL.waterDeep} />
        <g stroke="#ffffff" strokeWidth="5" strokeLinecap="round" opacity="0.7">
          <line x1="96" y1="344" x2="128" y2="344" />
          <line x1="330" y1="356" x2="368" y2="356" />
          <line x1="180" y1="372" x2="206" y2="372" />
        </g>
        <g fill="#ffffff">
          <circle cx="170" cy="290" r="6" />
          <circle cx="158" cy="278" r="4" />
          <circle cx="312" cy="290" r="6" />
          <circle cx="326" cy="278" r="4" />
        </g>
      </>
    );
  }
  if (variant === "soccer") {
    return (
      <>
        <path d="M40 292 q60 -20 120 0 t120 0 t120 0 t60 0 v88 a40 40 0 0 1 -40 40 H80 a40 40 0 0 1 -40 -40 z" fill="#76c259" />
        <path d="M40 308 q60 -18 120 0 t120 0 t120 0 t60 0 v72 a40 40 0 0 1 -40 40 H80 a40 40 0 0 1 -40 -40 z" fill="#8ed06a" />
        <g stroke="#6cbf54" strokeWidth="5" strokeLinecap="round" opacity="0.8">
          <line x1="120" y1="356" x2="120" y2="346" />
          <line x1="132" y1="358" x2="132" y2="348" />
          <line x1="360" y1="360" x2="360" y2="350" />
        </g>
        {/* soccer ball */}
        <circle cx="322" cy="330" r="20" fill="#ffffff" stroke="#cdd6dd" strokeWidth="2" />
        <path d="M322 320 l8 6 -3 9 -10 0 -3 -9 z" fill="#22303a" />
        <g stroke="#22303a" strokeWidth="2.4" strokeLinecap="round">
          <line x1="322" y1="312" x2="322" y2="320" />
          <line x1="330" y1="326" x2="338" y2="322" />
          <line x1="319" y1="335" x2="312" y2="343" />
          <line x1="325" y1="335" x2="332" y2="343" />
        </g>
      </>
    );
  }
  if (variant === "gym") {
    return (
      <>
        <rect x="40" y="320" width="400" height="80" rx="34" fill="#b79df0" />
        <rect x="40" y="320" width="400" height="40" rx="28" fill="#c9b6f5" />
        <line x1="240" y1="332" x2="240" y2="392" stroke="#a98bea" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
        <g fill="#fff3cf">
          <path d="M150 352 l2.4 5 5.4 .6 -4 3.8 1 5.4 -4.8 -2.6 -4.8 2.6 1 -5.4 -4 -3.8 5.4 -.6 z" />
          <path d="M330 358 l2 4 4.4 .5 -3.2 3 .8 4.4 -4 -2.1 -4 2.1 .8 -4.4 -3.2 -3 4.4 -.5 z" />
        </g>
      </>
    );
  }
  // basket
  return (
    <>
      <path d="M40 292 q60 -20 120 0 t120 0 t120 0 t60 0 v88 a40 40 0 0 1 -40 40 H80 a40 40 0 0 1 -40 -40 z" fill="#f0a44f" />
      <path d="M40 308 q60 -18 120 0 t120 0 t120 0 t60 0 v72 a40 40 0 0 1 -40 40 H80 a40 40 0 0 1 -40 -40 z" fill="#f6b56a" />
      <g stroke="#ffffff" strokeWidth="4" opacity="0.6" fill="none">
        <line x1="50" y1="356" x2="430" y2="356" />
        <circle cx="240" cy="356" r="22" />
      </g>
      {/* basketball */}
      <circle cx="322" cy="330" r="20" fill="#fb923c" />
      <g stroke="#b4480c" strokeWidth="2.4" fill="none" strokeLinecap="round">
        <line x1="322" y1="310" x2="322" y2="350" />
        <line x1="302" y1="330" x2="342" y2="330" />
        <path d="M308 314 q14 16 0 32" />
        <path d="M336 314 q-14 16 0 32" />
      </g>
    </>
  );
}

/* Hero — a kid celebrating a new level in a chosen sport. Shares the sun,
   clouds, confetti, raised-arms pose and medal; the jersey, head gear and
   ground swap per `variant`. */
export function SportScene({ variant = "swim", className }: { variant?: SportVariant; className?: string }) {
  const s = SCENE[variant];
  return (
    <svg
      className={className}
      viewBox="0 0 480 400"
      role="img"
      aria-label={`Ilustración de ${s.label} celebrando un nuevo nivel`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* soft backdrop */}
      <ellipse cx="240" cy="210" rx="232" ry="190" fill={s.backdrop} />

      {/* sun + rays */}
      <g className="scene-sun-rays" stroke={PASTEL.sun} strokeWidth="6" strokeLinecap="round">
        <line x1="402" y1="36" x2="402" y2="20" />
        <line x1="436" y1="50" x2="448" y2="38" />
        <line x1="448" y1="84" x2="464" y2="84" />
        <line x1="368" y1="50" x2="356" y2="38" />
        <line x1="436" y1="118" x2="448" y2="130" />
        <line x1="368" y1="118" x2="356" y2="130" />
      </g>
      <circle cx="402" cy="84" r="34" fill={PASTEL.sun} />
      <circle cx="402" cy="84" r="22" fill={PASTEL.sunSoft} />

      {/* clouds */}
      <g className="scene-clouds" fill={PASTEL.cloud}>
        <rect x="60" y="70" width="92" height="30" rx="15" />
        <circle cx="86" cy="74" r="18" />
        <circle cx="116" cy="68" r="22" />
        <rect x="300" y="120" width="70" height="22" rx="11" />
        <circle cx="318" cy="122" r="14" />
        <circle cx="344" cy="118" r="16" />
      </g>

      {/* confetti */}
      <g>
        <circle cx="150" cy="150" r="6" fill={PASTEL.coral} />
        <circle cx="300" cy="170" r="5" fill={PASTEL.green} />
        <circle cx="120" cy="200" r="5" fill={PASTEL.gold} />
        <rect x="330" y="200" width="11" height="11" rx="3" fill={PASTEL.teal} transform="rotate(20 335 205)" />
        <rect x="180" y="110" width="10" height="10" rx="3" fill={PASTEL.gold} transform="rotate(-15 185 115)" />
        <circle cx="345" cy="158" r="4" fill={PASTEL.coral} />
      </g>

      {/* kid */}
      <g>
        {/* raised arms */}
        <path d="M196 250 C176 224 168 196 176 174" fill="none" stroke={PASTEL.skin} strokeWidth="20" strokeLinecap="round" />
        <path d="M284 250 C304 224 312 196 304 174" fill="none" stroke={PASTEL.skin} strokeWidth="20" strokeLinecap="round" />
        <circle cx="174" cy="168" r="12" fill={PASTEL.skin} />
        <circle cx="306" cy="168" r="12" fill={PASTEL.skin} />

        {/* torso / jersey */}
        <path d="M198 244 h84 v44 a42 42 0 0 1 -84 0 z" fill={s.jersey} />
        <rect x="198" y="236" width="84" height="22" rx="11" fill={s.jersey} />

        <Head variant={variant} />

        {/* medal */}
        <line x1="228" y1="262" x2="240" y2="284" stroke={s.ribbon} strokeWidth="5" />
        <line x1="252" y1="262" x2="240" y2="284" stroke={PASTEL.coral} strokeWidth="5" />
        <circle cx="240" cy="294" r="13" fill={PASTEL.gold} />
        <path d="M240 287 l2.2 4.6 5 .6 -3.7 3.5 1 5 -4.5 -2.4 -4.5 2.4 1 -5 -3.7 -3.5 5 -.6 z" fill="#fff3cf" />
      </g>

      <Ground variant={variant} />
    </svg>
  );
}

/* Spot — web panel / dashboard for sedes. */
export function SpotPanel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 150" role="img" aria-label="Panel de gestión" xmlns="http://www.w3.org/2000/svg">
      <rect x="26" y="22" width="168" height="104" rx="14" fill="#ffffff" stroke={PASTEL.water} strokeWidth="4" />
      <rect x="26" y="22" width="168" height="24" rx="14" fill={PASTEL.water} />
      <circle cx="40" cy="34" r="3.5" fill={PASTEL.coral} />
      <circle cx="52" cy="34" r="3.5" fill={PASTEL.gold} />
      <circle cx="64" cy="34" r="3.5" fill={PASTEL.green} />
      {/* sidebar */}
      <rect x="34" y="54" width="36" height="64" rx="8" fill={PASTEL.sky} />
      <rect x="42" y="62" width="20" height="5" rx="2.5" fill={PASTEL.waterMid} />
      <rect x="42" y="74" width="20" height="5" rx="2.5" fill={PASTEL.waterMid} />
      <rect x="42" y="86" width="20" height="5" rx="2.5" fill={PASTEL.coral} />
      {/* bars */}
      <rect x="86" y="92" width="14" height="26" rx="5" fill={PASTEL.teal} />
      <rect x="106" y="78" width="14" height="40" rx="5" fill={PASTEL.coral} />
      <rect x="126" y="86" width="14" height="32" rx="5" fill={PASTEL.green} />
      <rect x="146" y="70" width="14" height="48" rx="5" fill={PASTEL.gold} />
      {/* mini stat */}
      <rect x="86" y="54" width="80" height="14" rx="7" fill={PASTEL.sky} />
      <circle cx="95" cy="61" r="4" fill={PASTEL.tealDeep} />
    </svg>
  );
}

/* Spot — family (parent + child) for the parents app. */
export function SpotFamily({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 150" role="img" aria-label="Familia" xmlns="http://www.w3.org/2000/svg">
      {/* heart */}
      <path
        d="M110 30 c-6 -10 -22 -8 -22 4 c0 9 12 16 22 24 c10 -8 22 -15 22 -24 c0 -12 -16 -14 -22 -4 z"
        fill={PASTEL.coral}
      />
      {/* parent */}
      <g>
        <rect x="58" y="86" width="40" height="46" rx="18" fill={PASTEL.teal} />
        <circle cx="78" cy="72" r="17" fill={PASTEL.skin} />
        <path d="M61 70 a17 17 0 0 1 34 0 z" fill={PASTEL.ink} opacity="0.85" />
        <circle cx="72" cy="73" r="2.4" fill={PASTEL.ink} />
        <circle cx="84" cy="73" r="2.4" fill={PASTEL.ink} />
        <path d="M73 80 q5 4 10 0" fill="none" stroke={PASTEL.ink} strokeWidth="2.2" strokeLinecap="round" />
      </g>
      {/* child */}
      <g>
        <rect x="118" y="100" width="32" height="34" rx="14" fill={PASTEL.coral} />
        <circle cx="134" cy="90" r="14" fill={PASTEL.skin} />
        <path d="M120 88 a14 14 0 0 1 28 0 z" fill={PASTEL.green} />
        <circle cx="129" cy="91" r="2" fill={PASTEL.ink} />
        <circle cx="139" cy="91" r="2" fill={PASTEL.ink} />
        <path d="M130 97 q4 3 8 0" fill="none" stroke={PASTEL.ink} strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* holding hands */}
      <path d="M96 118 q14 8 26 2" fill="none" stroke={PASTEL.skin} strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

/* Spot — coach / professor with whistle & clipboard. */
export function SpotCoach({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 150" role="img" aria-label="Profesor" xmlns="http://www.w3.org/2000/svg">
      {/* coach body */}
      <rect x="74" y="84" width="48" height="48" rx="20" fill={PASTEL.green} />
      {/* head + cap */}
      <circle cx="98" cy="66" r="20" fill={PASTEL.skin} />
      <path d="M76 64 a22 22 0 0 1 44 0 z" fill={PASTEL.teal} />
      <rect x="116" y="60" width="18" height="8" rx="4" fill={PASTEL.teal} />
      <circle cx="91" cy="67" r="2.6" fill={PASTEL.ink} />
      <circle cx="105" cy="67" r="2.6" fill={PASTEL.ink} />
      <path d="M92 74 q6 5 12 0" fill="none" stroke={PASTEL.ink} strokeWidth="2.6" strokeLinecap="round" />
      {/* whistle */}
      <path d="M98 92 q22 -2 22 10" fill="none" stroke={PASTEL.gold} strokeWidth="3" />
      <circle cx="122" cy="104" r="9" fill={PASTEL.coral} />
      <circle cx="124" cy="104" r="3" fill="#fff" />
      {/* clipboard */}
      <g>
        <rect x="136" y="78" width="40" height="52" rx="7" fill="#ffffff" stroke={PASTEL.water} strokeWidth="4" />
        <rect x="148" y="74" width="16" height="9" rx="4" fill={PASTEL.teal} />
        <rect x="144" y="92" width="24" height="4" rx="2" fill={PASTEL.waterMid} />
        <rect x="144" y="102" width="24" height="4" rx="2" fill={PASTEL.waterMid} />
        <path d="M145 114 l4 4 7 -8" fill="none" stroke={PASTEL.greenDeep} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/* Spot — modular blocks for the "grows with your club" section. */
export function SpotBlocks({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 280 220" role="img" aria-label="Módulos plug-and-play" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="140" cy="180" rx="120" ry="26" fill={PASTEL.sky} />
      {/* base blocks */}
      <rect x="44" y="120" width="84" height="60" rx="16" fill={PASTEL.water} />
      <rect x="150" y="120" width="84" height="60" rx="16" fill={PASTEL.sand} />
      {/* top blocks */}
      <rect x="96" y="58" width="84" height="60" rx="16" fill={PASTEL.green} />
      {/* icon discs */}
      <circle cx="86" cy="150" r="13" fill="#fff" opacity="0.65" />
      <circle cx="192" cy="150" r="13" fill="#fff" opacity="0.65" />
      <circle cx="138" cy="88" r="13" fill="#fff" opacity="0.7" />
      {/* plus signs */}
      <g stroke={PASTEL.tealDeep} strokeWidth="4" strokeLinecap="round">
        <line x1="86" y1="144" x2="86" y2="156" />
        <line x1="80" y1="150" x2="92" y2="150" />
      </g>
      <g stroke={PASTEL.coral} strokeWidth="4" strokeLinecap="round">
        <line x1="192" y1="144" x2="192" y2="156" />
        <line x1="186" y1="150" x2="198" y2="150" />
      </g>
      <g stroke={PASTEL.greenDeep} strokeWidth="4" strokeLinecap="round">
        <line x1="138" y1="82" x2="138" y2="94" />
        <line x1="132" y1="88" x2="144" y2="88" />
      </g>
      {/* sparkle */}
      <path d="M214 70 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill={PASTEL.gold} />
      <path d="M52 80 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill={PASTEL.coral} />
    </svg>
  );
}
