import { useEffect, useMemo, useState } from "react";
import { CustomSelect } from "../components/CustomSelect";
import { MaterialIcon } from "../components/MaterialIcon";
import { RatingDisplay, RatingPicker } from "../components/RatingPicker";
import { StudentInfoCard, studentLabel } from "../components/StudentInfoCard";
import { fetchStudents, fetchStudentDetail, fetchReports, createReport, fetchStudentObjectives, updateObjectiveProgress } from "../lib/data";
import { extractErrorMessage } from "../lib/api";
import type { StudentSummary, StudentReport, StudentObjectiveProgress } from "../types";

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
    </div>
  );
};
