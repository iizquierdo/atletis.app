import { useEffect, useMemo, useState } from "react";
import { CustomSelect } from "../components/CustomSelect";
import { MaterialIcon } from "../components/MaterialIcon";
import { RatingDisplay, RatingPicker } from "../components/RatingPicker";
import { StudentInfoCard, studentLabel } from "../components/StudentInfoCard";
import {
  fetchStudents,
  fetchStudentDetail,
  fetchReports,
  createReport,
  fetchStudentObjectives,
  updateObjectiveProgress,
  fetchClassDetail,
  saveClassLevel,
  updateClassStudentLevel
} from "../lib/data";
import { extractErrorMessage } from "../lib/api";
import type { ClassLevelObjective, ProfessorClassDetail, ProfessorClassLevel, StudentSummary, StudentReport, StudentObjectiveProgress } from "../types";

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso ?? "";
  }
};

const demoStudents: StudentSummary[] = [
  { id: "s1", firstName: "Lucas", lastName: "Rodríguez", status: "ACTIVE" },
  { id: "s2", firstName: "Valentina", lastName: "González", status: "ACTIVE" },
  { id: "s3", firstName: "Mateo", lastName: "Pérez", status: "ACTIVE" },
  { id: "s4", firstName: "Sofía", lastName: "López", status: "ACTIVE" },
  { id: "s5", firstName: "Nicolás", lastName: "Martínez", status: "ACTIVE" }
];

const demoReports: Record<string, StudentReport[]> = {
  s1: [
    {
      id: "r1", studentId: "s1", authorId: "me", type: "PROGRESS",
      title: "Progreso mensual — Mayo",
      content: "Lucas ha mostrado una mejora notable en el estilo mariposa. Su técnica de respiración es más consistente.",
      status: "PUBLISHED", visibility: "MEMBERS_ONLY",
      publishedAt: new Date(Date.now() - 604800000).toISOString(),
      createdAt: new Date(Date.now() - 604800000).toISOString(),
      author: { id: "me", firstName: "Prof.", lastName: "Gómez" }
    }
  ],
  s2: []
};

const REPORT_TYPES = [
  { value: "PROGRESS", label: "Progreso" },
  { value: "BEHAVIOR", label: "Conducta" },
  { value: "ATTENDANCE", label: "Asistencia" },
  { value: "GENERAL", label: "General" }
];

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-emerald-50 text-emerald-700",
  DRAFT: "bg-slate-100 text-slate-500",
  ARCHIVED: "bg-blue-50 text-blue-600"
};

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: "Publicado",
  DRAFT: "Borrador",
  ARCHIVED: "Archivado"
};

const emptyReportForm = () => ({
  type: "PROGRESS",
  title: "",
  content: "",
  status: "PUBLISHED",
  rating: 0,
  ratingTheme: "stars"
});

const emptyLevelDraft = (order = 0) => ({
  id: "",
  classId: "",
  name: "",
  description: "",
  levelOrder: order,
  color: "#0f766e",
  active: true,
  objectives: [] as ClassLevelObjective[]
});

export const CuadernoPage = () => {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [reports, setReports] = useState<Record<string, StudentReport[]>>({});
  const [selectedId, setSelectedId] = useState("");
  const [studentDetail, setStudentDetail] = useState<StudentSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [form, setForm] = useState(emptyReportForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [objectives, setObjectives] = useState<StudentObjectiveProgress[]>([]);
  const [objectivesLoading, setObjectivesLoading] = useState(false);
  const [savingObjective, setSavingObjective] = useState<string | null>(null);
  const [classDetails, setClassDetails] = useState<Record<string, ProfessorClassDetail>>({});
  const [classesLoading, setClassesLoading] = useState(false);
  const [savingClassLevel, setSavingClassLevel] = useState<string | null>(null);
  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [levelDraft, setLevelDraft] = useState(emptyLevelDraft);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchStudents();
        const s = data.filter((st) => st.status === "ACTIVE");
        setStudents(s.length > 0 ? s : demoStudents);
      } catch {
        setStudents(demoStudents);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const selected = students.find((st) => st.id === selectedId) ?? null;
  const cardStudent = studentDetail ?? selected;

  useEffect(() => {
    if (!selectedId) {
      setStudentDetail(null);
      return;
    }
    setDetailLoading(true);
    fetchStudentDetail(selectedId)
      .then(setStudentDetail)
      .catch(() => {
        setStudentDetail(students.find((st) => st.id === selectedId) ?? null);
      })
      .finally(() => setDetailLoading(false));
  }, [selectedId, students]);

  useEffect(() => {
    if (!selected) return;
    setReportsLoading(true);
    setFetchError(null);
    fetchReports(selected.id)
      .then((data) => setReports((prev) => ({ ...prev, [selected.id]: data })))
      .catch((err: unknown) => {
        setFetchError(extractErrorMessage(err));
        setReports((prev) => ({ ...prev, [selected.id]: demoReports[selected.id] ?? [] }));
      })
      .finally(() => setReportsLoading(false));
  }, [selected]);

  useEffect(() => {
    if (!selected) { setObjectives([]); return; }
    setObjectivesLoading(true);
    fetchStudentObjectives(selected.id)
      .then(setObjectives)
      .finally(() => setObjectivesLoading(false));
  }, [selected]);

  const studentClasses = studentDetail?.classes?.filter((c) => c.status !== "INACTIVE") ?? [];

  useEffect(() => {
    if (!studentClasses.length) {
      setClassDetails({});
      return;
    }
    let cancelled = false;
    setClassesLoading(true);
    Promise.all(
      studentClasses.map((c) =>
        fetchClassDetail(c.classId || c.id)
          .then((detail) => [c.classId || c.id, detail] as const)
          .catch(() => null)
      )
    )
      .then((entries) => {
        if (cancelled) return;
        const next: Record<string, ProfessorClassDetail> = {};
        entries.forEach((entry) => {
          if (entry) next[entry[0]] = entry[1];
        });
        setClassDetails(next);
      })
      .finally(() => {
        if (!cancelled) setClassesLoading(false);
      });
    return () => { cancelled = true; };
  }, [studentClasses.map((c) => c.classId || c.id).join("|")]);

  const handleObjectiveProgress = async (objectiveId: string, progress: number) => {
    setObjectives((prev) => prev.map((o) => o.id === objectiveId ? { ...o, progress } : o));
    setSavingObjective(objectiveId);
    try {
      await updateObjectiveProgress(selectedId, objectiveId, progress);
    } catch {
      // revert on error is too disruptive; keep optimistic update
    } finally {
      setSavingObjective(null);
    }
  };

  const refreshClassDetail = async (classId: string) => {
    const detail = await fetchClassDetail(classId);
    setClassDetails((prev) => ({ ...prev, [classId]: detail }));
    return detail;
  };

  const refreshObjectives = async () => {
    if (!selected) return;
    setObjectivesLoading(true);
    try {
      setObjectives(await fetchStudentObjectives(selected.id));
    } finally {
      setObjectivesLoading(false);
    }
  };

  const openLevelModal = (classId: string, level?: ProfessorClassLevel) => {
    const detail = classDetails[classId];
    const nextOrder = Math.max(0, ...(detail?.ownLevels ?? []).map((l) => l.levelOrder ?? 0)) + 1;
    setLevelDraft(level
      ? {
          id: level.id,
          classId,
          name: level.name,
          description: level.description ?? "",
          levelOrder: level.levelOrder ?? 0,
          color: level.color ?? "#0f766e",
          active: level.active !== false,
          objectives: level.objectives?.length ? level.objectives : []
        }
      : { ...emptyLevelDraft(nextOrder), classId }
    );
    setLevelModalOpen(true);
  };

  const addLevelObjective = () => {
    setLevelDraft((prev) => ({
      ...prev,
      objectives: [...prev.objectives, { id: crypto.randomUUID(), title: "", completed: false }]
    }));
  };

  const updateLevelObjective = (id: string, title: string) => {
    setLevelDraft((prev) => ({
      ...prev,
      objectives: prev.objectives.map((objective) => objective.id === id ? { ...objective, title } : objective)
    }));
  };

  const removeLevelObjective = (id: string) => {
    setLevelDraft((prev) => ({
      ...prev,
      objectives: prev.objectives.filter((objective) => objective.id !== id)
    }));
  };

  const submitLevel = async () => {
    if (!levelDraft.classId || !levelDraft.name.trim()) return;
    setSavingClassLevel(levelDraft.classId);
    try {
      const saved = await saveClassLevel(levelDraft.classId, {
        ...levelDraft,
        name: levelDraft.name.trim()
      });
      await refreshClassDetail(levelDraft.classId);
      if (selected && !levelDraft.id) {
        await updateClassStudentLevel(levelDraft.classId, selected.id, saved.id);
        setStudentDetail((prev) => prev
          ? {
              ...prev,
              classes: prev.classes?.map((c) =>
                (c.classId || c.id) === levelDraft.classId ? { ...c, levelId: saved.id, levelName: saved.name } : c
              )
            }
          : prev
        );
      }
      setLevelModalOpen(false);
      await refreshObjectives();
    } catch (err: unknown) {
      setSubmitError(extractErrorMessage(err));
    } finally {
      setSavingClassLevel(null);
    }
  };

  const handleStudentLevelChange = async (classId: string, levelId: string) => {
    if (!selected) return;
    const detail = classDetails[classId];
    const level = detail?.ownLevels.find((l) => l.id === levelId);
    setSavingClassLevel(classId);
    setStudentDetail((prev) => prev
      ? {
          ...prev,
          classes: prev.classes?.map((c) =>
            (c.classId || c.id) === classId ? { ...c, levelId: levelId || null, levelName: level?.name ?? null } : c
          )
        }
      : prev
    );
    try {
      await updateClassStudentLevel(classId, selected.id, levelId || null);
      await refreshObjectives();
    } catch (err: unknown) {
      setSubmitError(extractErrorMessage(err));
    } finally {
      setSavingClassLevel(null);
    }
  };

  const handleSubmit = async () => {
    if (!selected || !form.title.trim() || !form.content.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const report = await createReport(selected.id, form);
      setReports((prev) => ({ ...prev, [selected.id]: [report, ...(prev[selected.id] ?? [])] }));
      setForm(emptyReportForm());
    } catch (err: unknown) {
      setSubmitError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const studentReports = selected ? (reports[selected.id] ?? []) : [];

  const studentOptions = useMemo(
    () => students.map((st) => ({ value: st.id, label: studentLabel(st) })),
    [students]
  );

  const handleStudentChange = (id: string) => {
    setSelectedId(id);
    setStudentDetail(null);
    setForm(emptyReportForm());
    setSubmitError(null);
    setObjectives([]);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20">
        <div className="h-3 w-3 animate-pulse rounded-full bg-[var(--primary)]" />
        <p className="text-sm text-slate-400">Cargando alumnos...</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6 pt-5">
      {/* Header */}
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Cuaderno</h1>
        <p className="mt-1 text-sm text-slate-500">
          Informes y seguimiento de {students.length} alumnos
        </p>
      </header>

      {/* Student selector */}
      <div className="mb-4 rounded-3xl bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Seleccioná un alumno
        </p>
        <CustomSelect
          options={studentOptions}
          value={selectedId}
          onChange={handleStudentChange}
          placeholder="Elegí un alumno..."
        />
      </div>

      {/* Selected student panel */}
      {selected && (
        <>
          <StudentInfoCard student={cardStudent} loading={detailLoading} className="mb-4" />

          <div className="mb-4 rounded-3xl bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">Niveles de clase</h3>
              {classesLoading && <span className="text-[10px] font-semibold text-slate-400">Cargando...</span>}
            </div>
            {studentClasses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-xs text-slate-400">
                El alumno no tiene clases activas asignadas.
              </div>
            ) : (
              <div className="space-y-3">
                {studentClasses.map((cl) => {
                  const classId = cl.classId || cl.id;
                  const detail = classDetails[classId];
                  const levels = detail?.ownLevels ?? [];
                  const selectedLevel = levels.find((l) => l.id === cl.levelId);
                  return (
                    <div key={classId} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{cl.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {cl.disciplineName || "Disciplina"}{selectedLevel ? ` · ${selectedLevel.objectives?.length ?? 0} objetivos` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openLevelModal(classId)}
                          className="shrink-0 rounded-full bg-[var(--primary)] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                          disabled={!detail}
                        >
                          Nuevo
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <select
                          value={cl.levelId ?? ""}
                          onChange={(e) => void handleStudentLevelChange(classId, e.target.value)}
                          disabled={!detail || savingClassLevel === classId}
                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none disabled:opacity-50"
                        >
                          <option value="">Sin nivel</option>
                          {levels.map((level) => (
                            <option key={level.id} value={level.id}>
                              {level.name}
                            </option>
                          ))}
                        </select>
                        {selectedLevel && (
                          <button
                            type="button"
                            onClick={() => openLevelModal(classId, selectedLevel)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-500"
                            aria-label="Editar nivel"
                          >
                            <MaterialIcon name="edit" className="text-sm" />
                          </button>
                        )}
                      </div>
                      {detail && levels.length === 0 && (
                        <p className="mt-2 text-[11px] text-amber-600">Creá un nivel con objetivos para habilitar el seguimiento.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Objectives */}
          <div className="mb-4 rounded-3xl bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">
                Objetivos del nivel
              </h3>
              {objectives.length > 0 && (
                <span className="text-[10px] font-semibold text-slate-400">
                  {objectives.filter((o) => o.progress === 100).length}/{objectives.length} completados
                </span>
              )}
            </div>

            {objectivesLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="h-3 w-3 animate-pulse rounded-full bg-[var(--primary)]" />
              </div>
            ) : objectives.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-slate-400">
                <MaterialIcon name="flag" className="text-xl text-slate-300" />
                <p className="text-xs">Sin objetivos configurados para el nivel del alumno. Se cargan desde la clase, en el nivel correspondiente.</p>
              </div>
            ) : (
                <div className="space-y-3">
                  {(() => {
                    const groups = objectives.reduce<Record<string, { className: string; levelName: string; items: StudentObjectiveProgress[] }>>(
                      (acc, o) => {
                        const key = o.levelId;
                        if (!acc[key]) acc[key] = { className: o.className ?? "", levelName: o.levelName ?? "", items: [] };
                        acc[key].items.push(o);
                        return acc;
                      },
                      {}
                    );
                    return Object.entries(groups).map(([levelId, group]) => (
                      <div key={levelId}>
                        {Object.keys(groups).length > 1 && (
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            {group.className} · {group.levelName}
                          </p>
                        )}
                        <div className="space-y-3">
                          {group.items.map((obj) => (
                            <div key={obj.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  onClick={() => handleObjectiveProgress(obj.id, obj.progress === 100 ? 0 : 100)}
                                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                    obj.progress === 100
                                      ? "border-[var(--primary)] bg-[var(--primary)]"
                                      : "border-slate-300 bg-white"
                                  }`}
                                  aria-label={obj.progress === 100 ? "Marcar incompleto" : "Marcar completo"}
                                >
                                  {obj.progress === 100 && (
                                    <MaterialIcon name="check" className="text-[11px] font-bold text-white" />
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-sm font-semibold leading-snug ${obj.progress === 100 ? "text-slate-400 line-through" : "text-slate-800"}`}>
                                    {obj.title}
                                  </p>
                                  <div className="mt-2 flex items-center gap-2">
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={5}
                                      value={obj.progress}
                                      onChange={(e) => {
                                        const val = Number(e.target.value);
                                        setObjectives((prev) => prev.map((o) => o.id === obj.id ? { ...o, progress: val } : o));
                                      }}
                                      onMouseUp={(e) => handleObjectiveProgress(obj.id, Number((e.target as HTMLInputElement).value))}
                                      onTouchEnd={(e) => handleObjectiveProgress(obj.id, Number((e.target as HTMLInputElement).value))}
                                      disabled={savingObjective === obj.id}
                                      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-[var(--primary)] disabled:opacity-50"
                                    />
                                    <span className={`w-9 shrink-0 text-right text-xs font-bold tabular-nums ${obj.progress === 100 ? "text-[var(--primary)]" : "text-slate-500"}`}>
                                      {obj.progress}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

          {/* New report form */}
          <div className="mb-4 rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
            <h3 className="mb-3 text-sm font-bold text-slate-700">
              Nuevo informe — {selected.firstName}
            </h3>

            <div className="mb-3">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Tipo de informe
              </label>
              <div className="flex flex-wrap gap-2">
                {REPORT_TYPES.map((rt) => (
                  <button
                    key={rt.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type: rt.value }))}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      form.type === rt.value
                        ? "bg-[var(--primary)] text-white"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              placeholder="Título del informe..."
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[var(--primary)] focus:bg-white"
            />

            <textarea
              placeholder="Describe el progreso, observaciones o notas sobre el alumno..."
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={5}
              className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[var(--primary)] focus:bg-white"
            />

            <div className="mt-3">
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Valoración (opcional)
              </label>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <RatingPicker
                  rating={form.rating}
                  theme={form.ratingTheme}
                  onChange={(rating, ratingTheme) => setForm((f) => ({ ...f, rating, ratingTheme }))}
                />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {["PUBLISHED", "DRAFT"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, status: s }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    form.status === s
                      ? "bg-[var(--primary)] text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {s === "PUBLISHED" ? "Publicar" : "Guardar borrador"}
                </button>
              ))}
            </div>

            {submitError && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                <MaterialIcon name="error" className="mt-0.5 shrink-0 text-sm text-red-500" />
                <span>{submitError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!form.title.trim() || !form.content.trim() || submitting}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--primary)] py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Guardando..." : "Guardar informe"}
              <MaterialIcon name="save" className="text-sm" />
            </button>
          </div>

          {/* Reports list */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700">
                Informes de {selected.firstName}
              </h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                {studentReports.length}
              </span>
            </div>

            {fetchError && (
              <div className="mb-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <MaterialIcon name="warning" className="mt-0.5 shrink-0 text-sm text-amber-500" />
                <span>Error al cargar informes: {fetchError}</span>
              </div>
            )}

            {reportsLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-3 w-3 animate-pulse rounded-full bg-[var(--primary)]" />
              </div>
            ) : studentReports.length > 0 ? (
              <div className="space-y-3">
                {studentReports.map((report) => (
                  <div key={report.id} className="rounded-3xl bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLES[report.status] ?? "bg-slate-100 text-slate-500"}`}>
                            {STATUS_LABELS[report.status] ?? report.status}
                          </span>
                          <span className="text-[10px] text-slate-400">{report.type}</span>
                        </div>
                        <h4 className="mt-2 font-bold text-slate-900">{report.title}</h4>
                        {report.rating ? (
                          <div className="mt-2">
                            <RatingDisplay rating={report.rating} theme={report.ratingTheme || "stars"} />
                          </div>
                        ) : null}
                        <p className="mt-1 line-clamp-3 text-sm text-slate-500">{report.content}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 border-t border-slate-50 pt-3 text-xs text-slate-400">
                      <MaterialIcon name="edit" className="text-xs" />
                      <span>{report.author.firstName} {report.author.lastName}</span>
                      <span>·</span>
                      <span>{formatDate(report.publishedAt ?? report.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-200 py-12 text-center">
                <MaterialIcon name="menu_book" className="text-4xl text-slate-200" />
                <h3 className="font-semibold text-slate-600">Sin informes aún</h3>
                <p className="text-sm text-slate-400">Completá el formulario de arriba para crear el primer informe de {selected.firstName}.</p>
              </div>
            )}
          </div>
        </>
      )}

      {!selected && !loading && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-200 py-14 text-center">
          <MaterialIcon name="person_search" className="text-4xl text-slate-200" />
          <h3 className="font-semibold text-slate-600">Seleccioná un alumno</h3>
          <p className="text-sm text-slate-400">Elegí un alumno del listado para ver su información y crear informes.</p>
        </div>
      )}

      {levelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 px-3 py-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-800">{levelDraft.id ? "Editar nivel" : "Nuevo nivel"}</h2>
              <button type="button" onClick={() => setLevelModalOpen(false)} className="rounded-full p-2 text-slate-400">
                <MaterialIcon name="close" className="text-base" />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 py-4">
              <input
                value={levelDraft.name}
                onChange={(e) => setLevelDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Nombre del nivel"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[var(--primary)] focus:bg-white"
              />
              <textarea
                value={levelDraft.description}
                onChange={(e) => setLevelDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Descripción"
                rows={2}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[var(--primary)] focus:bg-white"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={levelDraft.levelOrder}
                  onChange={(e) => setLevelDraft((prev) => ({ ...prev, levelOrder: Number(e.target.value) }))}
                  className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                  aria-label="Orden"
                />
                <input
                  type="color"
                  value={levelDraft.color}
                  onChange={(e) => setLevelDraft((prev) => ({ ...prev, color: e.target.value }))}
                  className="h-12 w-14 rounded-2xl border border-slate-200 bg-white p-1"
                  aria-label="Color"
                />
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Objetivos</h3>
                  <button type="button" onClick={addLevelObjective} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-[var(--primary)]">
                    Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {levelDraft.objectives.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-xs text-slate-400">
                      Sin objetivos cargados.
                    </p>
                  )}
                  {levelDraft.objectives.map((objective, index) => (
                    <div key={objective.id} className="flex items-center gap-2 rounded-xl bg-white px-2 py-2">
                      <input
                        value={objective.title}
                        onChange={(e) => updateLevelObjective(objective.id, e.target.value)}
                        placeholder={`Objetivo ${index + 1}`}
                        className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm outline-none"
                      />
                      <button type="button" onClick={() => removeLevelObjective(objective.id)} className="rounded-full p-1.5 text-slate-300">
                        <MaterialIcon name="delete" className="text-sm" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
              <button type="button" onClick={() => setLevelModalOpen(false)} className="flex-1 rounded-full border border-slate-200 py-2.5 text-sm font-semibold text-slate-500">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitLevel()}
                disabled={!levelDraft.name.trim() || savingClassLevel === levelDraft.classId}
                className="flex-1 rounded-full bg-[var(--primary)] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingClassLevel === levelDraft.classId ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
