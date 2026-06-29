import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DisciplineAvatar } from "../components/DisciplineAvatar";
import { MaterialIcon } from "../components/MaterialIcon";
import { StudentAvatar } from "../components/StudentAvatar";
import { useAuth } from "../context/AuthContext";
import { useStudents } from "../context/StudentContext";
import { searchStudentByDni, linkStudentToTutor, fetchStudentWeeklyAttendance, fetchStudentObjectives } from "../lib/data";
import { extractErrorMessage } from "../lib/api";
import type { ClassScheduleSlot, StudentDiscipline, StudentSummary, StudentObjectiveProgress } from "../types";


const getDisciplineIcon = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("nat")) return "pool";
  if (n.includes("fut")) return "sports_soccer";
  if (n.includes("gim")) return "fitness_center";
  if (n.includes("atle")) return "sprint";
  if (n.includes("box") || n.includes("art")) return "sports_martial_arts";
  if (n.includes("baile") || n.includes("danza")) return "music_note";
  if (n.includes("basquet") || n.includes("básquet")) return "sports_basketball";
  return "exercise";
};

const getSchedule = (name: string, index: number) => {
  const n = name.toLowerCase();
  if (n.includes("nat")) return "Lun. y Mié. · 16:00";
  if (n.includes("gim")) return "Sáb. · 10:00";
  if (n.includes("fut")) return "Mar. y Jue. · 18:00";
  return index % 2 === 0 ? "Mar. · 17:00" : "Vie. · 16:30";
};

const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const formatTime = (time: string) => time.slice(0, 5);

const formatClassSchedule = (schedules?: ClassScheduleSlot[]) => {
  if (!schedules?.length) return "";
  const byTime = new Map<string, number[]>();
  for (const slot of schedules) {
    if (!slot.startTime) continue;
    const time = formatTime(slot.startTime);
    const days = byTime.get(time) ?? [];
    days.push(slot.dayOfWeek);
    byTime.set(time, days);
  }
  return [...byTime.entries()]
    .map(([time, days]) => {
      const dayLabels = [...new Set(days)]
        .sort((a, b) => a - b)
        .map((d) => `${DAY_SHORT[d] ?? d}.`);
      const dayPart = dayLabels.length > 1 ? dayLabels.join(" y ") : dayLabels[0];
      return `${dayPart} · ${time}`;
    })
    .join(" · ");
};

type ActivityItem = {
  id: string;
  name: string;
  imageUrl?: string | null;
  scheduleLabel: string;
  levelName?: string | null;
  iconName: string;
};

const isActiveDiscipline = (d: StudentDiscipline) => d.status === "ACTIVE";

const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

const todayLabel = () => {
  try {
    return capitalize(
      new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(
        new Date()
      )
    );
  } catch {
    return "Tu resumen de hoy";
  }
};

type SearchStatus = "idle" | "loading" | "found" | "error";
type LinkStatus = "idle" | "loading" | "done" | "error";

export const ResumenPage = () => {
  const { user } = useAuth();
  const { students, selectedStudent, selectedStudentId, setSelectedStudentId, loading, error, refreshStudents } =
    useStudents();

  const [showModal, setShowModal] = useState(false);
  const [dni, setDni] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [foundStudent, setFoundStudent] = useState<StudentSummary | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("idle");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<{ rate: number | null; present: number; total: number } | null>(
    null
  );
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [objectives, setObjectives] = useState<StudentObjectiveProgress[]>([]);
  const dniInputRef = useRef<HTMLInputElement>(null);

  const openModal = () => {
    setDni("");
    setSearchStatus("idle");
    setFoundStudent(null);
    setSearchError(null);
    setLinkStatus("idle");
    setLinkError(null);
    setShowModal(true);
    setTimeout(() => dniInputRef.current?.focus(), 50);
  };

  const closeModal = () => setShowModal(false);

  const handleSearch = async () => {
    const trimmed = dni.trim();
    if (!trimmed) return;
    setSearchStatus("loading");
    setFoundStudent(null);
    setSearchError(null);
    try {
      const student = await searchStudentByDni(trimmed);
      setFoundStudent(student);
      setSearchStatus("found");
    } catch (err) {
      setSearchError(extractErrorMessage(err));
      setSearchStatus("error");
    }
  };

  const handleLink = async () => {
    if (!foundStudent) return;
    setLinkStatus("loading");
    setLinkError(null);
    try {
      await linkStudentToTutor(foundStudent.id);
      await refreshStudents();
      setLinkStatus("done");
      setTimeout(() => closeModal(), 1200);
    } catch (err) {
      setLinkError(extractErrorMessage(err));
      setLinkStatus("error");
    }
  };

  const addAthleteModal = showModal && (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-8 pt-16 backdrop-blur-sm sm:items-center sm:pb-0"
      onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
    >
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Añadir atleta</h3>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100"
            onClick={closeModal}
            type="button"
          >
            <MaterialIcon name="close" className="text-base" />
          </button>
        </div>

        {/* DNI input */}
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Numero de DNI
        </label>
        <div className="mt-1.5 flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition-colors focus-within:border-[var(--primary)] focus-within:bg-white">
            <MaterialIcon name="badge" className="text-base text-slate-400" />
            <input
              ref={dniInputRef}
              className="flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              disabled={searchStatus === "loading"}
              inputMode="numeric"
              onChange={(e) => {
                setDni(e.target.value);
                if (searchStatus !== "idle") {
                  setSearchStatus("idle");
                  setFoundStudent(null);
                  setSearchError(null);
                }
              }}
              onKeyDown={(e) => { if (e.key === "Enter") void handleSearch(); }}
              placeholder="Ej. 38123456"
              type="text"
              value={dni}
            />
          </div>
          <button
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white shadow-sm transition-opacity disabled:opacity-40"
            disabled={!dni.trim() || searchStatus === "loading"}
            onClick={() => void handleSearch()}
            type="button"
          >
            {searchStatus === "loading"
              ? <MaterialIcon name="progress_activity" className="text-base animate-spin" />
              : <MaterialIcon name="search" className="text-base" />
            }
          </button>
        </div>

        {/* Result */}
        {searchStatus === "found" && foundStudent && (
          <div className="mt-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Alumno encontrado
            </p>
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <StudentAvatar
                size="h-12 w-12"
                student={foundStudent}
                variant="found"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {foundStudent.firstName} {foundStudent.lastName}
                </p>
                {foundStudent.sede?.name && (
                  <p className="truncate text-xs text-slate-500">{foundStudent.sede.name}</p>
                )}
              </div>
              <MaterialIcon name="check_circle" filled className="ml-auto shrink-0 text-[var(--primary)]" />
            </div>

            {linkError && (
              <p className="mt-2 text-xs text-red-500">{linkError}</p>
            )}

            <button
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] py-3.5 text-sm font-semibold text-white shadow-lg transition-opacity disabled:opacity-50"
              disabled={linkStatus === "loading" || linkStatus === "done"}
              onClick={() => void handleLink()}
              type="button"
            >
              {linkStatus === "loading" && <MaterialIcon name="progress_activity" className="text-base animate-spin" />}
              {linkStatus === "done" && <MaterialIcon name="check" className="text-base" />}
              {linkStatus === "idle" || linkStatus === "error" ? "Confirmar y añadir" : linkStatus === "loading" ? "Añadiendo..." : "Añadido"}
            </button>
          </div>
        )}

        {searchStatus === "error" && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <MaterialIcon name="person_search" className="mt-0.5 shrink-0 text-base" />
            <span>{searchError ?? "No se encontro un alumno con ese DNI."}</span>
          </div>
        )}

        {searchStatus === "idle" && (
          <p className="mt-4 text-center text-xs text-slate-400">
            Ingresa el DNI del alumno para buscarlo en el sistema.
          </p>
        )}
      </div>
    </div>
  );

  const hasRealData = students.length > 0;
  const roster = students;
  const activeStudent = selectedStudent ?? roster[0] ?? null;

  const activeDisciplines = useMemo(
    () => (activeStudent?.disciplines ?? []).filter(isActiveDiscipline),
    [activeStudent]
  );

  const activeClasses = useMemo(
    () => (activeStudent?.classes ?? []).filter((c) => c.status === "ACTIVE"),
    [activeStudent]
  );

  const activityItems = useMemo((): ActivityItem[] => {
    if (activeClasses.length > 0) {
      return activeClasses.map((item) => ({
        id: item.id,
        name: item.name,
        imageUrl: item.imageUrl,
        scheduleLabel: formatClassSchedule(item.schedules) || "Horario a confirmar",
        levelName: item.levelName,
        iconName: getDisciplineIcon(item.disciplineName || item.name)
      }));
    }
    return activeDisciplines.map((item, index) => ({
      id: item.id,
      name: item.discipline.name,
      imageUrl: item.discipline.imageUrl,
      scheduleLabel: getSchedule(item.discipline.name, index),
      levelName: item.level?.name,
      iconName: getDisciplineIcon(item.discipline.name)
    }));
  }, [activeClasses, activeDisciplines]);

  const showingClasses = activeClasses.length > 0;
  const primaryDiscipline = activeDisciplines[0] ?? null;
  const activityCount = activityItems.length;
  const attendanceRate = attendance?.rate ?? null;
  const classesAttended = attendance?.present ?? 0;
  const classesTotal = attendance?.total ?? 0;
  const streakWeeks = 0;
  const primaryClass = activeClasses[0] ?? null;
  // Show the student's class level (falls back to the discipline level).
  const levelLabel =
    primaryClass?.levelName ??
    (primaryClass?.levelOrder != null ? `Nivel ${primaryClass.levelOrder}` : null) ??
    (primaryDiscipline?.level?.name ?? null) ??
    (primaryDiscipline?.level?.levelOrder != null ? `Nivel ${primaryDiscipline.level.levelOrder}` : null) ??
    "—";
  const tutorName = user?.firstName?.trim() || "tutor";

  // Average completion across the objectives of the student's level.
  const objectivesProgress = objectives.length
    ? Math.round(objectives.reduce((sum, o) => sum + o.progress, 0) / objectives.length)
    : 0;

  useEffect(() => {
    if (!hasRealData || !activeStudent?.id || activityCount === 0) {
      setAttendance(null);
      return;
    }

    let cancelled = false;
    setAttendanceLoading(true);
    void fetchStudentWeeklyAttendance(activeStudent.id)
      .then((result) => {
        if (!cancelled) setAttendance(result);
      })
      .finally(() => {
        if (!cancelled) setAttendanceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hasRealData, activeStudent?.id, activityCount]);

  useEffect(() => {
    if (!activeStudent?.id) {
      setObjectives([]);
      return;
    }
    let cancelled = false;
    void fetchStudentObjectives(activeStudent.id).then((result) => {
      if (!cancelled) setObjectives(result);
    });
    return () => {
      cancelled = true;
    };
  }, [activeStudent?.id]);

  if (loading && !activeStudent) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <MaterialIcon name="exercise" className="text-4xl text-slate-300" />
        <h3 className="font-semibold text-slate-700">Cargando atletas…</h3>
        <p className="text-sm text-slate-400">Estamos preparando el resumen de tu familia.</p>
      </div>
    );
  }

  if (!activeStudent) {
    return (
      <>
      <div className="flex min-h-[calc(100vh-9rem)] flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <MaterialIcon name="group_add" className="text-4xl text-slate-300" />
        <h3 className="font-semibold text-slate-700">Aún no tenés atletas activos</h3>
        <p className="max-w-xs text-sm text-slate-400">
          Añadí un alumno con su DNI para vincularlo a tu cuenta familiar.
        </p>
        <button
          className="mt-3 flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--primary)]/20 transition-opacity hover:opacity-90"
          onClick={openModal}
          type="button"
        >
          <MaterialIcon name="person_add" className="text-base" />
          Añadir alumno
        </button>
      </div>
      {addAthleteModal}
      </>
    );
  }

  return (
    <div className="px-4 pb-6 pt-5">
      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
          <MaterialIcon name="warning" filled className="text-base" />
          <span>{error}</span>
        </div>
      )}

      {/* Greeting */}
      <header className="mb-5">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">{todayLabel()}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">¡Hola, {tutorName}! 👋</h1>
        <p className="mt-1 text-sm text-slate-500">
          Seguí el entrenamiento y los logros de tu familia.
        </p>
      </header>

      {/* Bento grid */}
      <div className="grid grid-cols-2 gap-3">

        {/* Athlete selector */}
        <div className="col-span-2 rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Mis atletas
            </h2>
            <button className="text-xs font-medium text-[var(--primary)]" type="button">
              Gestionar
            </button>
          </div>
          <div className="flex gap-3">
            {roster.map((student) => {
              const isActive = student.id === selectedStudentId;
              return (
                <button
                  key={student.id}
                  className={`flex flex-col items-center gap-1 transition-opacity ${isActive ? "opacity-100" : "opacity-40"}`}
                  onClick={() => setSelectedStudentId(student.id)}
                  type="button"
                >
                  <StudentAvatar
                    className={isActive && student.imageUrl ? "ring-2 ring-[var(--primary)] ring-offset-2" : ""}
                    size="h-12 w-12"
                    student={student}
                    variant={isActive ? "active" : "default"}
                  />
                  <span className="text-xs font-medium text-slate-700">{student.firstName}</span>
                </button>
              );
            })}
            <button
              className="flex flex-col items-center gap-1"
              onClick={openModal}
              type="button"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <MaterialIcon name="add" className="text-base" />
              </span>
              <span className="text-xs font-medium text-slate-400">Añadir</span>
            </button>
          </div>
        </div>

        {/* Hero card */}
        <div className="col-span-2 relative overflow-hidden rounded-3xl bg-[var(--primary)] p-5 text-white">
          <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-white/5" />
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
              Ficha del atleta
            </p>
            <div className="mt-3 flex items-center gap-3">
              <StudentAvatar
                shape="rounded"
                size="h-14 w-14"
                student={activeStudent}
                variant="hero"
              />
              <div>
                <h2 className="text-xl font-bold leading-tight">
                  {activeStudent.firstName} {activeStudent.lastName}
                </h2>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-white/70">
                  <MaterialIcon name="location_on" filled className="text-sm" />
                  {activeStudent.sede?.name ?? "Sucursal Central"}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-4 border-t border-white/20 pt-4">
              {[
                { value: activityCount, label: showingClasses ? "Clases" : "Disciplinas" },
                { value: streakWeeks, label: "Sem. activo" },
                { value: levelLabel, label: "Nivel" }
              ].map((kpi) => (
                <div key={kpi.label} className="flex-1 text-center">
                  <strong className="block text-2xl font-bold">{kpi.value}</strong>
                  <span className="text-[11px] text-white/60">{kpi.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Attendance */}
        {activityCount > 0 && (
          <div className="rounded-3xl bg-blue-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">
              Asistencia
            </p>
            <strong className="mt-2 block text-3xl font-bold text-slate-900">
              {attendanceLoading ? "—" : attendanceRate !== null ? `${attendanceRate}%` : "0%"}
            </strong>
            <p className="mt-1 text-xs text-slate-500">
              {classesTotal > 0
                ? `${classesAttended} de ${classesTotal} clases`
                : "Sin registros esta semana"}
            </p>
          </div>
        )}

        {/* Student progress (avg. of level objectives) */}
        {activityCount > 0 && (
          <div className="rounded-3xl bg-purple-50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-500">
              Progreso
            </p>
            <strong className="mt-2 block text-3xl font-bold text-slate-900">{objectivesProgress}%</strong>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-purple-200">
              <div
                className="h-full rounded-full bg-purple-500 transition-all duration-700"
                style={{ width: `${objectivesProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Disciplines */}
        <div className="col-span-2 rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {showingClasses ? "Clases activas" : "Disciplinas activas"}
            </h2>
            {activityCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                {activityCount}
              </span>
            )}
          </div>

          {activityCount > 0 ? (
            <div className="space-y-2">
              {activityItems.map((item) => (
                <Link
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 transition-colors hover:bg-slate-100"
                  to="/niveles"
                >
                  <DisciplineAvatar
                    iconName={item.iconName}
                    imageUrl={item.imageUrl}
                    name={item.name}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.name}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <MaterialIcon name="schedule" className="text-xs" />
                      {item.scheduleLabel}
                    </p>
                  </div>
                  {item.levelName && (
                    <span className="shrink-0 rounded-full bg-[var(--primary-softer)] px-2.5 py-1 text-[11px] font-semibold text-[var(--primary)]">
                      {item.levelName}
                    </span>
                  )}
                </Link>
              ))}

            </div>
          ) : (
            <div className="py-6 text-center">
              <MaterialIcon name="exercise" className="text-3xl text-slate-200" />
              <p className="mt-2 text-sm text-slate-400">Sin disciplinas activas aún</p>
            </div>
          )}
        </div>

        {/* Coach tip */}
        <div className="col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-50 via-blue-50 to-slate-50 p-5">
          <div className="pointer-events-none absolute -top-4 -right-4 h-20 w-20 rounded-full bg-violet-200/30 blur-2xl" />
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-600">
            <MaterialIcon name="tips_and_updates" filled className="text-sm" />
            Consejo de la semana
          </p>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-800">
            La hidratación es el combustible invisible del campeón.
          </p>
          <p className="mt-2 text-xs text-slate-500">— Equipo de entrenadores</p>
        </div>

      </div>
      {addAthleteModal}
    </div>
  );
};
