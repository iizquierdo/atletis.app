import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import type { StudentDiscipline, StudentSummary } from "../types";

const demoRoster: StudentSummary[] = [
  {
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
          active: true,
          description: "Desarrollo técnico y resistencia acuática."
        },
        level: {
          id: "lv-nat-2",
          active: true,
          levelOrder: 2,
          name: "Intermedio",
          description: "Dominio básico de crol y espalda.",
          color: "#63d972"
        }
      },
      {
        id: "demo-gimnasia",
        status: "ACTIVE",
        discipline: {
          id: "gim",
          name: "Gimnasia Artística",
          active: true,
          description: "Coordinación corporal y ritmo."
        },
        level: {
          id: "lv-gim-1",
          active: true,
          levelOrder: 1,
          name: "Formativo",
          description: "Bases de fuerza y flexibilidad."
        }
      }
    ]
  },
  {
    id: "demo-sofia",
    firstName: "Sofía",
    lastName: "Ruiz",
    status: "ACTIVE",
    sede: { id: "demo-sede", name: "Sucursal Norte" },
    disciplines: []
  }
];

const getDisciplineIcon = (name: string) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("nat")) return "pool";
  if (normalized.includes("fut")) return "sports_soccer";
  if (normalized.includes("gim")) return "fitness_center";
  if (normalized.includes("atle")) return "sprint";
  return "sports";
};

const getSchedule = (name: string, index: number) => {
  const normalized = name.toLowerCase();
  if (normalized.includes("nat")) return "Lunes y Miércoles 16:00";
  if (normalized.includes("gim")) return "Sábados 10:00";
  if (normalized.includes("fut")) return "Martes y Jueves 18:00";
  return index % 2 === 0 ? "Martes 17:00" : "Viernes 16:30";
};

const getInitials = (student: StudentSummary) =>
  `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();

const isActiveDiscipline = (discipline: StudentDiscipline) => discipline.status === "ACTIVE";

export const ResumenPage = () => {
  const { students, selectedStudent, selectedStudentId, setSelectedStudentId, loading, error } = useStudents();

  const hasRealData = students.length > 0;
  const roster = hasRealData ? students : demoRoster;
  const activeStudent = selectedStudent ?? roster[0] ?? null;

  const activeDisciplines = useMemo(
    () => (activeStudent?.disciplines ?? []).filter(isActiveDiscipline),
    [activeStudent]
  );

  const primaryDiscipline = activeDisciplines[0] ?? null;
  const secondaryDiscipline = activeDisciplines[1] ?? null;

  const attendance = activeDisciplines.length === 0 ? 0 : Math.min(96, 80 + activeDisciplines.length * 4);

  if (loading && !activeStudent) {
    return (
      <section className="empty-state-card">
        <p>Cargando atletas...</p>
      </section>
    );
  }

  if (!activeStudent) {
    return (
      <section className="empty-state-card">
        <h2>Aún no tienes atletas activos</h2>
        <p>Cuando asignes alumnos al tutor, aparecerán aquí automáticamente.</p>
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

      <section className="section-stack">
        <div className="section-head">
          <h2>Mis Atletas</h2>
          <button className="ghost-action" type="button">
            Gestionar
          </button>
        </div>

        <div className="athlete-strip">
          {roster.map((student) => {
            const isActive = hasRealData
              ? student.id === selectedStudentId
              : student.id === activeStudent.id;

            return (
              <button
                className={`athlete-item ${isActive ? "active" : ""}`}
                key={student.id}
                onClick={() => hasRealData && setSelectedStudentId(student.id)}
                type="button"
              >
                <span className="athlete-avatar">{getInitials(student)}</span>
                <span>{student.firstName}</span>
              </button>
            );
          })}

          <button className="athlete-item add" type="button">
            <span className="athlete-avatar add-avatar">
              <MaterialIcon name="add" />
            </span>
            <span>Añadir</span>
          </button>
        </div>
      </section>

      <section className="student-card">
        <p className="card-kicker">FICHA DEL ESTUDIANTE</p>
        <h1>{activeStudent.firstName + " " + activeStudent.lastName}</h1>
        <p className="card-subline">
          <MaterialIcon className="secondary-icon" filled name="location_on" />
          {(activeStudent.sede?.name ?? "Sucursal Central") +
            " • " +
            (primaryDiscipline?.level?.name ? `Nivel ${primaryDiscipline.level.name}` : "Nivel en progreso")}
        </p>
      </section>

      <section className="section-stack">
        <h3 className="section-title">Disciplinas Activas</h3>

        {primaryDiscipline ? (
          <div className="discipline-grid">
            <Link className="discipline-card horizontal discipline-nav-link" to="/niveles">
              <div className="discipline-icon-box">
                <MaterialIcon name={getDisciplineIcon(primaryDiscipline.discipline.name)} />
              </div>
              <div>
                <h4>{primaryDiscipline.discipline.name}</h4>
                <p>{getSchedule(primaryDiscipline.discipline.name, 0)}</p>
              </div>
              <span className="inline-link">
                <MaterialIcon name="chevron_right" />
              </span>
            </Link>

            {secondaryDiscipline ? (
              <Link className="discipline-card mini discipline-nav-link" to="/niveles">
                <div className="discipline-icon-box green">
                  <MaterialIcon name={getDisciplineIcon(secondaryDiscipline.discipline.name)} />
                </div>
                <h4>{secondaryDiscipline.discipline.name}</h4>
                <p>{getSchedule(secondaryDiscipline.discipline.name, 1)}</p>
              </Link>
            ) : (
              <article className="discipline-card mini empty">
                <div className="discipline-icon-box">
                  <MaterialIcon name="add" />
                </div>
                <h4>Sin segunda disciplina</h4>
                <p>Agrega otra actividad cuando esté disponible.</p>
              </article>
            )}

            <article className="discipline-card metric">
              <div className="metric-head">
                <MaterialIcon className="secondary-icon" name="trending_up" />
                <strong>{attendance}%</strong>
              </div>
              <p>Asistencia</p>
              <div className="progress-track">
                <span style={{ width: `${attendance}%` }} />
              </div>
            </article>
          </div>
        ) : (
          <article className="empty-state-card">
            <h4>Sin disciplinas activas</h4>
            <p>Cuando el staff asigne disciplinas, aparecerán en este bloque.</p>
          </article>
        )}
      </section>

      <section className="tip-card">
        <div>
          <p>CONSEJO DE LA SEMANA</p>
          <h4>La hidratación es el combustible invisible del campeón.</h4>
        </div>
      </section>
    </div>
  );
};
