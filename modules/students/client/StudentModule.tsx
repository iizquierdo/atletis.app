import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUser, ViewType } from '@sinapsis/shared-types';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Building2, Eye, IdCard, Mail, Pencil, Power, PowerOff } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import { cn } from '@webapp/lib/utils';
import ListCard from '@webapp/components/shared/ListCard';
import ProfileHeader from '@webapp/components/shared/ProfileHeader';

type StudentView = 'list' | 'details';

interface Props {
  view: StudentView;
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
}

interface MetaItem { id: string; name: string }
interface StaffItem { id: string; name: string; email?: string; roleName?: string }
interface LevelItem { id: string; disciplineId: string; name: string }
interface DisciplineItem { id: string; name: string; levels: LevelItem[] }
interface CompanyItem { id: string; name: string }

interface StudentRow {
  id: string; code: string; firstName: string; lastName: string; document?: string | null;
  status: string; companyId: string; companyName?: string; disciplineCount?: number;
}

interface Enrollment { id: string; disciplineId: string; levelId?: string | null; status: string }
interface Assignment { id: string; teacherId?: string; tutorId?: string; teacherName?: string; tutorName?: string }
interface ReportItem { id: string; type: string; title: string; content?: string | null; summary?: string | null; visibility: string; status: string; authorName?: string; createdAt: string }
interface ConversationItem { id: string; subject?: string | null; status: string; createdByName?: string; messageCount?: number; updatedAt: string }
interface MessageItem { id: string; senderId: string; senderName?: string; body: string; createdAt: string }

const SELECTED_KEY = 'sinapsis.students.selected';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';
const labelize = (raw: string) => String(raw || '').toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const emptyForm = {
  firstName: '', lastName: '', document: '', birthDate: '', gender: '', email: '', phone: '', address: '',
  medicalNotes: '', emergencyContactName: '', emergencyContactPhone: '', guardianName: '', guardianPhone: '', guardianEmail: '',
  notes: '', status: 'ACTIVE', companyId: '',
  disciplineAssignments: [] as { disciplineId: string; levelId: string }[],
  teacherIds: [] as string[], tutorIds: [] as string[]
};

const StudentModule: React.FC<Props> = ({ view, setView, currentUser, companyId, onSubTitleChange }) => {
  const { t } = useTranslation();
  const userId = currentUser?.id || '';

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [meta, setMeta] = useState<{ genders: MetaItem[]; statuses: MetaItem[]; reportTypes: MetaItem[]; reportVisibilities: MetaItem[]; staff: StaffItem[]; disciplines: DisciplineItem[] }>({ genders: [], statuses: [], reportTypes: [], reportVisibilities: [], staff: [], disciplines: [] });
  const [companies, setCompanies] = useState<CompanyItem[]>([]);

  const [selected, setSelected] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Disciplines' | 'Staff' | 'Reports' | 'Conversations'>('Overview');

  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportForm, setReportForm] = useState({ type: 'PROGRESS', title: '', content: '', summary: '', visibility: 'INTERNAL_STAFF', status: 'DRAFT' });

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [convModalOpen, setConvModalOpen] = useState(false);
  const [convForm, setConvForm] = useState({ subject: '', firstMessage: '' });
  const [openConv, setOpenConv] = useState<{ id: string; subject?: string | null; messages: MessageItem[] } | null>(null);
  const [draft, setDraft] = useState('');

  const disciplineName = (id: string) => meta.disciplines.find((d) => d.id === id)?.name || id;
  const levelName = (did: string, lid?: string | null) => meta.disciplines.find((d) => d.id === did)?.levels.find((l) => l.id === lid)?.name || '';

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
      const [rep, conv] = await Promise.all([
        fetch(`/api/students/${id}/reports`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/students/${id}/conversations`).then((r) => (r.ok ? r.json() : []))
      ]);
      setReports(rep); setConversations(conv);
    } catch { setError(t('students.errorLoad')); }
  };

  useEffect(() => { void loadMeta(); }, []);
  useEffect(() => {
    if (view === 'list') { void loadStudents(); setSelected(null); setOpenConv(null); }
    else { const id = localStorage.getItem(SELECTED_KEY); if (id) void loadDetails(id); else setView('Students'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, companyId]);

  const openDetails = (s: StudentRow) => { localStorage.setItem(SELECTED_KEY, s.id); setActiveTab('Overview'); setView('StudentDetails'); };

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

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!reportForm.title.trim()) return;
    try {
      const res = await fetch(`/api/students/${selected.id}/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reportForm) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('students.errorSave')); }
      setReportModalOpen(false);
      setReportForm({ type: 'PROGRESS', title: '', content: '', summary: '', visibility: 'INTERNAL_STAFF', status: 'DRAFT' });
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
        id: 'code',
        accessorFn: (row) => row.code,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('students.code')} />,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.code}</span>
      },
      {
        id: 'name',
        accessorFn: (row) => `${row.firstName} ${row.lastName}`,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('students.firstName')} />,
        cell: ({ row }) => {
          const s = row.original;
          const initials = `${s.firstName.charAt(0)}${s.lastName.charAt(0)}`.toUpperCase();
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-sm font-bold text-red-500">{initials}</div>
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
        id: 'disciplines',
        accessorFn: (row) => row.disciplineCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('students.disciplines')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.disciplineCount ?? 0}</span>
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
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <ProfileHeader
          title={selected ? `${selected.firstName} ${selected.lastName}` : '—'}
          initials={selected ? `${selected.firstName?.charAt(0) || ''}${selected.lastName?.charAt(0) || ''}`.toUpperCase() : '?'}
          meta={[
            { icon: <IdCard className="size-4" />, text: selected?.code || '—' },
            { icon: <Building2 className="size-4" />, text: selected?.companyName || '—' },
            ...(selected?.email ? [{ icon: <Mail className="size-4" />, text: selected.email }] : []),
            { text: selected?.status === 'ACTIVE' ? t('students.active') : t('students.inactive') }
          ]}
          tabs={[
            { id: 'Overview', label: t('students.overview') },
            { id: 'Disciplines', label: t('students.disciplines') },
            { id: 'Staff', label: t('students.staff') },
            { id: 'Reports', label: t('students.reports') },
            { id: 'Conversations', label: t('students.conversations') }
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
            <Info label={t('students.gender')} value={selected.gender ? labelize(selected.gender) : null} />
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
            {(selected.disciplines || []).length === 0 ? <Empty text={t('students.none')} /> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(selected.disciplines as Enrollment[]).map((d) => (
                  <div key={d.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{disciplineName(d.disciplineId)}</p>
                    <p className="text-xs text-slate-500">{levelName(d.disciplineId, d.levelId) || '—'} · {labelize(d.status)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Staff' && selected && (
          <div className="grid gap-6 px-1 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">{t('students.teachers')}</h3>
              {(selected.teachers || []).length === 0 ? <Empty text={t('students.none')} /> : (selected.teachers as Assignment[]).map((x) => (
                <div key={x.id} className="mb-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{x.teacherName}</div>
              ))}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">{t('students.tutors')}</h3>
              {(selected.tutors || []).length === 0 ? <Empty text={t('students.none')} /> : (selected.tutors as Assignment[]).map((x) => (
                <div key={x.id} className="mb-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">{x.tutorName}</div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'Reports' && (
          <div className="px-1">
            <div className="mb-4 flex justify-end"><button onClick={() => setReportModalOpen(true)} className={primaryBtn}><i className="fa-solid fa-plus" /> {t('students.newReport')}</button></div>
            {reports.length === 0 ? <Empty text={t('students.noReports')} /> : (
              <div className="space-y-2">
                {reports.map((r) => (
                  <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${r.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{labelize(r.status)}</span>
                    </div>
                    <p className="text-xs text-slate-400">{labelize(r.type)} · {labelize(r.visibility)} · {r.authorName}</p>
                    {r.summary && <p className="mt-2 text-xs text-slate-600">{r.summary}</p>}
                  </div>
                ))}
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

        </div>

        {studentModalOpen && <StudentForm />}
        {reportModalOpen && (
          <Modal title={t('students.newReport')} onClose={() => setReportModalOpen(false)}>
            <form onSubmit={submitReport} className="space-y-4">
              <Field label={t('students.reportTitle')}><input className={inputClass} value={reportForm.title} onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })} required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('students.reportType')}><select className={inputClass} value={reportForm.type} onChange={(e) => setReportForm({ ...reportForm, type: e.target.value })}>{reportTypeOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}</select></Field>
                <Field label={t('students.visibility')}><select className={inputClass} value={reportForm.visibility} onChange={(e) => setReportForm({ ...reportForm, visibility: e.target.value })}>{visibilityOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}</select></Field>
              </div>
              <Field label={t('students.summary')}><input className={inputClass} value={reportForm.summary} onChange={(e) => setReportForm({ ...reportForm, summary: e.target.value })} /></Field>
              <Field label={t('students.content')}><textarea className={inputClass} rows={4} value={reportForm.content} onChange={(e) => setReportForm({ ...reportForm, content: e.target.value })} /></Field>
              <Field label={t('students.status')}><select className={inputClass} value={reportForm.status} onChange={(e) => setReportForm({ ...reportForm, status: e.target.value })}><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option></select></Field>
              <ModalActions onCancel={() => setReportModalOpen(false)} cancel={t('students.cancel')} save={t('students.save')} />
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
            <Field label={t('students.gender')}><select className={inputClass} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">—</option>{genderOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}</select></Field>
            <Field label={t('students.sede')}><select className={inputClass} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label={t('students.email')}><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label={t('students.phone')}><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label={t('students.address')}><input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t('students.guardian')} — ${t('students.contactName')}`}><input className={inputClass} value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} /></Field>
            <Field label={`${t('students.guardian')} — ${t('students.contactPhone')}`}><input className={inputClass} value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} /></Field>
            <Field label={`${t('students.emergency')} — ${t('students.contactName')}`}><input className={inputClass} value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} /></Field>
            <Field label={`${t('students.emergency')} — ${t('students.contactPhone')}`}><input className={inputClass} value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} /></Field>
          </div>
          <Field label={t('students.medical')}><textarea className={inputClass} rows={2} value={form.medicalNotes} onChange={(e) => setForm({ ...form, medicalNotes: e.target.value })} /></Field>

          {/* Enrollment */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('students.disciplines')}</span>
              <button type="button" onClick={() => setForm({ ...form, disciplineAssignments: [...form.disciplineAssignments, { disciplineId: '', levelId: '' }] })} className="text-xs font-bold text-red-500"><i className="fa-solid fa-plus mr-1" />{t('students.addDiscipline')}</button>
            </div>
            {form.disciplineAssignments.map((a, i) => {
              const disc = meta.disciplines.find((d) => d.id === a.disciplineId);
              return (
                <div key={i} className="flex gap-2">
                  <select className={inputClass} value={a.disciplineId} onChange={(e) => { const next = [...form.disciplineAssignments]; next[i] = { disciplineId: e.target.value, levelId: '' }; setForm({ ...form, disciplineAssignments: next }); }}>
                    <option value="">{t('students.discipline')}</option>
                    {meta.disciplines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select className={inputClass} value={a.levelId} onChange={(e) => { const next = [...form.disciplineAssignments]; next[i].levelId = e.target.value; setForm({ ...form, disciplineAssignments: next }); }}>
                    <option value="">{t('students.level')}</option>
                    {(disc?.levels || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setForm({ ...form, disciplineAssignments: form.disciplineAssignments.filter((_, idx) => idx !== i) })} className="h-10 w-10 shrink-0 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500"><i className="fa-solid fa-trash" /></button>
                </div>
              );
            })}
          </div>

          {/* Teachers / Tutors */}
          <div className="grid grid-cols-2 gap-3">
            <MultiSelect label={t('students.selectTeachers')} options={meta.staff} selected={form.teacherIds} onToggle={(id) => setForm({ ...form, teacherIds: toggleInArray(form.teacherIds, id) })} />
            <MultiSelect label={t('students.selectTutors')} options={meta.staff} selected={form.tutorIds} onToggle={(id) => setForm({ ...form, tutorIds: toggleInArray(form.tutorIds, id) })} />
          </div>

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
      />

      {studentModalOpen && <StudentForm />}
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
