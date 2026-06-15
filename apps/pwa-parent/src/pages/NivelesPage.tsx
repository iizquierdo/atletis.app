import { useMemo } from "react";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import type { StudentDiscipline, StudentSummary } from "../types";

const fallbackStudent: StudentSummary = {
  id: "demo-mateo",
  firstName: "Mateo",
  lastName: "Valenzuela",
  status: "ACTIVE",
  sede: { id: "demo-sede", name: "Sucursal Central" },
  disciplines: [
    {
      id: "demo-natacion",
      status: "ACTIVE",
      discipline: {
        id: "nat",
        name: "Natación Infantil",
        active: true
      },
      level: {
        id: "lv-nat-4",
        active: true,
        levelOrder: 4,
        name: "Intermedio",
        description: "Dominio completo de crol y espalda. Iniciación en técnica de braza."
      }
    }
  ]
};

const isActiveDiscipline = (discipline: StudentDiscipline) => discipline.status === "ACTIVE";

const getDisciplineIcon = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("nat")) return "pool";
  if (normalized.includes("fut")) return "sports_soccer";
  if (normalized.includes("gim")) return "fitness_center";
  return "sports";
};

export const NivelesPage = () => {
  const { selectedStudent, students, loading, error } = useStudents();

  const hasRealData = students.length > 0;
  const athlete = selectedStudent ?? fallbackStudent;

  const activeDisciplines = useMemo(
    () => (athlete.disciplines ?? []).filter(isActiveDiscipline),
    [athlete.disciplines]
  );

  const discipline = activeDisciplines[0] ?? null;
  const levelOrder = discipline?.level?.levelOrder;
  const levelProgress = discipline ? Math.min(95, 55 + (levelOrder ?? 1) * 10) : 40;
  const levelName = discipline?.level?.name ?? "En Preparación";
  const levelDescription =
    discipline?.level?.description ??
    "Continúa reforzando técnica, constancia y hábitos de entrenamiento.";

  if (loading && !selectedStudent) {
    return (
      <section className="empty-state-card">
        <p>Cargando niveles...</p>
      </section>
    );
  }

  return (
    <div className="screen-stack">
      {!hasRealData && (
        <div className="demo-banner">
          <MaterialIcon className="demo-banner-icon" name="science" />
          <span>Vista demo. Aún no hay atletas asignados al tutor autenticado.</span>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <MaterialIcon className="error-banner-icon" name="warning" />
          <span>{error}</span>
        </div>
      )}

      <section className="level-hero">
        <div className="level-ring">
          <MaterialIcon className="level-ring-icon" filled name={getDisciplineIcon(discipline?.discipline.name ?? "")} />
        </div>
        <span className="level-chip">NIVEL {levelOrder ?? 1}</span>

        <p className="card-kicker">ESTADO ACTUAL</p>
        <h1>{levelName}</h1>
        <p className="level-description">{levelDescription}</p>
      </section>

      <section className="section-stack">
        <h3 className="section-title condensed">ACTUALIZACIÓN DE PROGRESO</h3>
        <div className="progress-actions">
          <button className="progress-action blue" type="button">
            <MaterialIcon name="trending_up" />
            <span>Buen progreso</span>
          </button>
          <button className="progress-action green" type="button">
            <MaterialIcon filled name="task_alt" />
            <span>Objetivo cumplido</span>
          </button>
          <button className="progress-action sand" type="button">
            <MaterialIcon name="upgrade" />
            <span>Cambio de nivel</span>
          </button>
        </div>
      </section>

      <section className="section-stack">
        <div className="section-head compact">
          <h3 className="section-title condensed">OBJETIVOS DEL NIVEL</h3>
          <strong className="section-metric">{levelProgress}%</strong>
        </div>

        <div className="objective-grid">
          <article className="objective-card main">
            <div className="objective-head">
              <div>
                <MaterialIcon name="timer" />
                <h4>Resistencia 200m</h4>
              </div>
              <span className="status-chip">LOGRADO</span>
            </div>
            <div className="progress-track">
              <span style={{ width: `${Math.max(levelProgress, 82)}%` }} />
            </div>
            <p>Completado en 4:15 min (Mejor marca personal)</p>
          </article>

          <article className="objective-card mini">
            <strong>15</strong>
            <p>DÍAS DE RACHA</p>
          </article>

          <article className="objective-card mini">
            <MaterialIcon name={getDisciplineIcon(discipline?.discipline.name ?? "")} />
            <p>{discipline?.discipline.name ?? "TÉCNICA"}</p>
          </article>

          <article className="objective-card detail">
            <div className="detail-head">
              <div className="detail-icon">
                <MaterialIcon name="sports_score" />
              </div>
              <div>
                <h4>Viraje de Volteo</h4>
                <p>Mantener propulsión tras el giro</p>
              </div>
            </div>
            <div className="detail-progress-head">
              <span>PROGRESO</span>
              <span>40%</span>
            </div>
            <div className="progress-track light">
              <span style={{ width: "40%" }} />
            </div>
          </article>
        </div>
      </section>

      <section className="section-stack">
        <h3 className="section-title condensed">MEDICIONES ANTROPOMÉTRICAS</h3>
        <div className="anthro-grid">
          <article className="anthro-card">
            <div className="anthro-head">
              <span className="anthro-badge blue">
                <MaterialIcon name="scale" />
              </span>
              <p>PESO</p>
            </div>
            <div className="anthro-value">
              <strong>74.5</strong>
              <span>kg</span>
            </div>
            <small>-0.8kg vs mes anterior.</small>
          </article>

          <article className="anthro-card">
            <div className="anthro-head">
              <span className="anthro-badge sand">
                <MaterialIcon name="monitoring" />
              </span>
              <p>GRASA</p>
            </div>
            <div className="anthro-value">
              <strong>14.2</strong>
              <span>%</span>
            </div>
            <small>Rango saludable.</small>
          </article>
        </div>
      </section>

      <section className="athlete-level-footer">
        <p>
          Atleta activo: <strong>{athlete.firstName + " " + athlete.lastName}</strong> •{" "}
          <span>{discipline?.discipline.name ?? "Sin disciplina activa"}</span> • <span>Nivel {levelName}</span>
        </p>
      </section>
    </div>
  );
};
