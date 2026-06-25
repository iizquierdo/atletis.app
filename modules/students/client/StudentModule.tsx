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
import { Building2, Eye, IdCard, Mail, Pencil, Power, PowerOff, Trash2, Upload } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import { cn } from '@webapp/lib/utils';
import ListCard from '@webapp/components/shared/ListCard';
import ProfileHeader from '@webapp/components/shared/ProfileHeader';
import ImportModal from '@webapp/components/shared/ImportModal';

// ---- Rating themes ----------------------------------------------------------

const RATING_THEMES = [
  { key: 'stars',     emoji: '⭐', label: 'Estrellas', empty: '☆',  filled: '⭐', fillUp: true  },
  { key: 'hearts',    emoji: '❤️', label: 'Corazones', empty: '🤍', filled: '❤️', fillUp: true  },
  { key: 'faces',     emoji: '😊', label: 'Caritas',   empty: '',   filled: '',   fillUp: false,
    icons: ['😢', '😕', '😐', '🙂', '😄'] },
  { key: 'trophies',  emoji: '🏆', label: 'Copas',     empty: '🥉', filled: '🏆', fillUp: true  },
  { key: 'fire',      emoji: '🔥', label: 'Fuego',     empty: '⚪', filled: '🔥', fillUp: true  },
  { key: 'lightning', emoji: '⚡', label: 'Rayos',     empty: '⚪', filled: '⚡', fillUp: true  },
  { key: 'muscles',   emoji: '💪', label: 'Fuerza',    empty: '⚪', filled: '💪', fillUp: true  },
  { key: 'medals',    emoji: '🥇', label: 'Medallas',  empty: '⚪', filled: '🥇', fillUp: true  },
] as const;

type RatingThemeKey = (typeof RATING_THEMES)[number]['key'];

interface RatingPickerProps {
  rating: number;
  theme: RatingThemeKey | string;
  onChange: (rating: number, theme: string) => void;
}

const RatingPicker: React.FC<RatingPickerProps> = ({ rating, theme, onChange }) => {
  const [hover, setHover] = useState(0);
  const t = RATING_THEMES.find((x) => x.key === theme) ?? RATING_THEMES[0];

  return (
    <div className="space-y-3">
      {/* Theme selector */}
      <div className="flex flex-wrap gap-1.5">
        {RATING_THEMES.map((th) => (
          <button
            key={th.key}
            type="button"
            onClick={() => onChange(rating, th.key)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
              theme === th.key
                ? 'bg-red-500 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:text-red-500'
            }`}
          >
            <span>{th.emoji}</span>
            <span className="hidden sm:inline">{th.label}</span>
          </button>
        ))}
      </div>

      {/* Rating icons row */}
      <div className="flex items-center gap-3">
        {Array.from({ length: 5 }, (_, i) => {
          const pos = i + 1;
          const isFaces = !t.fillUp;
          const active = isFaces
            ? (hover ? hover === pos : rating === pos)
            : (hover || rating) >= pos;
          const icon = isFaces
            ? (t as { icons: readonly string[] }).icons[i]
            : (active ? t.filled : t.empty);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(rating === pos ? 0 : pos, theme)}
              onMouseEnter={() => setHover(pos)}
              onMouseLeave={() => setHover(0)}
              title={`${pos}/5`}
              className={`text-3xl leading-none transition-all duration-100 select-none
                hover:scale-125 focus:outline-none
                ${active ? 'opacity-100 drop-shadow-sm' : 'opacity-25 grayscale'}`}
            >
              {icon}
            </button>
          );
        })}
        {rating > 0 && (
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            {rating}/5
          </span>
        )}
      </div>
    </div>
  );
};

/** Render a compact rating badge for use inside a report card */
const RatingDisplay: React.FC<{ rating: number; theme: string }> = ({ rating, theme }) => {
  if (!rating) return null;
  const t = RATING_THEMES.find((x) => x.key === theme) ?? RATING_THEMES[0];
  const isFaces = !t.fillUp;
  if (isFaces) {
    const icon = (t as { icons: readonly string[] }).icons[rating - 1];
    return (
      <span className="flex items-center gap-1 text-sm">
        <span className="text-xl leading-none">{icon}</span>
        <span className="text-xs text-slate-400">{rating}/5</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`text-sm leading-none ${i < rating ? 'opacity-100' : 'opacity-20 grayscale'}`}>
          {i < rating ? t.filled : t.empty}
        </span>
      ))}
      <span className="ml-1 text-xs text-slate-400">{rating}/5</span>
    </span>
  );
};

// ---- Module ------------------------------------------------------------------

type StudentView = 'list' | 'details';

interface Props {
  view: StudentView;
  setView: (view: ViewType, params?: Record<string, string>) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
  recordId?: string;
}

interface MetaItem { id: string; name: string }
interface StaffItem { id: string; name: string; email?: string; roleName?: string }
interface LevelItem { id: string; disciplineId: string; name: string }
interface DisciplineItem { id: string; name: string; levels: LevelItem[] }
interface CompanyItem { id: string; name: string }

interface StudentRow {
  id: string; code: string; firstName: string; lastName: string; document?: string | null;
  status: string; companyId: string; companyName?: string; imageUrl?: string | null;
  classNames?: string[];
}

interface Enrollment { id: string; disciplineId: string; levelId?: string | null; status: string }
interface Assignment { id: string; teacherId?: string; tutorId?: string; teacherName?: string; tutorName?: string; tutorEmail?: string; status?: string; active?: boolean }
interface ParentItem { id: string; name?: string | null; firstName?: string | null; lastName?: string | null; email: string }
interface ReportItem { id: string; authorId?: string; type: string; title: string; content?: string | null; summary?: string | null; visibility: string; status: string; authorName?: string; authorAvatarUrl?: string | null; createdAt: string; publishedAt?: string | null; rating?: number | null; ratingTheme?: string | null }
interface ConversationItem { id: string; subject?: string | null; status: string; createdByName?: string; messageCount?: number; updatedAt: string }
interface MessageItem { id: string; senderId: string; senderName?: string; body: string; createdAt: string }

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';
const labelize = (raw: string) => String(raw || '').toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const ENROLL_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];
const emptyParentForm = { firstName: '', lastName: '', email: '', phone: '', document: '', password: '', companyId: '' };

const emptyForm = {
  firstName: '', lastName: '', document: '', birthDate: '', gender: '', email: '', phone: '', address: '',
  medicalNotes: '', emergencyContactName: '', emergencyContactPhone: '', guardianName: '', guardianPhone: '', guardianEmail: '',
  notes: '', status: 'ACTIVE', companyId: '',
  disciplineAssignments: [] as { disciplineId: string; levelId: string }[],
  teacherIds: [] as string[], tutorIds: [] as string[]
};

const StudentModule: React.FC<Props> = ({ view, setView, currentUser, companyId, onSubTitleChange, recordId }) => {
  const { t } = useTranslation();
  const userId = currentUser?.id || '';

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [meta, setMeta] = useState<{ genders: MetaItem[]; statuses: MetaItem[]; reportTypes: MetaItem[]; reportVisibilities: MetaItem[]; staff: StaffItem[]; disciplines: DisciplineItem[] }>({ genders: [], statuses: [], reportTypes: [], reportVisibilities: [], staff: [], disciplines: [] });
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const [selected, setSelected] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Disciplines' | 'Staff' | 'Reports' | 'Conversations' | 'Communities'>('Overview');

  const [communities, setCommunities] = useState<{ id: string; name: string; imageUrl?: string | null; companyName?: string; disciplineName?: string | null; memberCount?: number; postCount?: number; active?: boolean }[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(false);

  const logoFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportForm, setReportForm] = useState({ type: 'PROGRESS', title: '', content: '', summary: '', visibility: 'INTERNAL_STAFF', status: 'DRAFT', rating: 0, ratingTheme: 'stars' });
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [reportConfirmDeleteId, setReportConfirmDeleteId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [convModalOpen, setConvModalOpen] = useState(false);
  const [convForm, setConvForm] = useState({ subject: '', firstMessage: '' });
  const [openConv, setOpenConv] = useState<{ id: string; subject?: string | null; messages: MessageItem[] } | null>(null);
  const [draft, setDraft] = useState('');

  // ABM disciplinas (en el tab)
  const [discModalOpen, setDiscModalOpen] = useState(false);
  const [discForm, setDiscForm] = useState({ disciplineId: '', levelId: '', status: 'ACTIVE', editing: false });

  // ABM padres (tutores vinculados al alumno)
  const [parentsList, setParentsList] = useState<ParentItem[]>([]);
  const [parentModalOpen, setParentModalOpen] = useState(false);
  const [parentPick, setParentPick] = useState('');
  const [parentCreateOpen, setParentCreateOpen] = useState(false);
  const [parentForm, setParentForm] = useState({ ...emptyParentForm });
  const [approvingTutorId, setApprovingTutorId] = useState<string | null>(null);

  const disciplineName = (id: string) => meta.disciplines.find((d) => d.id === id)?.name || id;
  const levelName = (did: string, lid?: string | null) => meta.disciplines.find((d) => d.id === did)?.levels.find((l) => l.id === lid)?.name || '';
  const genderLabel = (x: string) => t(`students.gender_${x}`, { defaultValue: labelize(x) });
  const enrollLabel = (x: string) => t(`students.enroll_${x}`, { defaultValue: labelize(x) });
  const parentLabel = (p: ParentItem) => `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.name || p.email;

  const loadCommunities = async (id: string) => {
    setCommunitiesLoading(true);
    try {
      const res = await fetch(`/api/communities?studentId=${id}`);
      setCommunities(res.ok ? await res.json() : []);
    } catch { setCommunities([]); } finally { setCommunitiesLoading(false); }
  };

  const uploadStudentImage = async (kind: 'logo' | 'cover', file: File | undefined) => {
    if (!selected || !file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(`/api/students/${selected.id}/image`, { method: 'POST', body: fd });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setSelected(await res.json());
    } catch (err: any) { setError(err.message || t('students.errorSave')); }
  };

  const loadStudents = async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (companyId) qs.set('companyId', companyId);
      const res = await fetch(`/api/students?${qs.toString()}`);
      if (!res.ok) throw new Error();
      setStudents(await res.json());
    } catch { setError(t('students.errorLoad')); } finally { setLoading(false); }
  };

  const loadMeta = async () => {
    try {
      const res = await fetch('/api/students/meta');
      if (res.ok) {
        const data = await res.json();
        setMeta({ ...data.categories, staff: data.staff || [], disciplines: data.disciplines || [] });
      }
    } catch { /* defaults */ }
    try {
      const res = await fetch('/api/companies?status=Active');
      if (res.ok) setCompanies(await res.json());
    } catch { /* ignore */ }
  };

  const loadDetails = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/students/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(data);
      onSubTitleChange?.(`${data.firstName} ${data.lastName}`);
      const [rep, conv, par] = await Promise.all([
        fetch(`/api/students/${id}/reports`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/students/${id}/conversations`).then((r) => (r.ok ? r.json() : [])),
        fetch('/api/parents').then((r) => (r.ok ? r.json() : []))
      ]);
      setReports(rep); setConversations(conv); setParentsList(par);
    } catch { setError(t('students.errorLoad')); }
  };

  useEffect(() => { void loadMeta(); }, []);
  useEffect(() => {
    if (view === 'list') { void loadStudents(); setSelected(null); setOpenConv(null); }
    else if (recordId) { void loadDetails(recordId); }
    else { setView('Students'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, companyId, recordId]);

  useEffect(() => {
    if (view !== 'details' || !selected?.id) return;
    if (activeTab === 'Communities') void loadCommunities(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeTab, selected?.id]);

  const openDetails = (s: StudentRow) => { setActiveTab('Overview'); setView('StudentDetails', { id: s.id }); };

  const studentImportColumns = [
    { key: 'firstName', header: 'Nombre', required: true, example: 'Juan' },
    { key: 'lastName', header: 'Apellido', required: true, example: 'Pérez' },
    { key: 'email', header: 'Email', example: 'juan@email.com' },
    { key: 'phone', header: 'Teléfono', example: '1122334455' },
    { key: 'document', header: 'Documento', example: '12345678' },
    { key: 'birthDate', header: 'FechaNacimiento', example: '2000-01-15' },
    { key: 'gender', header: 'Género', example: 'M' },
  ];

  const handleStudentImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    const errors: { row: number; message: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.firstName || !row.lastName) {
        errors.push({ row: rowNum, message: 'Nombre y Apellido son requeridos' });
        continue;
      }
      try {
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: row.firstName, lastName: row.lastName,
            email: row.email || '', phone: row.phone || '', document: row.document || '',
            birthDate: row.birthDate || '', gender: row.gender || '',
            status: 'ACTIVE',
          }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          errors.push({ row: rowNum, message: b?.details || b?.error || 'Error al crear' });
        } else {
          success++;
        }
      } catch { errors.push({ row: rowNum, message: 'Error de conexión' }); }
    }
    if (success > 0) await loadStudents();
    return { success, errors };
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, companyId: companyId || companies[0]?.id || '' });
    setStudentModalOpen(true);
  };

  const openEdit = (s: any) => {
    setEditingId(s.id);
    setForm({
      ...emptyForm,
      firstName: s.firstName || '', lastName: s.lastName || '', document: s.document || '',
      birthDate: s.birthDate ? String(s.birthDate).slice(0, 10) : '', gender: s.gender || '',
      email: s.email || '', phone: s.phone || '', address: s.address || '', medicalNotes: s.medicalNotes || '',
      emergencyContactName: s.emergencyContactName || '', emergencyContactPhone: s.emergencyContactPhone || '',
      guardianName: s.guardianName || '', guardianPhone: s.guardianPhone || '', guardianEmail: s.guardianEmail || '',
      notes: s.notes || '', status: s.status || 'ACTIVE', companyId: s.companyId || '',
      disciplineAssignments: (s.disciplines || []).map((d: Enrollment) => ({ disciplineId: d.disciplineId, levelId: d.levelId || '' })),
      teacherIds: (s.teachers || []).map((x: Assignment) => x.teacherId).filter(Boolean),
      tutorIds: (s.tutors || []).map((x: Assignment) => x.tutorId).filter(Boolean)
    });
    setStudentModalOpen(true);
  };

  const submitStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return setError(t('students.errorAuthRequired'));
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    if (!form.companyId) return setError(t('students.errorSedeRequired'));
    try {
      const payload = { ...form, disciplineAssignments: form.disciplineAssignments.filter((d) => d.disciplineId) };
      const isEdit = Boolean(editingId);
      const res = await fetch(isEdit ? `/api/students/${editingId}` : '/api/students', {
        method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setStudentModalOpen(false);
      if (view === 'list') await loadStudents(); else if (editingId) await loadDetails(editingId);
    } catch (e: any) { setError(e.message || t('students.errorSave')); }
  };

  const toggleStatus = async (s: StudentRow) => {
    await fetch(`/api/students/${s.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) });
    await loadStudents();
  };

  const rTimeAgo = (v?: string | null): string => {
    if (!v) return '';
    const diff = Date.now() - Date.parse(v);
    if (isNaN(diff)) return '';
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'ahora mismo';
    if (mins < 60) return `hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `hace ${days} d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `hace ${weeks} sem`;
    return `hace ${Math.floor(days / 30)} mes`;
  };

  const rFormatDate = (v?: string | null) => {
    if (!v) return { date: '—', time: '' };
    const ms = Date.parse(v);
    if (isNaN(ms)) return { date: '—', time: '' };
    const d = new Date(ms);
    return {
      date: d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const openEditReport = (r: ReportItem) => {
    setEditingReportId(r.id);
    setReportForm({ type: r.type, title: r.title, content: r.content || '', summary: r.summary || '', visibility: r.visibility, status: r.status, rating: r.rating ?? 0, ratingTheme: r.ratingTheme || 'stars' });
    setReportModalOpen(true);
  };

  const handleDeleteReport = async (id: string) => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/students/${selected.id}/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setReportConfirmDeleteId(null);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) { setError(e.message || t('students.errorSave')); }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!reportForm.title.trim()) return;
    try {
      const url = editingReportId
        ? `/api/students/${selected.id}/reports/${editingReportId}`
        : `/api/students/${selected.id}/reports`;
      const method = editingReportId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reportForm) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setReportModalOpen(false);
      setEditingReportId(null);
      setReportForm({ type: 'PROGRESS', title: '', content: '', summary: '', visibility: 'INTERNAL_STAFF', status: 'DRAFT', rating: 0, ratingTheme: 'stars' });
      await loadDetails(selected.id);
    } catch (e: any) { setError(e.message || t('students.errorSave')); }
  };

  const submitConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      const res = await fetch(`/api/students/${selected.id}/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: convForm.subject, firstMessage: convForm.firstMessage }) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setConvModalOpen(false); setConvForm({ subject: '', firstMessage: '' });
      await loadDetails(selected.id);
    } catch (e: any) { setError(e.message || t('students.errorSave')); }
  };

  const openConversation = async (c: ConversationItem) => {
    const res = await fetch(`/api/students/conversations/${c.id}`);
    if (res.ok) { const data = await res.json(); setOpenConv({ id: c.id, subject: c.subject, messages: data.messages || [] }); }
  };

  const sendMessage = async () => {
    if (!openConv || !draft.trim()) return;
    const res = await fetch(`/api/students/conversations/${openConv.id}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: draft.trim() }) });
    if (res.ok) { const msg = await res.json(); setOpenConv({ ...openConv, messages: [...openConv.messages, msg] }); setDraft(''); }
  };

  // ---- ABM disciplinas (tab) ------------------------------------------------
  const openAddDiscipline = () => { setError(''); setDiscForm({ disciplineId: '', levelId: '', status: 'ACTIVE', editing: false }); setDiscModalOpen(true); };
  const openEditDiscipline = (d: Enrollment) => { setError(''); setDiscForm({ disciplineId: d.disciplineId, levelId: d.levelId || '', status: d.status || 'ACTIVE', editing: true }); setDiscModalOpen(true); };

  const submitDiscipline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !discForm.disciplineId) return;
    try {
      const url = discForm.editing
        ? `/api/students/${selected.id}/disciplines/${discForm.disciplineId}`
        : `/api/students/${selected.id}/disciplines`;
      const res = await fetch(url, {
        method: discForm.editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disciplineId: discForm.disciplineId, levelId: discForm.levelId, status: discForm.status })
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setSelected(await res.json());
      setDiscModalOpen(false);
    } catch (err: any) { setError(err.message || t('students.errorSave')); }
  };

  const removeDiscipline = async (d: Enrollment) => {
    if (!selected) return;
    if (!window.confirm(t('students.removeDisciplineConfirm', { name: disciplineName(d.disciplineId) }))) return;
    try {
      const res = await fetch(`/api/students/${selected.id}/disciplines/${d.disciplineId}`, { method: 'DELETE' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setSelected(await res.json());
    } catch (err: any) { setError(err.message || t('students.errorSave')); }
  };

  // ---- ABM padres (tab) -----------------------------------------------------
  const openAddParent = () => { setError(''); setParentPick(''); setParentCreateOpen(false); setParentForm({ ...emptyParentForm, companyId: selected?.companyId || companyId || '' }); setParentModalOpen(true); };

  const submitParent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      let tutorId = parentPick;
      if (parentCreateOpen) {
        if (!parentForm.firstName.trim() || !parentForm.lastName.trim() || !parentForm.email.trim() || !parentForm.password) return setError(t('students.parentFormIncomplete'));
        const cRes = await fetch('/api/parents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...parentForm, companyId: parentForm.companyId || selected.companyId }) });
        if (!cRes.ok) { const b = await cRes.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
        tutorId = (await cRes.json()).id;
      }
      if (!tutorId) return;
      const res = await fetch(`/api/students/${selected.id}/tutors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tutorId }) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setSelected(await res.json());
      setParentModalOpen(false);
      void fetch('/api/parents').then((r) => (r.ok ? r.json() : [])).then(setParentsList);
    } catch (err: any) { setError(err.message || t('students.errorSave')); }
  };

  const removeParent = async (x: Assignment) => {
    if (!selected || !x.tutorId) return;
    if (!window.confirm(t('students.removeParentConfirm', { name: x.tutorName || '' }))) return;
    try {
      const res = await fetch(`/api/students/${selected.id}/tutors/${x.tutorId}`, { method: 'DELETE' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setSelected(await res.json());
    } catch (err: any) { setError(err.message || t('students.errorSave')); }
  };

  const approveTutor = async (x: Assignment) => {
    if (!selected || !x.tutorId) return;
    setApprovingTutorId(x.tutorId);
    try {
      const res = await fetch(`/api/students/${selected.id}/tutors/${x.tutorId}/approve`, { method: 'POST' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setSelected(await res.json());
    } catch (err: any) { setError(err.message || t('students.errorSave')); } finally { setApprovingTutorId(null); }
  };

  const genderOptions = useMemo(() => (meta.genders.length ? meta.genders.map((x) => x.name) : ['MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'UNSPECIFIED']), [meta.genders]);
  const reportTypeOptions = useMemo(() => (meta.reportTypes.length ? meta.reportTypes.map((x) => x.name) : ['PROGRESS', 'OBSERVATION', 'LEVEL_CHANGE', 'RECOMMENDATION']), [meta.reportTypes]);
  const visibilityOptions = useMemo(() => (meta.reportVisibilities.length ? meta.reportVisibilities.map((x) => x.name) : ['INTERNAL_STAFF', 'TUTORS_ONLY']), [meta.reportVisibilities]);

  // ---- List table (standard Sinapsis ListCard) ------------------------------
  const [sorting, setSorting] = useState<SortingState>([]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
        (s.code || '').toLowerCase().includes(q) ||
        (s.document || '').toLowerCase().includes(q) ||
        (s.companyName || '').toLowerCase().includes(q)
    );
  }, [students, search]);

  const columns = useMemo<ColumnDef<StudentRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => `${row.firstName} ${row.lastName}`,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('students.firstName')} />,
        cell: ({ row }) => {
          const s = row.original;
          const initials = `${s.firstName.charAt(0)}${s.lastName.charAt(0)}`.toUpperCase();
          return (
            <div className="flex items-center gap-3">
              {s.imageUrl
                ? <img src={s.imageUrl} alt={initials} className="h-9 w-9 flex-shrink-0 rounded-xl object-cover" />
                : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-sm font-bold text-red-500">{initials}</div>
              }
              <div>
                <p className="text-sm font-semibold text-foreground">{s.firstName} {s.lastName}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{s.companyName || '—'}</p>
              </div>
            </div>
          );
        }
      },
      {
        id: 'sede',
        accessorFn: (row) => row.companyName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('students.sede')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.companyName || '—'}</span>
      },
      {
        id: 'classes',
        accessorFn: (row) => (row.classNames || []).join(', '),
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('students.classes')} />,
        cell: ({ row }) => {
          const names = row.original.classNames || [];
          if (!names.length) return <span className="text-sm text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {names.map((name) => (
                <span key={name} className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                  {name}
                </span>
              ))}
            </div>
          );
        }
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('students.status')} />,
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
              row.original.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground'
            )}
          >
            {row.original.status === 'ACTIVE' ? t('students.active') : t('students.inactive')}
          </span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">
            {t('students.actions')}
          </span>
        ),
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openDetails(s)} aria-label={t('students.view')}>
                <Eye className="size-3.5" />
              </Button>
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className={cn('size-8', s.status === 'ACTIVE' && 'text-destructive hover:bg-destructive/10')}
                onClick={() => toggleStatus(s)}
                aria-label={t('students.status')}
              >
                {s.status === 'ACTIVE' ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
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

  const primaryBtn = 'px-5 py-2.5 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2';

  const toggleInArray = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  // ---------------------------------------------------------------- details --
  if (view === 'details') {
    const linkedTutorIds = new Set((selected?.tutors || []).map((x: Assignment) => x.tutorId));
    const availableParents = parentsList.filter((p) => !linkedTutorIds.has(p.id));
    const discLevels = meta.disciplines.find((d) => d.id === discForm.disciplineId)?.levels || [];
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        {/* Hidden file inputs for image upload */}
        <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadStudentImage('logo', e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={coverFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadStudentImage('cover', e.target.files?.[0]); e.target.value = ''; }} />

        <ProfileHeader
          title={selected ? `${selected.firstName} ${selected.lastName}` : '—'}
          initials={selected ? `${selected.firstName?.charAt(0) || ''}${selected.lastName?.charAt(0) || ''}`.toUpperCase() : '?'}
          imageUrl={selected?.imageUrl}
          coverUrl={selected?.coverUrl}
          onLogoClick={() => logoFileRef.current?.click()}
          onCoverClick={() => coverFileRef.current?.click()}
          meta={[
            { icon: <IdCard className="size-4" />, text: selected?.code || '—' },
            { icon: <Building2 className="size-4" />, text: selected?.companyName || '—' },
            ...(selected?.email ? [{ icon: <Mail className="size-4" />, text: selected.email }] : []),
            { text: selected?.status === 'ACTIVE' ? t('students.active') : t('students.inactive') }
          ]}
          tabs={[
            { id: 'Overview', label: t('students.overview') },
            { id: 'Disciplines', label: t('students.disciplines') },
            { id: 'Staff', label: t('students.parents') },
            { id: 'Reports', label: t('students.reports') },
            { id: 'Conversations', label: t('students.conversations') },
            { id: 'Communities', label: 'Comunidades' }
          ]}
          activeTab={activeTab}
          onTabChange={(id) => { setActiveTab(id as typeof activeTab); setOpenConv(null); }}
          onBack={() => setView('Students')}
          actions={
            <Button type="button" variant="outline" onClick={() => selected && openEdit(selected)}>
              <Pencil className="size-3.5" /> {t('students.edit')}
            </Button>
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
        {activeTab === 'Overview' && selected && (
          <div className="grid gap-4 px-1 sm:grid-cols-2 lg:grid-cols-3">
            <Info label={t('students.document')} value={selected.document} />
            <Info label={t('students.gender')} value={selected.gender ? genderLabel(selected.gender) : null} />
            <Info label={t('students.birthDate')} value={selected.birthDate ? String(selected.birthDate).slice(0, 10) : null} />
            <Info label={t('students.email')} value={selected.email} />
            <Info label={t('students.phone')} value={selected.phone} />
            <Info label={t('students.status')} value={selected.status === 'ACTIVE' ? t('students.active') : t('students.inactive')} />
            <Info label={t('students.address')} value={selected.address} />
            <Info label={t('students.guardian')} value={selected.guardianName ? `${selected.guardianName} · ${selected.guardianPhone || ''}` : null} />
            <Info label={t('students.emergency')} value={selected.emergencyContactName ? `${selected.emergencyContactName} · ${selected.emergencyContactPhone || ''}` : null} />
            <div className="sm:col-span-2 lg:col-span-3"><Info label={t('students.medical')} value={selected.medicalNotes} /></div>
          </div>
        )}

        {activeTab === 'Disciplines' && selected && (
          <div className="px-1">
            <div className="mb-4 flex justify-end"><button onClick={openAddDiscipline} className={primaryBtn}><i className="fa-solid fa-plus" /> {t('students.addDiscipline')}</button></div>
            {(selected.disciplines || []).length === 0 ? <Empty text={t('students.none')} /> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(selected.disciplines as Enrollment[]).map((d) => (
                  <div key={d.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{disciplineName(d.disciplineId)}</p>
                      <p className="text-xs text-slate-500">{levelName(d.disciplineId, d.levelId) || '—'} · {enrollLabel(d.status)}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEditDiscipline(d)} aria-label={t('students.editDiscipline')}><Pencil className="size-3.5" /></Button>
                      <Button type="button" mode="icon" size="sm" variant="outline" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => removeDiscipline(d)} aria-label={t('students.cancel')}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Staff' && selected && (() => {
          const allTutors: Assignment[] = selected.tutors || [];
          const pendingTutors = allTutors.filter((x) => x.status === 'PENDING' || x.active === false);
          const activeTutors = allTutors.filter((x) => x.status !== 'PENDING' && x.active !== false);
          return (
            <div className="px-1 space-y-5">
              {/* Pending access requests */}
              {pendingTutors.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-amber-600">Solicitudes pendientes</h3>
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">{pendingTutors.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {pendingTutors.map((x) => (
                      <div key={x.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-700">
                            <i className="fa-solid fa-user-clock text-sm" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{x.tutorName || '—'}</p>
                            {x.tutorEmail && <p className="text-xs text-slate-500 truncate">{x.tutorEmail}</p>}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            disabled={approvingTutorId === x.tutorId}
                            onClick={() => approveTutor(x)}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:bg-emerald-600 disabled:opacity-60"
                          >
                            {approvingTutorId === x.tutorId
                              ? <><i className="fa-solid fa-spinner fa-spin" /> Aprobando...</>
                              : <><i className="fa-solid fa-check" /> Aprobar</>}
                          </button>
                          <Button type="button" mode="icon" size="sm" variant="outline" className="size-8 shrink-0 text-destructive hover:bg-destructive/10" onClick={() => removeParent(x)} aria-label="Rechazar">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active parents */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('students.parents')}</h3>
                  <button onClick={openAddParent} className={primaryBtn}><i className="fa-solid fa-plus" /> {t('students.addParent')}</button>
                </div>
                {activeTutors.length === 0 ? <Empty text={t('students.none')} /> : activeTutors.map((x) => (
                  <div key={x.id} className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{x.tutorName}</p>
                      {x.tutorEmail && <p className="text-xs text-slate-400">{x.tutorEmail}</p>}
                    </div>
                    <Button type="button" mode="icon" size="sm" variant="outline" className="size-8 shrink-0 text-destructive hover:bg-destructive/10" onClick={() => removeParent(x)} aria-label={t('students.cancel')}><Trash2 className="size-3.5" /></Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {activeTab === 'Reports' && (
          <div className="px-1">
            <div className="mb-4 flex justify-end">
              <button
                onClick={() => { setEditingReportId(null); setReportForm({ type: 'PROGRESS', title: '', content: '', summary: '', visibility: 'INTERNAL_STAFF', status: 'DRAFT' }); setReportModalOpen(true); }}
                className={primaryBtn}
              >
                <i className="fa-solid fa-plus" /> {t('students.newReport')}
              </button>
            </div>
            {reports.length === 0 ? <Empty text={t('students.noReports')} /> : (
              <div className="space-y-3">
                {reports.map((r) => {
                  const ref = r.publishedAt ?? r.createdAt;
                  const { date, time } = rFormatDate(ref);
                  const ago = rTimeAgo(ref);
                  const initials = (r.authorName || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
                  const isConfirmingDelete = reportConfirmDeleteId === r.id;
                  const statusCfg = r.status === 'PUBLISHED'
                    ? { pill: 'bg-emerald-50 text-emerald-700 border border-emerald-200', dot: 'bg-emerald-400', label: 'Publicado' }
                    : r.status === 'DRAFT'
                    ? { pill: 'bg-amber-50 text-amber-600 border border-amber-200', dot: 'bg-amber-400', label: 'Borrador' }
                    : { pill: 'bg-slate-100 text-slate-500 border border-slate-200', dot: 'bg-slate-400', label: labelize(r.status) };
                  return (
                    <div key={r.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                      {/* Header row: avatar + meta + status */}
                      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                        {r.authorAvatarUrl ? (
                          <img src={r.authorAvatarUrl} alt={r.authorName} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-400 to-rose-500 text-xs font-bold text-white">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">{r.authorName || '—'}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[11px] text-slate-400">
                            <span>{date}</span>
                            {time && <><span className="inline-block h-0.5 w-0.5 rounded-full bg-slate-300" /><span>{time}</span></>}
                            {ago && <><span className="inline-block h-0.5 w-0.5 rounded-full bg-slate-300" /><span>{ago}</span></>}
                          </div>
                        </div>
                        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusCfg.pill}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </div>
                      {/* Body */}
                      <div className="px-4 py-3">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900">{r.title}</p>
                          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{labelize(r.type)}</span>
                        </div>
                        {r.summary && <p className="mt-1 text-xs font-medium text-slate-600">{r.summary}</p>}
                        {r.content && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{r.content}</p>}
                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400">{labelize(r.visibility)}</span>
                            {r.rating ? <RatingDisplay rating={r.rating} theme={r.ratingTheme || 'stars'} /> : null}
                          </div>
                          <div className="flex gap-1.5">
                            <Button
                              type="button" mode="icon" size="sm" variant="outline"
                              className="size-7 text-slate-500 hover:border-blue-300 hover:text-blue-600"
                              onClick={() => openEditReport(r)}
                              aria-label={t('students.editReport')}
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              type="button" mode="icon" size="sm" variant="outline"
                              className="size-7 text-destructive hover:bg-destructive/10"
                              onClick={() => setReportConfirmDeleteId(r.id)}
                              aria-label={t('students.deleteReport')}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                        {isConfirmingDelete && (
                          <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5">
                            <p className="text-xs font-semibold text-red-700">{t('students.deleteReportConfirm')}</p>
                            <div className="mt-2 flex gap-2">
                              <button
                                className="flex-1 rounded-lg bg-red-500 py-1.5 text-xs font-semibold text-white hover:bg-red-600"
                                onClick={() => handleDeleteReport(r.id)}
                                type="button"
                              >
                                {t('students.deleteReport')}
                              </button>
                              <button
                                className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                onClick={() => setReportConfirmDeleteId(null)}
                                type="button"
                              >
                                {t('students.cancel')}
                              </button>
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

        {activeTab === 'Conversations' && (
          <div className="px-1">
            {openConv ? (
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <button onClick={() => setOpenConv(null)} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100"><i className="fa-solid fa-arrow-left" /></button>
                  <p className="text-sm font-semibold text-slate-900">{openConv.subject || t('students.conversations')}</p>
                </div>
                <div className="max-h-80 space-y-3 overflow-y-auto p-4">
                  {openConv.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.senderId === userId ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.senderId === userId ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-800'}`}>
                        {m.senderId !== userId && <p className="mb-0.5 text-[10px] font-bold opacity-70">{m.senderName}</p>}
                        {m.body}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 border-t border-slate-100 p-3">
                  <input className={inputClass} placeholder={t('students.writeMessage')} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
                  <button onClick={sendMessage} className="rounded-xl bg-red-500 px-4 text-white"><i className="fa-solid fa-paper-plane" /></button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4 flex justify-end"><button onClick={() => setConvModalOpen(true)} className={primaryBtn}><i className="fa-solid fa-plus" /> {t('students.newConversation')}</button></div>
                {conversations.length === 0 ? <Empty text={t('students.noConversations')} /> : (
                  <div className="space-y-2">
                    {conversations.map((c) => (
                      <button key={c.id} onClick={() => openConversation(c)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{c.subject || t('students.conversations')}</p>
                          <p className="text-xs text-slate-400">{c.createdByName}</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">{c.messageCount ?? 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'Communities' && (
          <div className="px-1">
            {communitiesLoading ? (
              <p className="py-8 text-center text-sm text-slate-400">…</p>
            ) : communities.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">Este alumno no pertenece a ninguna comunidad.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {communities.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-border dark:bg-card">
                    {c.imageUrl
                      ? <img src={c.imageUrl} alt={c.name} className="h-10 w-10 flex-shrink-0 rounded-xl object-cover" />
                      : (
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
                          <i className="fa-solid fa-users text-sm" />
                        </div>
                      )
                    }
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-foreground">{c.name}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Building2 className="size-3 shrink-0" />
                        <span className="truncate">{c.companyName || '—'}</span>
                        {c.disciplineName && <><span>·</span><span className="truncate">{c.disciplineName}</span></>}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-slate-400">
                        <i className="fa-solid fa-users mr-1" />{c.memberCount ?? 0}
                      </span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', c.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400')}>
                        {c.active ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </div>

        {studentModalOpen && StudentForm()}
        {reportModalOpen && (
          <Modal title={editingReportId ? t('students.editReport') : t('students.newReport')} onClose={() => { setReportModalOpen(false); setEditingReportId(null); }}>
            <form onSubmit={submitReport} className="space-y-4">
              <Field label={t('students.reportTitle')}><input className={inputClass} value={reportForm.title} onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })} required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('students.reportType')}><select className={inputClass} value={reportForm.type} onChange={(e) => setReportForm({ ...reportForm, type: e.target.value })}>{reportTypeOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}</select></Field>
                <Field label={t('students.visibility')}><select className={inputClass} value={reportForm.visibility} onChange={(e) => setReportForm({ ...reportForm, visibility: e.target.value })}>{visibilityOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}</select></Field>
              </div>
              <Field label={t('students.summary')}><input className={inputClass} value={reportForm.summary} onChange={(e) => setReportForm({ ...reportForm, summary: e.target.value })} /></Field>
              <Field label={t('students.content')}><textarea className={inputClass} rows={4} value={reportForm.content} onChange={(e) => setReportForm({ ...reportForm, content: e.target.value })} /></Field>
              <Field label={t('students.status')}><select className={inputClass} value={reportForm.status} onChange={(e) => setReportForm({ ...reportForm, status: e.target.value })}><option value="DRAFT">Borrador</option><option value="PUBLISHED">Publicado</option></select></Field>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('students.rating')}
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <RatingPicker
                    rating={reportForm.rating}
                    theme={reportForm.ratingTheme}
                    onChange={(r, th) => setReportForm({ ...reportForm, rating: r, ratingTheme: th })}
                  />
                </div>
              </div>
              <ModalActions onCancel={() => { setReportModalOpen(false); setEditingReportId(null); }} cancel={t('students.cancel')} save={t('students.save')} />
            </form>
          </Modal>
        )}
        {convModalOpen && (
          <Modal title={t('students.newConversation')} onClose={() => setConvModalOpen(false)}>
            <form onSubmit={submitConversation} className="space-y-4">
              <Field label={t('students.subject')}><input className={inputClass} value={convForm.subject} onChange={(e) => setConvForm({ ...convForm, subject: e.target.value })} /></Field>
              <Field label={t('students.firstMessage')}><textarea className={inputClass} rows={3} value={convForm.firstMessage} onChange={(e) => setConvForm({ ...convForm, firstMessage: e.target.value })} /></Field>
              <ModalActions onCancel={() => setConvModalOpen(false)} cancel={t('students.cancel')} save={t('students.save')} />
            </form>
          </Modal>
        )}
        {discModalOpen && (
          <Modal title={discForm.editing ? t('students.editDiscipline') : t('students.addDiscipline')} onClose={() => setDiscModalOpen(false)}>
            <form onSubmit={submitDiscipline} className="space-y-4">
              <Field label={t('students.discipline')}>
                <select className={inputClass} value={discForm.disciplineId} disabled={discForm.editing} onChange={(e) => setDiscForm({ ...discForm, disciplineId: e.target.value, levelId: '' })} required>
                  <option value="">—</option>
                  {meta.disciplines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label={t('students.level')}>
                <select className={inputClass} value={discForm.levelId} onChange={(e) => setDiscForm({ ...discForm, levelId: e.target.value })}>
                  <option value="">—</option>
                  {discLevels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label={t('students.status')}>
                <select className={inputClass} value={discForm.status} onChange={(e) => setDiscForm({ ...discForm, status: e.target.value })}>
                  {ENROLL_STATUSES.map((s) => <option key={s} value={s}>{enrollLabel(s)}</option>)}
                </select>
              </Field>
              <ModalActions onCancel={() => setDiscModalOpen(false)} cancel={t('students.cancel')} save={t('students.save')} />
            </form>
          </Modal>
        )}
        {parentModalOpen && (
          <Modal title={t('students.addParent')} onClose={() => setParentModalOpen(false)}>
            <form onSubmit={submitParent} className="space-y-4">
              {!parentCreateOpen && (
                <Field label={t('students.selectParent')}>
                  <select className={inputClass} value={parentPick} onChange={(e) => setParentPick(e.target.value)}>
                    <option value="">—</option>
                    {availableParents.map((p) => <option key={p.id} value={p.id}>{parentLabel(p)}{p.email ? ` · ${p.email}` : ''}</option>)}
                  </select>
                </Field>
              )}
              <button type="button" onClick={() => setParentCreateOpen(!parentCreateOpen)} className="text-xs font-bold text-red-500">
                {parentCreateOpen ? t('students.pickExistingParent') : t('students.createNewParent')}
              </button>
              {parentCreateOpen && (
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3">
                  <Field label={t('students.firstName')}><input className={inputClass} value={parentForm.firstName} onChange={(e) => setParentForm({ ...parentForm, firstName: e.target.value })} /></Field>
                  <Field label={t('students.lastName')}><input className={inputClass} value={parentForm.lastName} onChange={(e) => setParentForm({ ...parentForm, lastName: e.target.value })} /></Field>
                  <Field label={t('students.email')}><input type="email" className={inputClass} value={parentForm.email} onChange={(e) => setParentForm({ ...parentForm, email: e.target.value })} /></Field>
                  <Field label={t('students.phone')}><input className={inputClass} value={parentForm.phone} onChange={(e) => setParentForm({ ...parentForm, phone: e.target.value })} /></Field>
                  <Field label={t('students.document')}><input className={inputClass} value={parentForm.document} onChange={(e) => setParentForm({ ...parentForm, document: e.target.value })} /></Field>
                  <Field label={t('students.password')}><input type="password" className={inputClass} value={parentForm.password} onChange={(e) => setParentForm({ ...parentForm, password: e.target.value })} /></Field>
                  <div className="col-span-2"><Field label={t('students.sede')}>
                    <select className={inputClass} value={parentForm.companyId} onChange={(e) => setParentForm({ ...parentForm, companyId: e.target.value })}>
                      <option value="">—</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field></div>
                </div>
              )}
              <ModalActions onCancel={() => setParentModalOpen(false)} cancel={t('students.cancel')} save={t('students.save')} />
            </form>
          </Modal>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------- list --
  function StudentForm() {
    return (
      <Modal title={editingId ? t('students.editStudent') : t('students.newStudent')} onClose={() => setStudentModalOpen(false)} wide>
        <form onSubmit={submitStudent} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('students.firstName')}><input className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></Field>
            <Field label={t('students.lastName')}><input className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></Field>
            <Field label={t('students.document')}><input className={inputClass} value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></Field>
            <Field label={t('students.birthDate')}><input type="date" className={inputClass} value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} /></Field>
            <Field label={t('students.gender')}><select className={inputClass} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">—</option>{genderOptions.map((x) => <option key={x} value={x}>{genderLabel(x)}</option>)}</select></Field>
            <Field label={t('students.sede')}><select className={inputClass} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label={t('students.email')}><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t('students.phone')}><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label={t('students.address')}><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t('students.emergency')} — ${t('students.contactName')}`}><input className={inputClass} value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} /></Field>
            <Field label={`${t('students.emergency')} — ${t('students.contactPhone')}`}><input className={inputClass} value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} /></Field>
          </div>
          <Field label={t('students.medical')}><textarea className={inputClass} rows={2} value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })} /></Field>

          <ModalActions onCancel={() => setStudentModalOpen(false)} cancel={t('students.cancel')} save={t('students.save')} />
        </form>
      </Modal>
    );
  }

  return (
    <>
      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

      <ListCard<StudentRow>
        title={t('students.title')}
        description={t('students.description')}
        cardTitle={t('students.title')}
        searchPlaceholder={t('students.searchPlaceholder')}
        searchTerm={search}
        onSearchChange={setSearch}
        primaryLabel={t('students.newStudent')}
        onPrimary={openCreate}
        table={table}
        recordCount={filtered.length}
        isLoading={loading}
        emptyMessage={t('students.noStudents')}
        onRowClick={(s) => openDetails(s)}
        toolbarExtras={
          <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            Importar
          </Button>
        }
      />

      {studentModalOpen && StudentForm()}
      {importOpen && (
        <ImportModal
          title="Importar Alumnos"
          templateFilename="plantilla-alumnos.xlsx"
          columns={studentImportColumns}
          onImport={handleStudentImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
};

const Info: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-0.5 text-sm text-slate-800">{value || '—'}</p>
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{text}</p>;

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5"><label className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</label>{children}</div>
);

const MultiSelect: React.FC<{ label: string; options: StaffItem[]; selected: string[]; onToggle: (id: string) => void }> = ({ label, options, selected, onToggle }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</label>
    <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
          <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} />
          <span>{o.name}{o.roleName ? ` · ${o.roleName}` : ''}</span>
        </label>
      ))}
    </div>
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <button onClick={onClose} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100"><i className="fa-solid fa-xmark" /></button>
      </div>
      {children}
    </div>
  </div>
);

const ModalActions: React.FC<{ onCancel: () => void; cancel: string; save: string }> = ({ onCancel, cancel, save }) => (
  <div className="flex justify-end gap-2 pt-2">
    <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50">{cancel}</button>
    <button type="submit" className="rounded-xl bg-red-500 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600">{save}</button>
  </div>
);

export default StudentModule;
