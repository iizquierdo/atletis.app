import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useAuth } from "../context/AuthContext";
import { useStudents } from "../context/StudentContext";
import { extractErrorMessage } from "../lib/api";
import {
  createConversation,
  fetchConversations,
  fetchStudentNotebook,
  sendConversationMessage
} from "../lib/data";
import type { ConversationStatus, StudentConversation, StudentNotebookDetail, UserRef } from "../types";

type ArchiveFilter = "ALL" | ConversationStatus;

const getDateValue = (value?: string | null) => {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatClock = (value?: string | null) => {
  const timestamp = getDateValue(value);
  if (!timestamp) return "--:--";
  return new Date(timestamp).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit"
  });
};

const formatTicketDate = (value?: string | null) => {
  const timestamp = getDateValue(value);
  if (!timestamp) return "SIN FECHA";
  return new Date(timestamp)
    .toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short"
    })
    .toUpperCase();
};

const statusLabel: Record<ConversationStatus, string> = {
  OPEN: "ACTIVO",
  CLOSED: "FINALIZADO",
  ARCHIVED: "ARCHIVADO"
};

const statusClass: Record<ConversationStatus, string> = {
  OPEN: "open",
  CLOSED: "closed",
  ARCHIVED: "archived"
};

const getLastMessage = (conversation: StudentConversation) => {
  if (!conversation.messages.length) return null;
  return [...conversation.messages].sort(
    (left, right) =>
      getDateValue(right.createdAt) - getDateValue(left.createdAt)
  )[0];
};

const truncate = (value: string, max = 100) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}...`;
};

const getTeacherFromConversations = (conversations: StudentConversation[]) => {
  for (const conversation of conversations) {
    const teacher = conversation.participants.find((participant) => participant.user.role === "PROFESOR");
    if (teacher) return teacher.user;
  }
  return null;
};

export const CuadernoPage = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { selectedStudent } = useStudents();
  const isChatRoute = pathname.startsWith("/chat");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentNotebookDetail | null>(null);
  const [conversations, setConversations] = useState<StudentConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("ALL");
  const [showNewConsult, setShowNewConsult] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);

  const studentId = selectedStudent?.id ?? null;

  const loadNotebook = useCallback(
    async (preferredConversationId?: string) => {
      if (!studentId) {
        setStudentDetail(null);
        setConversations([]);
        setActiveConversationId(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [studentDetailData, conversationsData] = await Promise.all([
          fetchStudentNotebook(studentId),
          fetchConversations(studentId)
        ]);

        const orderedConversations = [...conversationsData].sort(
          (left, right) => getDateValue(right.updatedAt) - getDateValue(left.updatedAt)
        );

        setStudentDetail(studentDetailData);
        setConversations(orderedConversations);

        setActiveConversationId((current) => {
          const preferred = preferredConversationId ?? current;
          if (preferred && orderedConversations.some((conversation) => conversation.id === preferred)) {
            return preferred;
          }

          const openConversation = orderedConversations.find((conversation) => conversation.status === "OPEN");
          return openConversation?.id ?? orderedConversations[0]?.id ?? null;
        });
      } catch (requestError) {
        setError(extractErrorMessage(requestError));
      } finally {
        setLoading(false);
      }
    },
    [studentId]
  );

  useEffect(() => {
    void loadNotebook();
  }, [loadNotebook]);

  const assignedTeacher = useMemo<UserRef | null>(() => {
    const teacherByAssignment = studentDetail?.teacherAssignments?.[0]?.teacher;
    if (teacherByAssignment) return teacherByAssignment;
    return getTeacherFromConversations(conversations);
  }, [conversations, studentDetail]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );

  const sortedMessages = useMemo(() => {
    if (!activeConversation) return [];
    return [...activeConversation.messages].sort(
      (left, right) => getDateValue(left.createdAt) - getDateValue(right.createdAt)
    );
  }, [activeConversation]);

  const archiveConversations = useMemo(() => {
    const base = conversations.filter((conversation) => conversation.id !== activeConversation?.id);
    if (archiveFilter === "ALL") return base;
    return base.filter((conversation) => conversation.status === archiveFilter);
  }, [activeConversation?.id, archiveFilter, conversations]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeConversation || !messageDraft.trim()) return;

    setSending(true);
    setError(null);

    try {
      await sendConversationMessage(activeConversation.id, messageDraft.trim());
      setMessageDraft("");
      await loadNotebook(activeConversation.id);
    } catch (requestError) {
      setError(extractErrorMessage(requestError));
    } finally {
      setSending(false);
    }
  };

  const createConsult = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!studentId || !newSubject.trim() || !newMessage.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const participantIds = assignedTeacher ? [assignedTeacher.id] : [];
      const created = await createConversation(studentId, {
        subject: newSubject.trim(),
        participantIds,
        firstMessage: { body: newMessage.trim() }
      });

      setShowNewConsult(false);
      setNewSubject("");
      setNewMessage("");
      await loadNotebook(created.id);
    } catch (requestError) {
      setError(extractErrorMessage(requestError));
    } finally {
      setCreating(false);
    }
  };

  if (!selectedStudent) {
    return (
      <section className="empty-state-card">
        <h3>Sin alumno seleccionado</h3>
        <p>Selecciona un atleta en Resumen para abrir su cuaderno de notas.</p>
      </section>
    );
  }

  return (
    <div className="screen-stack notebook-screen">
      {error && (
        <div className="error-banner">
          <MaterialIcon className="error-banner-icon" name="warning" />
          <span>{error}</span>
        </div>
      )}

      <section className="notebook-hero">
        <span>{isChatRoute ? "COMUNICATE CON EL PROFE" : "INTERACCION FAMILIAR"}</span>
        {!isChatRoute && (
          <h2>
            Cuaderno de <em>Notas Digital</em>
          </h2>
        )}

        <div className="teacher-pill">
          <div>
            <small>Profesor Asignado</small>
            <p>
              {assignedTeacher
                ? `${assignedTeacher.firstName} ${assignedTeacher.lastName}`
                : "Sin profesor asignado"}
            </p>
          </div>
          <div className="teacher-avatar">
            <MaterialIcon name="school" />
          </div>
        </div>
      </section>

      <section className="notebook-chat-card">
        <header className="notebook-chat-head">
          <div className="chat-head-left">
            <span className="status-dot" />
            <h3>Conversacion Activa</h3>
          </div>
          <small>
            ID: #
            {activeConversation?.id.slice(-6).toUpperCase() ?? "------"}
          </small>
        </header>

        <div className="notebook-chat-body">
          {loading && <p className="notebook-placeholder">Cargando mensajes...</p>}

          {!loading && !activeConversation && (
            <p className="notebook-placeholder">
              No hay conversaciones activas. Crea una nueva consulta para comenzar.
            </p>
          )}

          {!loading &&
            sortedMessages.map((message) => {
              const isMine = message.senderId === user?.id;
              return (
                <div className={`chat-row ${isMine ? "mine" : "theirs"}`} key={message.id}>
                  {!isMine && <div className="chat-avatar">{message.sender.firstName.charAt(0)}</div>}
                  <div className="chat-bubble">
                    <p>{message.body}</p>

                    {message.attachments.length > 0 && (
                      <div className="chat-attachments">
                        {message.attachments.map((attachment, index) => (
                          <a href={attachment.fileUrl} key={`${message.id}-${index}`} rel="noreferrer" target="_blank">
                            <MaterialIcon name="attach_file" />
                            {attachment.fileName}
                          </a>
                        ))}
                      </div>
                    )}

                    <small>{formatClock(message.createdAt)}</small>
                  </div>
                </div>
              );
            })}
        </div>

        <form className="notebook-compose" onSubmit={sendMessage}>
          <input
            onChange={(event) => setMessageDraft(event.target.value)}
            placeholder="Escribe un mensaje..."
            type="text"
            value={messageDraft}
          />
          <button disabled={sending || !activeConversation || !messageDraft.trim()} type="submit">
            <MaterialIcon name="send" filled />
          </button>
        </form>
      </section>

      <section className="notebook-archive-card">
        <header className="notebook-archive-head">
          <h3>Archivo de Tickets</h3>
          <label>
            <MaterialIcon name="filter_list" />
            <select
              onChange={(event) => setArchiveFilter(event.target.value as ArchiveFilter)}
              value={archiveFilter}
            >
              <option value="ALL">Todos</option>
              <option value="OPEN">Activos</option>
              <option value="CLOSED">Finalizados</option>
              <option value="ARCHIVED">Archivados</option>
            </select>
          </label>
        </header>

        <div className="archive-list">
          {archiveConversations.length === 0 && (
            <p className="notebook-placeholder">No hay tickets para este filtro.</p>
          )}

          {archiveConversations.map((conversation) => {
            const lastMessage = getLastMessage(conversation);
            return (
              <button
                className="archive-item"
                key={conversation.id}
                onClick={() => setActiveConversationId(conversation.id)}
                type="button"
              >
                <div className="archive-item-head">
                  <div className="archive-badges">
                    <span className={`status-pill ${statusClass[conversation.status]}`}>
                      {statusLabel[conversation.status]}
                    </span>
                    <span className="date-pill">{formatTicketDate(conversation.updatedAt)}</span>
                  </div>
                  <MaterialIcon name="arrow_forward" />
                </div>
                <h4>{conversation.subject || "Consulta sin asunto"}</h4>
                <p>
                  Ultimo mensaje: "{lastMessage ? truncate(lastMessage.body, 85) : "Sin mensajes todavia."}"
                </p>
              </button>
            );
          })}
        </div>

        {showNewConsult && (
          <form className="new-consult-form" onSubmit={createConsult}>
            <input
              onChange={(event) => setNewSubject(event.target.value)}
              placeholder="Asunto de la consulta"
              type="text"
              value={newSubject}
            />
            <textarea
              onChange={(event) => setNewMessage(event.target.value)}
              placeholder="Escribe la primera nota para el profesor..."
              rows={3}
              value={newMessage}
            />
            <div className="new-consult-actions">
              <button disabled={creating} type="submit">
                {creating ? "Creando..." : "Crear consulta"}
              </button>
              <button
                onClick={() => {
                  setShowNewConsult(false);
                  setNewSubject("");
                  setNewMessage("");
                }}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <button className="new-consult-toggle" onClick={() => setShowNewConsult((current) => !current)} type="button">
          <MaterialIcon name="add_comment" />
          NUEVA CONSULTA
        </button>
      </section>
    </div>
  );
};
