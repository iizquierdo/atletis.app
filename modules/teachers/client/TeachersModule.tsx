import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUser, ViewType } from '@sinapsis/shared-types';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Building2, CalendarDays, Eye, FileText, GraduationCap, Mail, MessageSquare, Pencil, Trash2, Upload, UserRound, Users } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import { cn } from '@webapp/lib/utils';
import ListCard from '@webapp/components/shared/ListCard';
import ProfileHeader from '@webapp/components/shared/ProfileHeader';
import ImportModal from '@webapp/components/shared/ImportModal';

type TeacherView = 'list' | 'details';
type DetailTab = 'Overview' | 'Classes' | 'Students' | 'Communities' | 'Messages' | 'Reports';

interface Props {
  view: TeacherView;
  setView: (view: ViewType, params?: Record<string, string>) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
  recordId?: string;
}

interface CompanyItem { id: string; name: string }
interface AvailableClass { id: string; name: string; status: string; companyName?: string | null }

interface TeacherRow {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email: string;
  phone?: string | null;
  document?: string | null;
  companyId: string;
  companyName?: string | null;
  imageUrl?: string | null;
  coverUrl?: string | null;
}

interface ClassRow {
  id: string;
  name: string;
  companyId: string;
  companyName?: string | null;
  status: string;
  disciplineName?: string | null;
}

interface StudentRow {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  studentCode?: string | null;
  imageUrl?: string | null;
  classId?: string | null;
  className?: string | null;
  companyName?: string | null;
  enrollmentStatus?: string | null;
}

interface CommunityRow {
  id: string;
  name: string;
  active?: boolean;
  imageUrl?: string | null;
  companyName?: string | null;
  disciplineName?: string | null;
  memberCount?: number;
  postCount?: number;
}

interface ReportRow {
  id: string;
  studentId: string;
  studentName?: string | null;
  studentAvatarUrl?: string | null;
  companyName?: string | null;
  type: string;
  title: string;
  content?: string | null;
  summary?: string | null;
  status: string;
  visibility: string;
  rating?: number | null;
  ratingTheme?: string | null;
  publishedAt?: string | null;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  subject?: string | null;
  status: string;
  studentFirstName?: string | null;
  studentLastName?: string | null;
  studentAvatarUrl?: string | null;
  lastMessageBody?: string | null;
  lastMessageAt?: string | null;
  lastSenderName?: string | null;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ── Rating ─────────────────────────────────────────────────────────────────

const RATING_THEMES = [
  { key: 'stars',     emoji: '⭐', label: 'Estrellas', empty: '☆',  filled: '⭐', fillUp: true  },
  { key: 'hearts',    emoji: '❤️', label: 'Corazones', empty: '🤍', filled: '❤️', fillUp: true  },
  { key: 'faces',     emoji: '😊', label: 'Caritas',   fillUp: false, icons: ['😢','😕','😐','🙂','😄'] },
  { key: 'trophies',  emoji: '🏆', label: 'Copas',     empty: '🥉', filled: '🏆', fillUp: true  },
  { key: 'fire',      emoji: '🔥', label: 'Fuego',     empty: '⚪', filled: '🔥', fillUp: true  },
  { key: 'lightning', emoji: '⚡', label: 'Rayos',     empty: '⚪', filled: '⚡', fillUp: true  },
  { key: 'muscles',   emoji: '💪', label: 'Fuerza',    empty: '⚪', filled: '💪', fillUp: true  },
  { key: 'medals',    emoji: '🥇', label: 'Medallas',  empty: '⚪', filled: '🥇', fillUp: true  },
] as const;

const RatingDisplay: React.FC<{ rating: number; theme: string }> = ({ rating, theme }) => {
  const t = RATING_THEMES.find((x) => x.key === theme) ?? RATING_THEMES[0];
  if (!t.fillUp) {
    const icon = (t as { icons: readonly string[] }).icons[rating - 1];
    return <span className="flex items-center gap-1 text-sm"><span>{icon}</span><span className="text-[10px] text-muted-foreground">{rating}/5</span></span>;
  }
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={cn('text-xs', i < rating ? 'opacity-100' : 'opacity-20 grayscale')}>
          {i < rating ? (t as { filled: string }).filled : (t as { empty: string }).empty}
        </span>
      ))}
      <span className="ml-1 text-[10px] text-muted-foreground">{rating}/5</span>
    </span>
  );
};

const RatingPicker: React.FC<{ rating: number; theme: string; onChange: (r: number, t: string) => void }> = ({ rating, theme, onChange }) => {
  const [hover, setHover] = React.useState(0);
  const t = RATING_THEMES.find((x) => x.key === theme) ?? RATING_THEMES[0];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {RATING_THEMES.map((th) => (
          <button key={th.key} type="button" onClick={() => onChange(rating, th.key)}
            className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all',
              theme === th.key ? 'bg-red-500 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-red-300')}>
            <span>{th.emoji}</span><span className="hidden sm:inline">{th.label}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {Array.from({ length: 5 }, (_, i) => {
          const pos = i + 1;
          const isFaces = !t.fillUp;
          const active = isFaces ? (hover ? hover === pos : rating === pos) : (hover || rating) >= pos;
          const icon = isFaces
            ? (t as { icons: readonly string[] }).icons[i]
            : (active ? (t as { filled: string }).filled : (t as { empty: string }).empty);
          return (
            <button key={i} type="button" onClick={() => onChange(rating === pos ? 0 : pos, theme)}
              onMouseEnter={() => setHover(pos)} onMouseLeave={() => setHover(0)}
              className={cn('text-3xl leading-none transition-all select-none hover:scale-125 focus:outline-none', active ? 'opacity-100' : 'opacity-25 grayscale')}>
              {icon}
            </button>
          );
        })}
        {rating > 0 && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{rating}/5</span>}
      </div>
    </div>
  );
};

// ───────────────────────────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';

const emptyForm = { firstName: '', lastName: '', email: '', document: '', phone: '', companyId: '', password: '' };
const emptyReportForm = { studentId: '', type: 'PROGRESS', title: '', content: '', summary: '', visibility: 'INTERNAL_STAFF', status: 'DRAFT', rating: 0, ratingTheme: 'stars' };
const emptyConvForm = { studentId: '', subject: '', firstMessage: '' };

interface MessageItem { id: string; senderId: string; senderName?: string; senderImageUrl?: string | null; body: string; createdAt: string }
interface StudentOption { id: string; firstName: string; lastName: string; companyName?: string | null }
interface AvailableCommunity { id: string; name: string; companyName?: string | null; disciplineName?: string | null }

const TYPE_LABELS: Record<string, string> = { PROGRESS: 'Progreso', OBSERVATION: 'Observación', LEVEL_CHANGE: 'Cambio nivel', RECOMMENDATION: 'Recomendación' };
const primaryBtn = 'flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600';

function fmtDateTime(v?: string | null) {
  if (!v) return '—';
  const d = new Date(Date.parse(v));
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const TeachersModule: React.FC<Props> = ({ view, setView, companyId, onSubTitleChange, recordId }) => {
  const { t } = useTranslation();

  // List state
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Detail state
  const [selected, setSelected] = useState<TeacherRow | null>(null);
  const [teacherClasses, setTeacherClasses] = useState<ClassRow[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);
  const [teacherReports, setTeacherReports] = useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>('Overview');

  // Image upload refs
  const logoFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  // Class assignment modal
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [availableClasses, setAvailableClasses] = useState<AvailableClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');

  // Teacher edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  // Communities ABM
  const [commModalOpen, setCommModalOpen] = useState(false);
  const [availableCommunities, setAvailableCommunities] = useState<AvailableCommunity[]>([]);
  const [selectedCommunityId, setSelectedCommunityId] = useState('');

  // Reports ABM
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [reportForm, setReportForm] = useState({ ...emptyReportForm });
  const [reportStudents, setReportStudents] = useState<StudentOption[]>([]);
  const [confirmDeleteReportId, setConfirmDeleteReportId] = useState<string | null>(null);
  const [reportSaving, setReportSaving] = useState(false);

  // Messages ABM
  const [convModalOpen, setConvModalOpen] = useState(false);
  const [convForm, setConvForm] = useState({ ...emptyConvForm });
  const [convStudents, setConvStudents] = useState<StudentOption[]>([]);
  const [openConv, setOpenConv] = useState<ConversationRow | null>(null);
  const [convMessages, setConvMessages] = useState<MessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');

  // ---- Data loaders ----------------------------------------------------------

  const loadTeachers = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/teachers');
      if (!res.ok) throw new Error();
      setTeachers(await res.json());
    } catch { setError(t('teachers.errorLoad')); } finally { setLoading(false); }
  };

  const loadCompanies = async () => {
    try {
      const res = await fetch('/api/companies?status=Active');
      if (res.ok) setCompanies(await res.json());
    } catch { /* ignore */ }
  };

  const loadTeacher = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/teachers/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(data);
      onSubTitleChange?.(`${data.firstName || ''} ${data.lastName || ''}`.trim());
    } catch {
      setError(t('teachers.errorLoad'));
    }
  };

  const loadTeacherClasses = async (id: string) => {
    setClassesLoading(true);
    try {
      const res = await fetch(`/api/teachers/${id}/classes`);
      setTeacherClasses(res.ok ? await res.json() : []);
    } catch {
      setTeacherClasses([]);
    } finally {
      setClassesLoading(false);
    }
  };

  const loadStudents = async (id: string) => {
    setStudentsLoading(true);
    try {
      const res = await fetch(`/api/teachers/${id}/students`);
      setStudents(res.ok ? await res.json() : []);
    } catch {
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  };

  const loadCommunities = async (id: string) => {
    setCommunitiesLoading(true);
    try {
      const res = await fetch(`/api/teachers/${id}/communities`);
      setCommunities(res.ok ? await res.json() : []);
    } catch { setCommunities([]); } finally { setCommunitiesLoading(false); }
  };

  const loadReports = async (id: string) => {
    setReportsLoading(true);
    try {
      const res = await fetch(`/api/teachers/${id}/reports`);
      setTeacherReports(res.ok ? await res.json() : []);
    } catch { setTeacherReports([]); } finally { setReportsLoading(false); }
  };

  const loadConversations = async (id: string) => {
    setConversationsLoading(true);
    try {
      const res = await fetch(`/api/teachers/${id}/conversations`);
      setConversations(res.ok ? await res.json() : []);
    } catch { setConversations([]); } finally { setConversationsLoading(false); }
  };

  const uploadTeacherImage = async (kind: 'logo' | 'cover', file: File | undefined) => {
    if (!selected || !file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(`/api/teachers/${selected.id}/image`, { method: 'POST', body: fd });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('teachers.errorSave')); }
      setSelected(await res.json());
    } catch (err: any) { setError(err.message || t('teachers.errorSave')); }
  };

  // ---- Effects ---------------------------------------------------------------

  useEffect(() => { void loadCompanies(); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadTeachers(); }, [companyId]);

  useEffect(() => {
    if (view === 'list') {
      setSelected(null);
      setActiveTab('Overview');
    } else if (view === 'details') {
      if (recordId) void loadTeacher(recordId);
      else setView('Teachers');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, recordId]);

  useEffect(() => {
    if (view !== 'details' || !selected?.id) return;
    if (activeTab === 'Classes') void loadTeacherClasses(selected.id);
    if (activeTab === 'Students') void loadStudents(selected.id);
    if (activeTab === 'Communities') void loadCommunities(selected.id);
    if (activeTab === 'Reports') void loadReports(selected.id);
    if (activeTab === 'Messages') void loadConversations(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeTab, selected?.id]);

  // ---- Communities ABM -------------------------------------------------------

  const openCommModal = async () => {
    if (!selected) return;
    setSelectedCommunityId('');
    setCommModalOpen(true);
    try {
      const res = await fetch(`/api/teachers/${selected.id}/available-communities`);
      setAvailableCommunities(res.ok ? await res.json() : []);
    } catch { setAvailableCommunities([]); }
  };

  const addCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !selectedCommunityId) return;
    try {
      const res = await fetch(`/api/teachers/${selected.id}/communities`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId: selectedCommunityId })
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('teachers.errorSave')); }
      setCommModalOpen(false);
      await loadCommunities(selected.id);
    } catch (err: any) { setError(err.message || t('teachers.errorSave')); }
  };

  const removeCommunity = async (communityId: string) => {
    if (!selected || !window.confirm('¿Quitar al profesor de esta comunidad?')) return;
    try {
      await fetch(`/api/teachers/${selected.id}/communities/${communityId}`, { method: 'DELETE' });
      await loadCommunities(selected.id);
    } catch { setError(t('teachers.errorSave')); }
  };

  // ---- Reports ABM -----------------------------------------------------------

  const openCreateReport = async () => {
    if (!selected) return;
    setEditingReportId(null);
    setReportForm({ ...emptyReportForm });
    if (!reportStudents.length) {
      try {
        const res = await fetch(`/api/teachers/${selected.id}/report-students`);
        if (res.ok) setReportStudents(await res.json());
      } catch { /* ignore */ }
    }
    setReportModalOpen(true);
  };

  const openEditReport = async (r: ReportRow) => {
    setEditingReportId(r.id);
    setReportForm({ studentId: r.studentId, type: r.type, title: r.title, content: r.content ?? '', summary: r.summary ?? '', visibility: r.visibility, status: r.status, rating: r.rating ?? 0, ratingTheme: r.ratingTheme ?? 'stars' });
    if (!reportStudents.length) {
      try {
        const res = await fetch(`/api/teachers/${selected!.id}/report-students`);
        if (res.ok) setReportStudents(await res.json());
      } catch { /* ignore */ }
    }
    setReportModalOpen(true);
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !reportForm.title.trim()) return;
    setReportSaving(true);
    try {
      const url = editingReportId ? `/api/teachers/${selected.id}/reports/${editingReportId}` : `/api/teachers/${selected.id}/reports`;
      const method = editingReportId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reportForm) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('teachers.errorSave')); }
      setReportModalOpen(false);
      setEditingReportId(null);
      await loadReports(selected.id);
    } catch (err: any) { setError(err.message || t('teachers.errorSave')); }
    finally { setReportSaving(false); }
  };

  const deleteReport = async (id: string) => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/teachers/${selected.id}/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setConfirmDeleteReportId(null);
      setTeacherReports((prev) => prev.filter((r) => r.id !== id));
    } catch { setError(t('teachers.errorSave')); }
  };

  // ---- Messages ABM ----------------------------------------------------------

  const openCreateConv = async () => {
    if (!selected) return;
    setConvForm({ ...emptyConvForm });
    if (!convStudents.length) {
      try {
        const res = await fetch(`/api/teachers/${selected.id}/report-students`);
        if (res.ok) setConvStudents(await res.json());
      } catch { /* ignore */ }
    }
    setConvModalOpen(true);
  };

  const submitConv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !convForm.studentId) return;
    try {
      const res = await fetch(`/api/teachers/${selected.id}/conversations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(convForm)
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('teachers.errorSave')); }
      setConvModalOpen(false);
      await loadConversations(selected.id);
    } catch (err: any) { setError(err.message || t('teachers.errorSave')); }
  };

  const openConversation = async (c: ConversationRow) => {
    if (!selected) return;
    setOpenConv(c);
    setConvMessages([]);
    setDraft('');
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/teachers/${selected.id}/conversations/${c.id}/messages`);
      setConvMessages(res.ok ? await res.json() : []);
    } catch { setConvMessages([]); }
    finally { setMessagesLoading(false); }
  };

  const sendMessage = async () => {
    if (!selected || !openConv || !draft.trim()) return;
    try {
      const res = await fetch(`/api/teachers/${selected.id}/conversations/${openConv.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() })
      });
      if (res.ok) { const msg = await res.json(); setConvMessages((prev) => [...prev, msg]); setDraft(''); }
    } catch { /* ignore */ }
  };

  // ---- Class assignment ------------------------------------------------------

  const openClassModal = async () => {
    if (!selected) return;
    setSelectedClassId('');
    setClassModalOpen(true);
    try {
      const res = await fetch(`/api/teachers/${selected.id}/available-classes`);
      setAvailableClasses(res.ok ? await res.json() : []);
    } catch { setAvailableClasses([]); }
  };

  const assignClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !selectedClassId) return;
    try {
      const res = await fetch(`/api/teachers/${selected.id}/classes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: selectedClassId })
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('teachers.errorSave')); }
      setClassModalOpen(false);
      await loadTeacherClasses(selected.id);
    } catch (err: any) { setError(err.message || t('teachers.errorSave')); }
  };

  const removeClass = async (classId: string) => {
    if (!selected) return;
    if (!window.confirm(t('teachers.removeClassConfirm'))) return;
    try {
      const res = await fetch(`/api/teachers/${selected.id}/classes/${classId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      await loadTeacherClasses(selected.id);
    } catch { setError(t('teachers.errorSave')); }
  };

  // ---- Teacher CRUD ----------------------------------------------------------

  const teacherImportColumns = [
    { key: 'firstName', header: 'Nombre', required: true, example: 'María' },
    { key: 'lastName', header: 'Apellido', required: true, example: 'García' },
    { key: 'email', header: 'Email', required: true, example: 'maria@email.com' },
    { key: 'phone', header: 'Teléfono', example: '1122334455' },
    { key: 'document', header: 'Documento', example: '87654321' },
    { key: 'password', header: 'Contraseña', required: true, example: 'Pass1234' },
    { key: 'companyName', header: 'Sede', required: true, example: 'Sede Central' },
  ];

  const handleTeacherImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    const errors: { row: number; message: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.firstName || !row.lastName) { errors.push({ row: rowNum, message: 'Nombre y Apellido son requeridos' }); continue; }
      if (!row.email) { errors.push({ row: rowNum, message: 'Email es requerido' }); continue; }
      if (!row.password) { errors.push({ row: rowNum, message: 'Contraseña es requerida' }); continue; }
      const company = row.companyName
        ? companies.find((c) => c.name.toLowerCase() === row.companyName.toLowerCase())
        : companies[0];
      if (!company) { errors.push({ row: rowNum, message: `Sede "${row.companyName}" no encontrada` }); continue; }
      try {
        const res = await fetch('/api/teachers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: row.firstName, lastName: row.lastName, email: row.email,
            phone: row.phone || '', document: row.document || '',
            password: row.password, companyId: company.id,
          }),
        });
        if (!res.ok) { const b = await res.json().catch(() => ({})); errors.push({ row: rowNum, message: b?.error || 'Error al crear' }); }
        else success++;
      } catch { errors.push({ row: rowNum, message: 'Error de conexión' }); }
    }
    if (success > 0) await loadTeachers();
    return { success, errors };
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, companyId: companyId || companies[0]?.id || '' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (p: TeacherRow) => {
    setEditingId(p.id);
    setForm({
      firstName: p.firstName || '', lastName: p.lastName || '', email: p.email || '',
      document: p.document || '', phone: p.phone || '', companyId: p.companyId || '', password: ''
    });
    setError('');
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    if (!form.email.trim()) return setError(t('teachers.errorEmailRequired'));
    if (!form.companyId) return setError(t('teachers.errorSedeRequired'));
    if (!editingId && !form.password) return setError(t('teachers.errorPasswordRequired'));
    try {
      const payload: Record<string, unknown> = { ...form };
      if (editingId && !form.password) delete payload.password;
      const res = await fetch(editingId ? `/api/teachers/${editingId}` : '/api/teachers', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('teachers.errorSave')); }
      setModalOpen(false);
      if (view === 'list') {
        await loadTeachers();
      } else if (editingId && selected?.id === editingId) {
        await loadTeacher(editingId);
      }
    } catch (err: any) { setError(err.message || t('teachers.errorSave')); }
  };

  const remove = async (p: TeacherRow) => {
    const label = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email;
    if (!window.confirm(t('teachers.deleteConfirm', { name: label }))) return;
    setError('');
    try {
      const res = await fetch(`/api/teachers/${p.id}`, { method: 'DELETE' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('teachers.errorSave')); }
      if (view === 'list') await loadTeachers();
      else setView('Teachers');
    } catch (err: any) { setError(err.message || t('teachers.errorSave')); }
  };

  // ---- Table (always constructed – hooks must be unconditional) --------------

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((p) =>
      `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.document || '').toLowerCase().includes(q) ||
      (p.companyName || '').toLowerCase().includes(q)
    );
  }, [teachers, search]);

  const columns = useMemo<ColumnDef<TeacherRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => `${row.firstName || ''} ${row.lastName || ''}`,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('teachers.name')} />,
        cell: ({ row }) => {
          const p = row.original;
          const initials = `${(p.firstName || ' ').charAt(0)}${(p.lastName || ' ').charAt(0)}`.toUpperCase();
          return (
            <div className="flex items-center gap-3">
              {p.imageUrl
                ? <img src={p.imageUrl} alt={initials} className="h-9 w-9 flex-shrink-0 rounded-xl object-cover" />
                : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-sm font-bold text-red-500">{initials}</div>
              }
              <div>
                <p className="text-sm font-semibold text-foreground">{`${p.firstName || ''} ${p.lastName || ''}`.trim() || '—'}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{p.email}</p>
              </div>
            </div>
          );
        }
      },
      {
        id: 'phone',
        accessorFn: (row) => row.phone || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('teachers.phone')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.phone || '—'}</span>
      },
      {
        id: 'document',
        accessorFn: (row) => row.document || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('teachers.document')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.document || '—'}</span>
      },
      {
        id: 'sede',
        accessorFn: (row) => row.companyName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('teachers.sede')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.companyName || '—'}</span>
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">
            {t('teachers.actions')}
          </span>
        ),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => setView('TeacherDetails', { id: p.id })} aria-label="Ver">
                <Eye className="size-3.5" />
              </Button>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEdit(p)} aria-label={t('teachers.edit')}>
                <Pencil className="size-3.5" />
              </Button>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => remove(p)} aria-label={t('teachers.delete')}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        }
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  // ---- Shared teacher edit modal ---------------------------------------------

  const teacherModal = modalOpen && (
    <Modal title={editingId ? t('teachers.editTeacher') : t('teachers.newTeacher')} onClose={() => setModalOpen(false)}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('teachers.firstName')}><input className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></Field>
          <Field label={t('teachers.lastName')}><input className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></Field>
          <Field label={t('teachers.email')}><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label={t('teachers.phone')}><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label={t('teachers.document')}><input className={inputClass} value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></Field>
          <Field label={t('teachers.sede')}>
            <select className={inputClass} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required>
              <option value="">—</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label={editingId ? t('teachers.passwordEdit') : t('teachers.password')}>
          <input
            type="password"
            className={inputClass}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={editingId ? t('teachers.passwordPlaceholder') : ''}
            {...(editingId ? {} : { required: true })}
          />
        </Field>
        <ModalActions onCancel={() => setModalOpen(false)} cancel={t('teachers.cancel')} save={t('teachers.save')} />
      </form>
    </Modal>
  );

  // ---- Details view ----------------------------------------------------------

  if (view === 'details') {
    const fullName = `${selected?.firstName || ''} ${selected?.lastName || ''}`.trim();
    const initials = `${(selected?.firstName || ' ').charAt(0)}${(selected?.lastName || ' ').charAt(0)}`.toUpperCase();

    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        {/* Hidden file inputs for image upload */}
        <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadTeacherImage('logo', e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={coverFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadTeacherImage('cover', e.target.files?.[0]); e.target.value = ''; }} />

        <ProfileHeader
          title={fullName || '—'}
          initials={initials}
          icon={<GraduationCap className="size-10" />}
          imageUrl={selected?.imageUrl}
          coverUrl={selected?.coverUrl}
          onLogoClick={() => logoFileRef.current?.click()}
          onCoverClick={() => coverFileRef.current?.click()}
          meta={[
            { icon: <Building2 className="size-4" />, text: selected?.companyName || '—' },
            { icon: <Mail className="size-4" />, text: selected?.email || '—' }
          ]}
          tabs={[
            { id: 'Overview', label: t('teachers.overview') },
            { id: 'Classes', label: t('teachers.classesTab') },
            { id: 'Students', label: t('teachers.studentsTab') },
            { id: 'Communities', label: 'Comunidades' },
            { id: 'Messages', label: 'Mensajes' },
            { id: 'Reports', label: 'Informes' }
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as DetailTab)}
          onBack={() => setView('Teachers')}
          actions={
            <Button type="button" variant="outline" onClick={() => selected && openEdit(selected)}>
              <Pencil className="size-3.5" /> {t('teachers.edit')}
            </Button>
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">

          {/* ---- Overview ---- */}
          {activeTab === 'Overview' && selected && (
            <div className="grid grid-cols-1 gap-5 px-1 sm:grid-cols-2">
              <InfoItem label={t('teachers.email')} value={selected.email} />
              <InfoItem label={t('teachers.phone')} value={selected.phone || '—'} />
              <InfoItem label={t('teachers.document')} value={selected.document || '—'} />
              <InfoItem label={t('teachers.sede')} value={selected.companyName || '—'} />
            </div>
          )}

          {/* ---- Classes ---- */}
          {activeTab === 'Classes' && (
            <div className="px-1">
              <div className="mb-4 flex justify-end">
                <button type="button" onClick={openClassModal}
                  className="rounded-xl bg-red-500 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600">
                  <i className="fa-solid fa-plus mr-1.5" /> {t('teachers.addToClass')}
                </button>
              </div>
              {classesLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">…</p>
              ) : teacherClasses.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{t('teachers.noClasses')}</p>
              ) : (
                <div className="space-y-2">
                  {teacherClasses.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-border dark:bg-card">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
                        <CalendarDays className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-foreground">{c.name}</p>
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                          <Building2 className="size-3" /> {c.companyName || '—'}
                          {c.disciplineName && <span>· {c.disciplineName}</span>}
                        </p>
                      </div>
                      <span className={cn('rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider', c.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground')}>
                        {c.status === 'ACTIVE' ? t('classes.active') : t('classes.inactive')}
                      </span>
                      <Button type="button" mode="icon" size="sm" variant="outline"
                        className="size-8 text-destructive hover:bg-destructive/10"
                        onClick={() => removeClass(c.id)} aria-label={t('teachers.removeFromClass')}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---- Students ---- */}
          {activeTab === 'Students' && (
            <div className="px-1">
              {studentsLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">…</p>
              ) : students.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{t('teachers.noStudents')}</p>
              ) : (
                <div className="space-y-2">
                  {students.map((s) => {
                    const initials2 = `${(s.firstName || ' ').charAt(0)}${(s.lastName || ' ').charAt(0)}`.toUpperCase();
                    return (
                      <div key={`${s.id}-${s.classId}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-border dark:bg-card">
                        {s.imageUrl
                          ? <img src={s.imageUrl} alt={initials2} className="h-9 w-9 flex-shrink-0 rounded-xl object-cover" />
                          : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-sm font-bold text-red-500">
                              {initials2 || <UserRound className="size-4" />}
                            </div>
                        }
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-foreground">
                            {`${s.firstName || ''} ${s.lastName || ''}`.trim() || '—'}
                          </p>
                          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                            <CalendarDays className="size-3" /> {s.className || '—'}
                            {s.companyName && <span>· {s.companyName}</span>}
                          </p>
                        </div>
                        {s.studentCode && (
                          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                            {s.studentCode}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ---- Communities ---- */}
          {activeTab === 'Communities' && (
          <div className="px-1">
            <div className="mb-4 flex justify-end">
              <button type="button" onClick={openCommModal} className={primaryBtn}>
                <i className="fa-solid fa-plus" /> Agregar comunidad
              </button>
            </div>
            {communitiesLoading ? (
              <p className="py-8 text-center text-sm text-slate-400">…</p>
            ) : communities.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Este profesor no pertenece a ninguna comunidad.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {communities.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-border dark:bg-card">
                    {c.imageUrl
                      ? <img src={c.imageUrl} alt={c.name} className="h-10 w-10 flex-shrink-0 rounded-xl object-cover" />
                      : <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500"><Users className="size-4" /></div>
                    }
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-foreground">{c.name}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Building2 className="size-3 shrink-0" />
                        <span className="truncate">{c.companyName || '—'}</span>
                        {c.disciplineName && <><span>·</span><span className="truncate">{c.disciplineName}</span></>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', c.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400')}>
                        {c.active ? 'Activa' : 'Inactiva'}
                      </span>
                      <Button type="button" mode="icon" size="sm" variant="outline"
                        className="size-8 text-destructive hover:bg-destructive/10"
                        onClick={() => removeCommunity(c.id)} aria-label="Quitar">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- Messages ---- */}
        {activeTab === 'Messages' && (
          <div className="px-1">
            {openConv ? (
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <button onClick={() => { setOpenConv(null); setConvMessages([]); }} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100">
                    <i className="fa-solid fa-arrow-left" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{openConv.subject || `${openConv.studentFirstName || ''} ${openConv.studentLastName || ''}`.trim()}</p>
                    <p className="text-[11px] text-slate-400">{`${openConv.studentFirstName || ''} ${openConv.studentLastName || ''}`.trim()}</p>
                  </div>
                </div>
                <div className="max-h-80 space-y-3 overflow-y-auto p-4">
                  {messagesLoading && <p className="text-center text-sm text-slate-400">…</p>}
                  {convMessages.map((m) => {
                    const isTeacher = m.senderId === selected?.id;
                    return (
                      <div key={m.id} className={`flex ${isTeacher ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${isTeacher ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                          {!isTeacher && <p className="mb-0.5 text-[10px] font-bold opacity-70">{m.senderName}</p>}
                          {m.body}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 border-t border-slate-100 p-3">
                  <input className={inputClass} placeholder="Escribir mensaje…" value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} />
                  <button onClick={() => void sendMessage()} className="rounded-xl bg-red-500 px-4 text-white">
                    <i className="fa-solid fa-paper-plane" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4 flex justify-end">
                  <button type="button" onClick={openCreateConv} className={primaryBtn}>
                    <i className="fa-solid fa-plus" /> Nueva conversación
                  </button>
                </div>
                {conversationsLoading ? (
                  <p className="py-8 text-center text-sm text-slate-400">…</p>
                ) : conversations.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Este profesor no tiene conversaciones.</p>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((c) => {
                      const studentName = `${c.studentFirstName || ''} ${c.studentLastName || ''}`.trim() || '—';
                      const ini = `${(c.studentFirstName || ' ').charAt(0)}${(c.studentLastName || ' ').charAt(0)}`.toUpperCase();
                      return (
                        <button key={c.id} type="button" onClick={() => openConversation(c)}
                          className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50 dark:border-border dark:bg-card">
                          {c.studentAvatarUrl
                            ? <img src={c.studentAvatarUrl} alt={studentName} className="h-9 w-9 flex-shrink-0 rounded-xl object-cover" />
                            : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-500">{ini}</div>
                          }
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-foreground">{c.subject || studentName}</p>
                            <p className="truncate text-[11px] text-slate-400">{studentName}{c.lastMessageBody ? ` · ${c.lastMessageBody}` : ''}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            <MessageSquare className="mr-0.5 inline size-3" />{c.messageCount ?? 0}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ---- Reports ---- */}
        {activeTab === 'Reports' && (
          <div className="px-1">
            <div className="mb-4 flex justify-end">
              <button type="button" onClick={openCreateReport} className={primaryBtn}>
                <i className="fa-solid fa-plus" /> Nuevo informe
              </button>
            </div>
            {reportsLoading ? (
              <p className="py-8 text-center text-sm text-slate-400">…</p>
            ) : teacherReports.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Este profesor no tiene informes creados.</p>
            ) : (
              <div className="space-y-3">
                {teacherReports.map((r) => {
                  const studentInitials = (r.studentName || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
                  const statusCfg = r.status === 'PUBLISHED'
                    ? { pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-400', label: 'Publicado' }
                    : r.status === 'DRAFT'
                    ? { pill: 'bg-amber-50 text-amber-600 border border-amber-200', dot: 'bg-amber-400', label: 'Borrador' }
                    : { pill: 'bg-slate-100 text-slate-500 border border-slate-200', dot: 'bg-slate-400', label: r.status };
                  const isConfirmingDelete = confirmDeleteReportId === r.id;
                  return (
                    <div key={r.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                        {r.studentAvatarUrl
                          ? <img src={r.studentAvatarUrl} alt={r.studentName || ''} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                          : <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-500">{studentInitials}</div>
                        }
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">{r.studentName || '—'}</p>
                          <p className="text-[11px] text-slate-400">{fmtDateTime(r.publishedAt ?? r.createdAt)}{r.companyName && ` · ${r.companyName}`}</p>
                        </div>
                        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusCfg.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="px-4 py-3">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900">{r.title}</p>
                          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{TYPE_LABELS[r.type] ?? r.type}</span>
                        </div>
                        {r.summary && <p className="mt-1 text-xs font-medium text-slate-600">{r.summary}</p>}
                        {r.content && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{r.content}</p>}
                        {r.rating ? <div className="mt-2"><RatingDisplay rating={r.rating} theme={r.ratingTheme || 'stars'} /></div> : null}
                        <div className="mt-3 flex justify-end gap-1.5">
                          <Button type="button" mode="icon" size="sm" variant="outline" className="size-7" onClick={() => openEditReport(r)}>
                            <Pencil className="size-3" />
                          </Button>
                          <Button type="button" mode="icon" size="sm" variant="outline" className="size-7 text-destructive hover:bg-destructive/10" onClick={() => setConfirmDeleteReportId(r.id)}>
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                        {isConfirmingDelete && (
                          <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
                            <p className="text-xs font-semibold text-red-700">¿Eliminar este informe?</p>
                            <div className="mt-2 flex gap-2">
                              <button className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-semibold text-white hover:bg-red-600" type="button" onClick={() => deleteReport(r.id)}>Eliminar</button>
                              <button className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50" type="button" onClick={() => setConfirmDeleteReportId(null)}>Cancelar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>

        {/* ---- Communities modal ---- */}
        {commModalOpen && (
          <Modal title="Agregar a comunidad" onClose={() => setCommModalOpen(false)}>
            <form onSubmit={addCommunity} className="space-y-4">
              <Field label="Comunidad">
                <select className={inputClass} value={selectedCommunityId} onChange={(e) => setSelectedCommunityId(e.target.value)} required>
                  <option value="">—</option>
                  {availableCommunities.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.companyName ? ` (${c.companyName})` : ''}</option>
                  ))}
                </select>
              </Field>
              {availableCommunities.length === 0 && <p className="text-sm text-slate-400">No hay comunidades disponibles.</p>}
              <ModalActions onCancel={() => setCommModalOpen(false)} cancel={t('teachers.cancel')} save={t('teachers.save')} />
            </form>
          </Modal>
        )}

        {/* ---- New conversation modal ---- */}
        {convModalOpen && (
          <Modal title="Nueva conversación" onClose={() => setConvModalOpen(false)}>
            <form onSubmit={submitConv} className="space-y-4">
              <Field label="Alumno">
                <select className={inputClass} value={convForm.studentId} onChange={(e) => setConvForm({ ...convForm, studentId: e.target.value })} required>
                  <option value="">—</option>
                  {convStudents.map((s) => (
                    <option key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.companyName ? ` — ${s.companyName}` : ''}</option>
                  ))}
                </select>
              </Field>
              <Field label="Asunto (opcional)">
                <input className={inputClass} value={convForm.subject} onChange={(e) => setConvForm({ ...convForm, subject: e.target.value })} placeholder="Asunto de la conversación" />
              </Field>
              <Field label="Primer mensaje">
                <textarea className={inputClass} rows={3} value={convForm.firstMessage} onChange={(e) => setConvForm({ ...convForm, firstMessage: e.target.value })} />
              </Field>
              <ModalActions onCancel={() => setConvModalOpen(false)} cancel={t('teachers.cancel')} save="Crear" />
            </form>
          </Modal>
        )}

        {/* ---- Report modal ---- */}
        {reportModalOpen && (
          <Modal title={editingReportId ? 'Editar informe' : 'Nuevo informe'} onClose={() => { setReportModalOpen(false); setEditingReportId(null); }}>
            <form onSubmit={submitReport} className="space-y-4">
              {!editingReportId && (
                <Field label="Alumno">
                  <select className={inputClass} value={reportForm.studentId} onChange={(e) => setReportForm({ ...reportForm, studentId: e.target.value })} required>
                    <option value="">—</option>
                    {reportStudents.map((s) => (
                      <option key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.companyName ? ` — ${s.companyName}` : ''}</option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Título">
                <input className={inputClass} value={reportForm.title} onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <select className={inputClass} value={reportForm.type} onChange={(e) => setReportForm({ ...reportForm, type: e.target.value })}>
                    <option value="PROGRESS">Progreso</option>
                    <option value="OBSERVATION">Observación</option>
                    <option value="LEVEL_CHANGE">Cambio de nivel</option>
                    <option value="RECOMMENDATION">Recomendación</option>
                  </select>
                </Field>
                <Field label="Visibilidad">
                  <select className={inputClass} value={reportForm.visibility} onChange={(e) => setReportForm({ ...reportForm, visibility: e.target.value })}>
                    <option value="INTERNAL_STAFF">Solo staff</option>
                    <option value="TUTORS_ONLY">Visible a padres</option>
                  </select>
                </Field>
              </div>
              <Field label="Resumen">
                <input className={inputClass} value={reportForm.summary} onChange={(e) => setReportForm({ ...reportForm, summary: e.target.value })} placeholder="Breve resumen (opcional)" />
              </Field>
              <Field label="Contenido">
                <textarea className={inputClass} rows={4} value={reportForm.content} onChange={(e) => setReportForm({ ...reportForm, content: e.target.value })} />
              </Field>
              <Field label="Estado">
                <select className={inputClass} value={reportForm.status} onChange={(e) => setReportForm({ ...reportForm, status: e.target.value })}>
                  <option value="DRAFT">Borrador</option>
                  <option value="PUBLISHED">Publicado</option>
                  <option value="ARCHIVED">Archivado</option>
                </select>
              </Field>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Valoración</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <RatingPicker rating={reportForm.rating} theme={reportForm.ratingTheme} onChange={(r, th) => setReportForm({ ...reportForm, rating: r, ratingTheme: th })} />
                </div>
              </div>
              <ModalActions onCancel={() => { setReportModalOpen(false); setEditingReportId(null); }} cancel={t('teachers.cancel')} save={t('teachers.save')} disabled={reportSaving || !reportForm.title.trim()} />
            </form>
          </Modal>
        )}

        {/* Assign to class modal */}
        {classModalOpen && (
          <Modal title={t('teachers.addToClass')} onClose={() => setClassModalOpen(false)}>
            <form onSubmit={assignClass} className="space-y-4">
              <Field label={t('teachers.selectClass')}>
                <select className={inputClass} value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} required>
                  <option value="">—</option>
                  {availableClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.companyName ? ` (${c.companyName})` : ''}</option>
                  ))}
                </select>
              </Field>
              {availableClasses.length === 0 && (
                <p className="text-sm text-slate-400">{t('teachers.noAvailableClasses')}</p>
              )}
              <ModalActions onCancel={() => setClassModalOpen(false)} cancel={t('teachers.cancel')} save={t('teachers.save')} />
            </form>
          </Modal>
        )}

        {teacherModal}
      </div>
    );
  }

  // ---- List view -------------------------------------------------------------

  return (
    <>
      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

      <ListCard<TeacherRow>
        title={t('teachers.title')}
        description={t('teachers.description')}
        cardTitle={t('teachers.title')}
        searchPlaceholder={t('teachers.searchPlaceholder')}
        searchTerm={search}
        onSearchChange={setSearch}
        primaryLabel={t('teachers.newTeacher')}
        onPrimary={openCreate}
        table={table}
        recordCount={filtered.length}
        isLoading={loading}
        emptyMessage={t('teachers.noTeachers')}
        onRowClick={(p) => setView('TeacherDetails', { id: p.id })}
        toolbarExtras={
          <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            Importar
          </Button>
        }
      />

      {teacherModal}
      {importOpen && (
        <ImportModal
          title="Importar Profesores"
          templateFilename="plantilla-profesores.xlsx"
          columns={teacherImportColumns}
          onImport={handleTeacherImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
};

const InfoItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-1 text-sm text-slate-700 dark:text-foreground">{value}</p>
  </div>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5"><label className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</label>{children}</div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <button type="button" onClick={onClose} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100"><i className="fa-solid fa-xmark" /></button>
      </div>
      {children}
    </div>
  </div>
);

const ModalActions: React.FC<{ onCancel: () => void; cancel: string; save: string; disabled?: boolean }> = ({ onCancel, cancel, save, disabled }) => (
  <div className="flex justify-end gap-2 pt-2">
    <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50">{cancel}</button>
    <button type="submit" disabled={disabled} className="rounded-xl bg-red-500 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600 disabled:opacity-50">{save}</button>
  </div>
);

export default TeachersModule;
