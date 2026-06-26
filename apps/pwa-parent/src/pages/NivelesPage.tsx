import { useMemo } from "react";
import { ClassLevelCard } from "../components/ClassLevelCard";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import type { ClassTeacherRef, StudentClass, StudentDiscipline } from "../types";


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
  const levelOrder = primaryCard?.levelOrder;
  const levelProgress = primaryCard ? Math.min(95, 55 + (levelOrder ?? 1) * 10) : 40;
  const levelName = primaryCard?.levelName ?? "En Preparación";

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

        {/* Streak */}
        <div className="rounded-3xl bg-emerald-50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
            Racha
          </p>
          <strong className="mt-2 block text-3xl font-bold text-slate-900">15</strong>
          <p className="mt-1 text-xs text-slate-500">días activos</p>
        </div>

        {/* Main objective */}
        <div className="col-span-2 rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <MaterialIcon name="timer" className="text-base text-slate-400" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Resistencia 200m
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
              LOGRADO
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Completado en 4:15 min · Mejor marca personal
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
              style={{ width: `${Math.max(levelProgress, 82)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-[10px] text-slate-400">Progreso</span>
            <span className="text-[10px] font-semibold text-slate-600">
              {Math.max(levelProgress, 82)}%
            </span>
          </div>
        </div>

        {/* Secondary objective */}
        <div className="col-span-2 rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500">
              <MaterialIcon name="sports_score" className="text-base" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-slate-900">Viraje de Volteo</h4>
              <p className="text-xs text-slate-500">Mantener propulsión tras el giro</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-400 transition-all duration-700"
              style={{ width: "40%" }}
            />
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-[10px] text-slate-400">Progreso</span>
            <span className="text-[10px] font-semibold text-slate-600">40%</span>
          </div>
        </div>

        {/* Weight */}
        <div className="rounded-3xl bg-blue-50 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100">
              <MaterialIcon name="scale" className="text-sm text-blue-600" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">
              Peso
            </p>
          </div>
          <div className="mt-2 flex items-end gap-1">
            <strong className="text-3xl font-bold text-slate-900">74.5</strong>
            <span className="mb-0.5 text-sm text-slate-500">kg</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">-0.8kg vs mes anterior</p>
        </div>

        {/* Body fat */}
        <div className="rounded-3xl bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100">
              <MaterialIcon name="monitoring" className="text-sm text-amber-600" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">
              Grasa
            </p>
          </div>
          <div className="mt-2 flex items-end gap-1">
            <strong className="text-3xl font-bold text-slate-900">14.2</strong>
            <span className="mb-0.5 text-sm text-slate-500">%</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Rango saludable</p>
        </div>

        {/* Action buttons */}
        <div className="col-span-2 flex gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-blue-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-200/60 transition-opacity hover:opacity-90"
            type="button"
          >
            <MaterialIcon name="trending_up" className="text-base" />
            Buen progreso
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-emerald-200/60 transition-opacity hover:opacity-90"
            type="button"
          >
            <MaterialIcon name="task_alt" filled className="text-base" />
            Objetivo
          </button>
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
