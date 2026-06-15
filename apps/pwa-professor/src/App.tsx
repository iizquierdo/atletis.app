import { useEffect, useState } from "react";

// Minimal runnable scaffold for the Professor PWA (independent service).
// It pings the Sinapsis API through the dev proxy to confirm connectivity;
// real screens (students, reports, attendance) are still to be built.
export default function App() {
  const [api, setApi] = useState<"checking" | "ok" | "down">("checking");
  const [appName, setAppName] = useState<string>("Natación");

  useEffect(() => {
    fetch("/api/public/core")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setApi("ok");
        if (d?.appName) setAppName(d.appName);
      })
      .catch(() => setApi("down"));
  }, []);

  const badge =
    api === "ok"
      ? { text: "API conectada", color: "#16a34a" }
      : api === "down"
        ? { text: "API no disponible", color: "#dc2626" }
        : { text: "Comprobando API…", color: "#64748b" };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#0f172a",
        color: "#e2e8f0",
        padding: 24
      }}
    >
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏊‍♂️</div>
        <h1 style={{ margin: "0 0 4px", fontSize: 24 }}>{appName} · Profesores</h1>
        <p style={{ margin: "0 0 20px", color: "#94a3b8", fontSize: 14 }}>
          PWA de profesores — servicio independiente del monorepo.
        </p>
        <span
          style={{
            display: "inline-block",
            padding: "6px 14px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            color: badge.color,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase"
          }}
        >
          {badge.text}
        </span>
        <p style={{ marginTop: 24, color: "#64748b", fontSize: 12 }}>
          Próximamente: alumnos asignados, informes y asistencia.
        </p>
      </div>
    </div>
  );
}
