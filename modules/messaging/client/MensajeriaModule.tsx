import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppUser, ViewType } from '@sinapsis/shared-types';
import { mediaUrl } from '@webapp/lib/media';

interface MensajeriaModuleProps {
  view: 'list' | 'thread';
  setView: (view: ViewType, params?: Record<string, string>) => void;
  currentUser?: AppUser;
  companyId?: string;
  threadId?: string;
  onSubTitleChange?: (s: string) => void;
}

interface Participant {
  userId: string;
  name: string;
  imageUrl?: string | null;
}

interface Thread {
  id: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  subject: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string | null;
  unreadCount: number;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastSenderName?: string | null;
  participants: Participant[] | null;
  companyName?: string;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  firstName?: string;
  lastName?: string;
  senderName?: string;
  senderImageUrl?: string | null;
}

interface StudentContact {
  id: string;
  firstName: string;
  lastName: string;
  companyId: string;
  companyName?: string;
}

const fullName = (p: { firstName?: string; lastName?: string; name?: string }): string => {
  const full = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return full || p.name || '?';
};

const studentLabel = (t: Pick<Thread, 'studentFirstName' | 'studentLastName'>): string =>
  [t.studentFirstName, t.studentLastName].filter(Boolean).join(' ') || '—';

const timeLabel = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
};

const Avatar: React.FC<{ name: string; imageUrl?: string | null; size?: number; bg?: string }> = ({
  name, imageUrl, size = 36, bg = 'var(--primary)'
}) => {
  const initials = name.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  if (imageUrl) {
    return (
      <img
        src={mediaUrl(imageUrl)}
        alt={name}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 700, flexShrink: 0, letterSpacing: 0.5 }}>
      {initials}
    </div>
  );
};

// Small stacked participant avatars (max 3 shown)
const ParticipantAvatarRow: React.FC<{ participants: Participant[]; size?: number }> = ({ participants, size = 24 }) => {
  const shown = participants.slice(0, 3);
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <div key={p.userId} title={p.name} style={{ marginLeft: i > 0 ? -(size * 0.3) : 0, zIndex: shown.length - i, border: '2px solid var(--card)', borderRadius: '50%' }}>
          <Avatar name={p.name} imageUrl={p.imageUrl} size={size} bg={i === 0 ? 'var(--primary)' : '#6b7280'} />
        </div>
      ))}
    </div>
  );
};

const MensajeriaModule: React.FC<MensajeriaModuleProps> = ({ view, setView, currentUser, threadId, onSubTitleChange }) => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [students, setStudents] = useState<StudentContact[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newStudentId, setNewStudentId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/messaging/threads');
      if (r.ok) setThreads(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (tid: string) => {
    setLoadingMsgs(true);
    try {
      const r = await fetch(`/api/messaging/threads/${tid}/messages`);
      if (r.ok) {
        setMessages(await r.json());
        setThreads((prev) => prev.map((t) => t.id === tid ? { ...t, unreadCount: 0 } : t));
      }
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const r = await fetch('/api/messaging/contacts');
      if (r.ok) setStudents(await r.json());
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  useEffect(() => {
    if (threadId) {
      const cached = threads.find((t) => t.id === threadId);
      if (cached) {
        setActiveThread(cached);
        onSubTitleChange?.(studentLabel(cached));
      } else {
        fetch(`/api/messaging/threads/${threadId}`)
          .then((r) => r.ok ? r.json() : null)
          .then((t) => { if (t) { setActiveThread(t); onSubTitleChange?.(studentLabel(t)); } });
      }
      loadMessages(threadId);
    } else {
      setActiveThread(null);
      setMessages([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openThread = (t: Thread) => {
    setActiveThread(t);
    setView('MessagingThread', { id: t.id });
  };

  const sendMessage = async () => {
    if (!body.trim() || !activeThread || sending) return;
    const text = body.trim();
    setSending(true);
    try {
      const r = await fetch(`/api/messaging/threads/${activeThread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text })
      });
      if (r.ok) {
        const msg = await r.json();
        setMessages((prev) => [...prev, msg]);
        setBody('');
        setThreads((prev) => prev.map((t) => t.id === activeThread.id
          ? { ...t, lastMessageBody: text, lastMessageAt: new Date().toISOString() }
          : t
        ));
      }
    } finally {
      setSending(false);
    }
  };

  const createNewThread = async () => {
    if (!newStudentId) return;
    const r = await fetch('/api/messaging/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: newStudentId, subject: newSubject || undefined })
    });
    if (r.ok) {
      const thread = await r.json();
      setShowNew(false);
      setNewStudentId('');
      setNewSubject('');
      await loadThreads();
      openThread(thread);
    }
  };

  const filteredThreads = threads.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      studentLabel(t).toLowerCase().includes(q) ||
      (t.subject || '').toLowerCase().includes(q) ||
      (t.lastMessageBody || '').toLowerCase().includes(q) ||
      (t.participants || []).some((p) => p.name.toLowerCase().includes(q))
    );
  });

  const isMyMessage = (msg: Message) => msg.senderId === currentUser?.id;

  const otherParticipants = (t: Thread): Participant[] =>
    (t.participants || []).filter((p) => p.userId !== currentUser?.id);

  // ── Thread list panel ────────────────────────────────────────────────────
  const threadListPanel = (
    <div style={{ width: 320, minWidth: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--card)' }}>
      <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>Mensajes</span>
          <button
            onClick={() => { setShowNew(true); loadStudents(); }}
            style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}
          >
            <i className="fa-solid fa-pen-to-square" style={{ fontSize: 11 }} /> Nuevo
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar alumno, tema, participante..."
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>Cargando...</div>}
        {!loading && filteredThreads.length === 0 && (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>
            <i className="fa-regular fa-comments" style={{ fontSize: 28, marginBottom: 8, display: 'block' }} />
            No hay conversaciones
          </div>
        )}

        {filteredThreads.map((t) => {
          const sName = studentLabel(t);
          const others = otherParticipants(t);
          const unread = t.unreadCount;
          const isActive = t.id === threadId;
          const lastTime = t.lastMessageAt || t.createdAt;

          return (
            <div
              key={t.id}
              onClick={() => openThread(t)}
              style={{
                display: 'flex', gap: 10, padding: '11px 14px', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                background: isActive ? 'color-mix(in srgb, var(--primary) 8%, transparent)' : 'transparent',
                transition: 'background 0.12s',
                borderLeft: unread > 0 ? '3px solid var(--primary)' : '3px solid transparent'
              }}
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--accent)'; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              {/* Avatar stack for participants, or student initials if no participants */}
              <div style={{ paddingTop: 2, flexShrink: 0 }}>
                {others.length > 0
                  ? <ParticipantAvatarRow participants={others} size={38} />
                  : <Avatar name={sName} size={38} />
                }
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Row 1: participants names + time */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 1 }}>
                  <span style={{ fontWeight: unread ? 700 : 500, fontSize: 13, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                    {others.length > 0 ? others.map((p) => p.name).join(' · ') : sName}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)', flexShrink: 0, marginLeft: 4 }}>
                    {timeLabel(lastTime)}
                  </span>
                </div>

                {/* Row 2: student name + subject */}
                <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <i className="fa-solid fa-user-graduate" style={{ fontSize: 10, marginRight: 4 }} />
                  {sName}{t.subject ? <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}> · {t.subject}</span> : null}
                </div>

                {/* Row 3: last message + unread badge */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: unread ? 'var(--foreground)' : 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: unread ? 600 : 400 }}>
                    {t.lastMessageBody || <em style={{ fontStyle: 'italic' }}>Sin mensajes</em>}
                  </span>
                  {unread > 0 && (
                    <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', marginLeft: 6, flexShrink: 0 }}>
                      {unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Messages panel ────────────────────────────────────────────────────────
  const messagesPanel = activeThread ? (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--background)', minWidth: 0 }}>

      {/* Thread header — student + subject + participants */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--card)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <button onClick={() => setView('Messaging')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '2px 0', marginTop: 2 }}>
          <i className="fa-solid fa-arrow-left" />
        </button>

        {/* Participants avatars */}
        {(activeThread.participants || []).length > 0 && (
          <ParticipantAvatarRow participants={activeThread.participants!} size={40} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Student */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <i className="fa-solid fa-user-graduate" style={{ fontSize: 11, color: 'var(--primary)' }} />
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--foreground)' }}>
              {studentLabel(activeThread)}
            </span>
            {activeThread.companyName && (
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)', background: 'var(--muted)', borderRadius: 4, padding: '1px 6px' }}>
                {activeThread.companyName}
              </span>
            )}
          </div>

          {/* Subject */}
          {activeThread.subject && (
            <div style={{ fontSize: 12, color: 'var(--foreground)', fontWeight: 500, marginBottom: 3 }}>
              <i className="fa-regular fa-file-lines" style={{ fontSize: 10, marginRight: 5, color: 'var(--muted-foreground)' }} />
              {activeThread.subject}
            </div>
          )}

          {/* Participants row with photos */}
          {(activeThread.participants || []).length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {(activeThread.participants || []).map((p, i) => (
                <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {i > 0 && <span style={{ color: 'var(--muted-foreground)', fontSize: 11 }}>·</span>}
                  <Avatar name={p.name} imageUrl={p.imageUrl} size={20} bg={p.userId === currentUser?.id ? 'var(--primary)' : '#6b7280'} />
                  <span style={{ fontSize: 12, color: p.userId === currentUser?.id ? 'var(--primary)' : 'var(--foreground)', fontWeight: p.userId === currentUser?.id ? 600 : 400 }}>
                    {p.name}{p.userId === currentUser?.id ? ' (vos)' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {loadingMsgs && <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>Cargando mensajes...</div>}
        {!loadingMsgs && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13, marginTop: 40 }}>
            <i className="fa-regular fa-comment-dots" style={{ fontSize: 32, marginBottom: 8, display: 'block' }} />
            Iniciá la conversación
          </div>
        )}
        {messages.map((msg) => {
          const mine = isMyMessage(msg);
          const senderLabel = fullName({ firstName: msg.firstName, lastName: msg.lastName, name: msg.senderName });
          return (
            <div key={msg.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
              {!mine && (
                <div style={{ marginRight: 8, flexShrink: 0 }}>
                  <Avatar name={senderLabel} imageUrl={msg.senderImageUrl} size={30} bg="#6b7280" />
                </div>
              )}
              <div style={{ maxWidth: '72%' }}>
                {!mine && (
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 2, marginLeft: 2 }}>
                    {senderLabel}
                  </div>
                )}
                <div style={{
                  background: mine ? 'var(--primary)' : 'var(--card)',
                  color: mine ? '#fff' : 'var(--foreground)',
                  borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '9px 14px',
                  fontSize: 14,
                  lineHeight: 1.5,
                  border: mine ? 'none' : '1px solid var(--border)',
                  wordBreak: 'break-word'
                }}>
                  {msg.body}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 3, textAlign: mine ? 'right' : 'left', paddingLeft: mine ? 0 : 4 }}>
                  {timeLabel(msg.createdAt)}
                  {mine && msg.isRead && <span style={{ marginLeft: 5, color: 'var(--primary)' }}>✓✓</span>}
                </div>
              </div>
              {mine && (
                <div style={{ marginLeft: 8, flexShrink: 0 }}>
                  <Avatar name={currentUser ? fullName({ name: currentUser.name }) : '?'} imageUrl={(currentUser as any)?.imageUrl} size={30} />
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--card)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Escribí un mensaje... (Enter para enviar)"
          rows={1}
          style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: 'var(--background)', color: 'var(--foreground)', outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
        />
        <button
          onClick={sendMessage}
          disabled={!body.trim() || sending}
          style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: body.trim() && !sending ? 'pointer' : 'not-allowed', opacity: body.trim() && !sending ? 1 : 0.5, transition: 'opacity 0.15s', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}
        >
          <i className="fa-solid fa-paper-plane" />
          {sending ? '...' : 'Enviar'}
        </button>
      </div>
    </div>
  ) : (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', flexDirection: 'column', gap: 10 }}>
      <i className="fa-regular fa-comments" style={{ fontSize: 44 }} />
      <span style={{ fontSize: 14 }}>Seleccioná una conversación</span>
    </div>
  );

  // ── New thread modal ──────────────────────────────────────────────────────
  const newThreadModal = showNew && (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowNew(false)}>
      <div style={{ background: 'var(--card)', borderRadius: 12, padding: 24, minWidth: 340, maxWidth: 460, width: '90%', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.22)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Nueva conversación</span>
          <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', fontSize: 18, lineHeight: 1 }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5 }}>
            Alumno <span style={{ color: 'var(--primary)' }}>*</span>
          </label>
          {loadingStudents ? (
            <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Cargando alumnos...</div>
          ) : (
            <select
              value={newStudentId}
              onChange={(e) => setNewStudentId(e.target.value)}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)', outline: 'none' }}
            >
              <option value="">— Seleccionar alumno —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {[s.firstName, s.lastName].filter(Boolean).join(' ')}{s.companyName ? ` (${s.companyName})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: 5 }}>
            Asunto <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>(opcional)</span>
          </label>
          <input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            placeholder="Ej: Consulta sobre progreso en natación"
            style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, background: 'var(--background)', color: 'var(--foreground)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <button
          onClick={createNewThread}
          disabled={!newStudentId}
          style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: newStudentId ? 'pointer' : 'not-allowed', opacity: newStudentId ? 1 : 0.5, fontSize: 14, fontWeight: 600 }}
        >
          <i className="fa-solid fa-comments" style={{ marginRight: 7 }} />
          Crear conversación
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--background)' }}>
      {newThreadModal}
      {threadListPanel}
      {messagesPanel}
    </div>
  );
};

export default MensajeriaModule;
