import { useEffect, useMemo, useState } from "react";
import { ClassLevelCard } from "../components/ClassLevelCard";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import { fetchStudentObjectives } from "../lib/data";
import type { ClassTeacherRef, StudentClass, StudentDiscipline, StudentObjectiveProgress } from "../types";


const isActiveDiscipline = (d: StudentDiscipline) => d.status === "ACTIVE";

const getDisciplineIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("nat")) return "pool";
  if (n.includes("fut")) return "sports_soccer";
  if (n.includes("gim")) return "fitness_center";
  return "sports";
};

type LevelCardItem = {
  id: string;
  name: string;
  coverUrl?: string | null;
  imageUrl?: string | null;
  iconName: string;
  levelOrder?: number | null;
  levelName?: string | null;
  description?: string | null;
  teachers?: ClassTeacherRef[];
};

const mapClassToCard = (item: StudentClass): LevelCardItem => ({
  id: item.id,
  name: item.name,
  coverUrl: item.coverUrl,
  imageUrl: item.imageUrl,
  iconName: getDisciplineIcon(item.disciplineName || item.name),
  levelOrder: item.levelOrder,
  levelName: item.levelName,
  description: item.levelDescription ?? item.description ?? null,
  teachers: item.teachers
});

const mapDisciplineToCard = (
  item: StudentDiscipline,
  teachers: ClassTeacherRef[] = []
): LevelCardItem => ({
  id: item.id,
  name: item.discipline.name,
  coverUrl: item.discipline.coverUrl,
  imageUrl: item.discipline.imageUrl,
  iconName: getDisciplineIcon(item.discipline.name),
  levelOrder: item.level?.levelOrder,
  levelName: item.level?.name,
  description: item.level?.description ?? item.discipline.description ?? null,
  teachers
});

export const NivelesPage = () => {
  const { selectedStudent, students, loading, error } = useStudents();

  const athlete = selectedStudent;

  const [objectives, setObjectives] = useState<StudentObjectiveProgress[]>([]);
  const [objectivesLoading, setObjectivesLoading] = useState(false);

  useEffect(() => {
    if (!athlete?.id) {
      setObjectives([]);
      return;
    }
    setObjectivesLoading(true);
    fetchStudentObjectives(athlete.id)
      .then(setObjectives)
      .finally(() => setObjectivesLoading(false));
  }, [athlete?.id]);

  const activeDisciplines = useMemo(
    () => (athlete.disciplines ?? []).filter(isActiveDiscipline),
    [athlete.disciplines]
  );

  const activeClasses = useMemo(
    () => (athlete.classes ?? []).filter((c) => c.status === "ACTIVE"),
    [athlete.classes]
  );

  const levelCards = useMemo((): LevelCardItem[] => {
    if (activeClasses.length > 0) {
      return activeClasses.map(mapClassToCard);
    }
    return activeDisciplines.map((item) => mapDisciplineToCard(item, athlete.teachers ?? []));
  }, [activeClasses, activeDisciplines, athlete.teachers]);

  const primaryCard = levelCards[0] ?? null;
  const levelName = primaryCard?.levelName ?? "En Preparación";

  // Progress is the average completion across the objectives of the student's level.
  const levelProgress = objectives.length
    ? Math.round(objectives.reduce((sum, o) => sum + o.progress, 0) / objectives.length)
    : 0;
  const completedCount = objectives.filter((o) => o.progress >= 100).length;

  if (loading && !selectedStudent) {
    return (
      <div className="flex items-center justify-center px-4 py-20">
        <p className="text-sm text-slate-400">Cargando niveles...</p>
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <MaterialIcon name="group_add" className="text-4xl text-slate-300" />
        <h3 className="font-semibold text-slate-700">Aun no tenes atletas activos</h3>
        <p className="text-sm text-slate-400">
          Cuando se vincule un atleta a tu cuenta, sus niveles apareceran aca.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 pt-5">
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <MaterialIcon name="warning" className="text-base" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">

        {/* Class / level cards */}
        {levelCards.length > 0 ? (
          levelCards.map((card) => (
            <ClassLevelCard
              key={card.id}
              coverUrl={card.coverUrl}
              description={
                card.description ??
                "Continúa reforzando técnica, constancia y hábitos de entrenamiento."
              }
              iconName={card.iconName}
              imageUrl={card.imageUrl}
              levelName={card.levelName}
              levelOrder={card.levelOrder}
              name={card.name}
              teachers={card.teachers}
            />
          ))
        ) : (
          <ClassLevelCard
            description="Continúa reforzando técnica, constancia y hábitos de entrenamiento."
            iconName="sports"
            levelName="En Preparación"
            levelOrder={0}
            name="Sin clase activa"
          />
        )}

        {/* Progress */}
        <div className="rounded-3xl bg-purple-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-500">
            Progreso
          </p>
          <strong className="mt-2 block text-3xl font-bold text-slate-900">{levelProgress}%</strong>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-purple-200">
            <div
              className="h-full rounded-full bg-purple-500 transition-all duration-700"
              style={{ width: `${levelProgress}%` }}
            />
          </div>
        </div>

        {/* Objectives count */}
        <div className="rounded-3xl bg-emerald-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
            Objetivos
          </p>
          <strong className="mt-2 block text-3xl font-bold text-slate-900">
            {completedCount}
            <span className="text-lg text-slate-400">/{objectives.length}</span>
          </strong>
          <p className="mt-1 text-xs text-slate-500">completados</p>
        </div>

        {/* Objectives list */}
        <div className="col-span-2 rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <h3 className="mb-4 text-sm font-bold text-slate-700">Objetivos del nivel</h3>
          {objectivesLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-3 w-3 animate-pulse rounded-full bg-[var(--primary)]" />
            </div>
          ) : objectives.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <MaterialIcon name="flag" className="text-3xl text-slate-200" />
              <p className="text-xs text-slate-400">
                Aún no hay objetivos cargados para el nivel del alumno.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {objectives.map((o) => {
                const done = o.progress >= 100;
                return (
                  <div key={o.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <MaterialIcon
                          name={done ? "check_circle" : "radio_button_unchecked"}
                          filled={done}
                          className={`shrink-0 text-base ${done ? "text-emerald-500" : "text-slate-300"}`}
                        />
                        <span className={`truncate text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                          {o.title}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-slate-600 tabular-nums">
                        {o.progress}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${done ? "bg-emerald-500" : "bg-[var(--primary)]"}`}
                        style={{ width: `${o.progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="col-span-2 rounded-2xl bg-slate-50 px-4 py-3 text-center">
          <p className="text-[11px] text-slate-400">
            <span className="font-semibold text-slate-600">
              {athlete.firstName} {athlete.lastName}
            </span>{" "}
            ·{" "}
            <span>{primaryCard?.name ?? "Sin disciplina activa"}</span>
            {" · "}
            <span>Nivel {levelName}</span>
          </p>
        </div>

      </div>
    </div>
  );
};
