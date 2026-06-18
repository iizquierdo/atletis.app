import { useEffect, useMemo, useRef, useState } from "react";
import { CustomSelect } from "../components/CustomSelect";
import { MaterialIcon } from "../components/MaterialIcon";
import { StudentInfoCard, studentLabel } from "../components/StudentInfoCard";
import {
  createConversation,
  fetchConversations,
  fetchStudentDetail,
  fetchStudents,
  sendConversationMessage
} from "../lib/data";
import { extractErrorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { StudentConversation, StudentSummary } from "../types";

const formatTime = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "";
  }
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(iso));
  } catch {
    return "";
  }
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-500",
  ARCHIVED: "bg-blue-50 text-blue-600"
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Abierta",
  CLOSED: "Cerrada",
  ARCHIVED: "Archivada"
};

const demoStudents: StudentSummary[] = [
  { id: "s1", firstName: "Lucas", lastName: "Rodríguez", status: "ACTIVE" },
  { id: "s2", firstName: "Valentina", lastName: "González", status: "ACTIVE" },
  { id: "s3", firstName: "Mateo", lastName: "Pérez", status: "ACTIVE" }
];

const emptyConvForm = () => ({ subject: "", firstMessage: "" });

export const ChatPage = () => {
  const { user } = useAuth();
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [studentDetail, setStudentDetail] = useState<StudentSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [conversations, setConversations] = useState<StudentConversation[]>([]);
  const [activeConv, setActiveConv] = useState<StudentConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [convsLoading, setConvsLoading] = useState(false);
  const [convsError, setConvsError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [convModalOpen, setConvModalOpen] = useState(false);
  const [convForm, setConvForm] = useState(emptyConvForm);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = students.find((st) => st.id === selectedId) ?? null;
  const cardStudent = studentDetail ?? selected;
  const myId = user?.id ?? "me";

  useEffect(() => {
    fetchStudents()
      .then((data) => {
        const active = data.filter((s) => s.status === "ACTIVE");
        setStudents(active.length > 0 ? active : demoStudents);
      })
      .catch(() => setStudents(demoStudents))
      .finally(() => setLoading(false));
  }, []);

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

  const loadConversations = async (studentId: string, selectId?: string) => {
    setConvsLoading(true);
    setConvsError(null);
    try {
      const data = await fetchConversations(studentId);
      setConversations(data);
      if (selectId) {
        const found = data.find((c) => c.id === selectId);
        setActiveConv(found ?? null);
      } else {
        setActiveConv(null);
      }
    } catch (err: unknown) {
      setConvsError(extractErrorMessage(err));
      setConversations([]);
      setActiveConv(null);
    } finally {
      setConvsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedId) {
      setConversations([]);
      setActiveConv(null);
      return;
    }
    void loadConversations(selectedId);
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConv?.messages]);

  const studentOptions = useMemo(
    () => students.map((st) => ({ value: st.id, label: studentLabel(st) })),
    [students]
  );

  const handleStudentChange = (id: string) => {
    setSelectedId(id);
    setStudentDetail(null);
    setActiveConv(null);
    setDraft("");
    setConvForm(emptyConvForm());
    setCreateError(null);
  };

  const handleSend = async () => {
    if (!draft.trim() || !activeConv || sending) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");

    const optimistic = {
      id: `temp-${Date.now()}`,
      conversationId: activeConv.id,
      senderId: myId,
      body,
      createdAt: new Date().toISOString(),
      sender: {
        id: myId,
        firstName: user?.firstName ?? "Prof.",
        lastName: user?.lastName ?? ""
      },
      attachments: [] as []
    };

    setActiveConv((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimistic] } : null
    );
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConv.id ? { ...c, messages: [...c.messages, optimistic] } : c
      )
    );

    try {
      await sendConversationMessage(activeConv.id, body);
    } catch {
      // optimistic message stays
    } finally {
      setSending(false);
    }
  };

  const handleCreateConversation = async () => {
    if (!selectedId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const conv = await createConversation(selectedId, {
        subject: convForm.subject.trim() || undefined,
        firstMessage: convForm.firstMessage.trim() || undefined
      });
      setConvModalOpen(false);
      setConvForm(emptyConvForm());
      await loadConversations(selectedId, conv.id);
    } catch (err: unknown) {
      setCreateError(extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const lastMessagePreview = (conv: StudentConversation) => {
    const last = conv.messages[conv.messages.length - 1];
    if (!last) return "Sin mensajes";
    const prefix = last.senderId === myId ? "Vos: " : "";
    return `${prefix}${last.body}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20">
        <div className="h-3 w-3 animate-pulse rounded-full bg-[var(--primary)]" />
        <p className="text-sm text-slate-400">Cargando mensajes...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-4 pb-6 pt-5" style={{ minHeight: "calc(100vh - 10rem)" }}>
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Chat</h1>
        <p className="mt-1 text-sm text-slate-500">
          Mensajes con tutores y familias de {students.length} alumnos
        </p>
      </header>

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

      {selected && (
        <>
          <StudentInfoCard student={cardStudent} loading={detailLoading} className="mb-4" />

          {activeConv ? (
            <div className="flex flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
              <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-3">
                <button
                  type="button"
                  onClick={() => setActiveConv(null)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100"
                  aria-label="Volver a conversaciones"
                >
                  <MaterialIcon name="arrow_back" className="text-lg" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {activeConv.subject || "Conversación"}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {studentLabel(selected)}
                    {activeConv.participants.length > 0 &&
                      ` · ${activeConv.participants
                        .filter((p) => p.userId !== myId)
                        .map((p) => `${p.user.firstName} ${p.user.lastName}`.trim())
                        .join(", ")}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    STATUS_STYLES[activeConv.status] ?? "bg-slate-100 text-slate-500"
                  }`}
                >
                  {STATUS_LABELS[activeConv.status] ?? activeConv.status}
                </span>
              </div>

              <div
                className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
                style={{
                  minHeight: "36vh",
                  maxHeight: "52vh",
                  background:
                    "radial-gradient(circle at 1px 1px, rgba(128,182,195,0.25) 1px, transparent 0) 0 0 / 18px 18px"
                }}
              >
                {activeConv.messages.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
                    <MaterialIcon name="chat_bubble_outline" className="text-3xl text-slate-200" />
                    <p className="text-sm text-slate-400">Sin mensajes aún. Escribí el primero.</p>
                  </div>
                ) : (
                  activeConv.messages.map((msg) => {
                    const isMine = msg.senderId === myId || msg.senderId === "me";
                    return (
                      <div
                        key={msg.id}
                        className={`flex max-w-[85%] items-end gap-2 ${isMine ? "flex-row-reverse self-end" : "self-start"}`}
                      >
                        {!isMine && (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary-softer)] text-[10px] font-bold text-[var(--primary)]">
                            {msg.sender.firstName.charAt(0)}
                          </span>
                        )}
                        <div
                          className={`rounded-2xl px-3 py-2 shadow-sm ${
                            isMine
                              ? "bg-gradient-to-br from-[var(--primary-dim)] to-[var(--primary)] text-white"
                              : "bg-[#bdefff] text-slate-800"
                          }`}
                        >
                          {!isMine && (
                            <p className="mb-0.5 text-[10px] font-bold opacity-70">
                              {msg.sender.firstName} {msg.sender.lastName}
                            </p>
                          )}
                          <p className="text-sm leading-relaxed">{msg.body}</p>
                          <p className={`mt-1 text-[10px] ${isMine ? "text-white/70" : "text-slate-500"}`}>
                            {formatTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="flex items-center gap-2 border-t border-slate-100 bg-[rgba(191,238,254,0.5)] px-3 py-3">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Escribí un mensaje..."
                  className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none shadow-sm focus:border-[var(--primary)]"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!draft.trim() || sending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-md disabled:opacity-40"
                >
                  <MaterialIcon name="send" filled className="text-base" />
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-700">
                  Conversaciones de {selected.firstName}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setConvForm(emptyConvForm());
                    setCreateError(null);
                    setConvModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
                >
                  <MaterialIcon name="add" className="text-sm" />
                  Nueva
                </button>
              </div>

              {convsError && (
                <div className="mb-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <MaterialIcon name="warning" className="mt-0.5 shrink-0 text-sm text-amber-500" />
                  <span>Error al cargar conversaciones: {convsError}</span>
                </div>
              )}

              {convsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-[var(--primary)]" />
                </div>
              ) : conversations.length > 0 ? (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setActiveConv(conv)}
                      className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-[0_4px_20px_rgb(0,0,0,0.04)] transition-colors hover:bg-slate-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--primary-softer)] text-[var(--primary)]">
                        <MaterialIcon name="forum" className="text-lg" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-bold text-slate-900">
                            {conv.subject || "Conversación"}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                              STATUS_STYLES[conv.status] ?? "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {STATUS_LABELS[conv.status] ?? conv.status}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {lastMessagePreview(conv)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-slate-400">
                          {formatDate(conv.updatedAt ?? conv.createdAt)}
                        </p>
                        {conv.messages.length > 0 && (
                          <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            {conv.messages.length}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-200 py-12 text-center">
                  <MaterialIcon name="forum" className="text-4xl text-slate-200" />
                  <h3 className="font-semibold text-slate-600">Sin conversaciones</h3>
                  <p className="text-sm text-slate-400">
                    Iniciá un chat con los tutores de {selected.firstName}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setConvForm(emptyConvForm());
                      setCreateError(null);
                      setConvModalOpen(true);
                    }}
                    className="mt-1 flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
                  >
                    <MaterialIcon name="add" className="text-sm" />
                    Nueva conversación
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!selected && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-slate-200 py-14 text-center">
          <MaterialIcon name="person_search" className="text-4xl text-slate-200" />
          <h3 className="font-semibold text-slate-600">Seleccioná un alumno</h3>
          <p className="text-sm text-slate-400">
            Elegí un alumno del listado para ver sus mensajes con los tutores.
          </p>
        </div>
      )}

      {convModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/40"
            onClick={() => setConvModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-[480px] rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:mx-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Nueva conversación</h3>
              <button
                type="button"
                onClick={() => setConvModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
              >
                <MaterialIcon name="close" />
              </button>
            </div>

            {selected && (
              <p className="mb-4 text-sm text-slate-500">
                Con los tutores de <span className="font-semibold text-slate-700">{studentLabel(selected)}</span>
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Asunto (opcional)
                </label>
                <input
                  type="text"
                  value={convForm.subject}
                  onChange={(e) => setConvForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="Ej: Consulta sobre horarios"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[var(--primary)] focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Primer mensaje (opcional)
                </label>
                <textarea
                  value={convForm.firstMessage}
                  onChange={(e) => setConvForm((f) => ({ ...f, firstMessage: e.target.value }))}
                  placeholder="Escribí el primer mensaje..."
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[var(--primary)] focus:bg-white"
                />
              </div>
            </div>

            {createError && (
              <div className="mt-3 flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
                <MaterialIcon name="error" className="mt-0.5 shrink-0 text-sm text-red-500" />
                <span>{createError}</span>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConvModalOpen(false)}
                className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-semibold text-slate-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleCreateConversation()}
                disabled={creating}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--primary)] py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {creating ? "Creando..." : "Crear"}
                <MaterialIcon name="send" className="text-sm" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
