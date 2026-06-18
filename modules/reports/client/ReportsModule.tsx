import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUser, ViewType } from '@sinapsis/shared-types';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import ListCard from '@webapp/components/shared/ListCard';
import { cn } from '@webapp/lib/utils';

// ── Rating ───────────────────────────────────────────────────────────────────

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
  const [hover, setHover] = useState(0);
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
            <button key={i} type="button"
              onClick={() => onChange(rating === pos ? 0 : pos, theme)}
              onMouseEnter={() => setHover(pos)} onMouseLeave={() => setHover(0)}
              className={cn('text-3xl leading-none transition-all select-none hover:scale-125 focus:outline-none',
                active ? 'opacity-100' : 'opacity-25 grayscale')}>
              {icon}
            </button>
          );
        })}
        {rating > 0 && <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{rating}/5</span>}
      </div>
    </div>
  );
};

// ── Shared UI helpers ─────────────────────────────────────────────────────────

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</label>
    {children}
  </div>
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReportRow {
  id: string;
  studentId: string;
  studentName: string;
  studentAvatarUrl?: string | null;
  authorId: string;
  authorName?: string | null;
  authorAvatarUrl?: string | null;
  type: string;
  title: string;
  content?: string | null;
  summary?: string | null;
  visibility: string;
  status: string;
  rating?: number | null;
  ratingTheme?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  companyName?: string | null;
}

interface StudentOption { id: string; firstName: string; lastName: string; companyName?: string | null }

const emptyForm = { studentId: '', type: 'PROGRESS', title: '', content: '', summary: '', visibility: 'INTERNAL_STAFF', status: 'DRAFT', rating: 0, ratingTheme: 'stars' };

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: 'bg-green-50 text-green-700 border border-green-200',
  DRAFT:     'bg-amber-50 text-amber-700 border border-amber-200',
  ARCHIVED:  'bg-slate-100 text-slate-500 border border-slate-200',
};

const STATUS_LABELS: Record<string, string> = { PUBLISHED: 'Publicado', DRAFT: 'Borrador', ARCHIVED: 'Archivado' };
const TYPE_LABELS: Record<string, string>   = { PROGRESS: 'Progreso', OBSERVATION: 'Observación', LEVEL_CHANGE: 'Cambio nivel', RECOMMENDATION: 'Recomendación' };

function initials(name?: string | null) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function timeAgo(v?: string | null) {
  if (!v) return '';
  const diff = Date.now() - Date.parse(v);
  if (isNaN(diff)) return '';
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `hace ${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5)  return `hace ${w} sem`;
  const mo = Math.floor(d / 30);
  return `hace ${mo} mes${mo !== 1 ? 'es' : ''}`;
}

function formatDateTime(v?: string | null) {
  if (!v) return '';
  const d = new Date(Date.parse(v));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Module ────────────────────────────────────────────────────────────────────

interface Props {
  view: 'list';
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
}

const ReportsModule: React.FC<Props> = ({ companyId }) => {
  const { t } = useTranslation();

  const [reports, setReports]   = useState<ReportRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [sorting, setSorting]   = useState<SortingState>([]);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState({ ...emptyForm });
  const [saving, setSaving]         = useState(false);
  const [formError, setFormError]   = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentOption[]>([]);

  const loadReports = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ limit: '200' });
      if (companyId) qs.set('companyId', companyId);
      const res = await fetch(`/api/reports?${qs.toString()}`);
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('reports.errorLoad')); }
      const data = await res.json();
      setReports(data.items ?? (Array.isArray(data) ? data : []));
    } catch (err: any) { setError(err.message || t('reports.errorLoad')); }
    finally { setLoading(false); }
  }, [companyId, t]);

  const loadStudents = useCallback(async () => {
    try {
      const res = await fetch('/api/reports/meta/students');
      if (res.ok) setStudents(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadReports(); }, [loadReports]);
  useEffect(() => { void loadStudents(); }, [loadStudents]);

  const openCreate = () => {
    setEditingId(null); setFormError('');
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (r: ReportRow) => {
    setEditingId(r.id); setFormError('');
    setForm({ studentId: r.studentId, type: r.type, title: r.title, content: r.content ?? '', summary: r.summary ?? '', visibility: r.visibility, status: r.status, rating: r.rating ?? 0, ratingTheme: r.ratingTheme ?? 'stars' });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.studentId || !form.title.trim()) return;
    setSaving(true); setFormError('');
    try {
      const url    = editingId ? `/api/reports/${editingId}` : '/api/reports';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('reports.errorSave')); }
      setModalOpen(false);
      await loadReports();
    } catch (err: any) { setFormError(err.message || t('reports.errorSave')); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('reports.errorSave')); }
      setReports((prev) => prev.filter((r) => r.id !== id));
      setConfirmDeleteId(null);
    } catch (err: any) { setError(String(err.message)); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) =>
      r.title.toLowerCase().includes(q) ||
      (r.studentName || '').toLowerCase().includes(q) ||
      (r.authorName || '').toLowerCase().includes(q) ||
      (r.summary || '').toLowerCase().includes(q) ||
      (r.companyName || '').toLowerCase().includes(q)
    );
  }, [reports, search]);

  const columns = useMemo<ColumnDef<ReportRow>[]>(
    () => [
      {
        id: 'student',
        accessorFn: (r) => r.studentName,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Alumno" />,
        cell: ({ row: { original: r } }) => (
          <div className="flex items-center gap-3">
            {r.studentAvatarUrl
              ? <img src={r.studentAvatarUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded-xl object-cover" />
              : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-500">
                  {initials(r.studentName)}
                </div>
            }
            <div>
              <p className="text-sm font-semibold text-foreground">{r.studentName}</p>
              {r.companyName && <p className="text-[11px] text-muted-foreground">{r.companyName}</p>}
            </div>
          </div>
        )
      },
      {
        id: 'title',
        accessorFn: (r) => r.title,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('reports.title')} />,
        cell: ({ row: { original: r } }) => (
          <div>
            <p className="text-sm font-semibold text-foreground">{r.title}</p>
            {r.summary && <p className="text-[11px] text-muted-foreground line-clamp-1">{r.summary}</p>}
            <span className="mt-0.5 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              {TYPE_LABELS[r.type] ?? r.type}
            </span>
          </div>
        )
      },
      {
        id: 'author',
        accessorFn: (r) => r.authorName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('reports.author')} />,
        cell: ({ row: { original: r } }) => (
          <div className="flex items-center gap-2">
            {r.authorAvatarUrl
              ? <img src={r.authorAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
              : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-50 text-[10px] font-bold text-red-500">{initials(r.authorName)}</div>
            }
            <span className="text-sm text-foreground">{r.authorName || '—'}</span>
          </div>
        )
      },
      {
        id: 'rating',
        accessorFn: (r) => r.rating ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('reports.rating')} />,
        cell: ({ row: { original: r } }) => r.rating
          ? <RatingDisplay rating={r.rating} theme={r.ratingTheme || 'stars'} />
          : <span className="text-muted-foreground text-xs">—</span>
      },
      {
        id: 'date',
        accessorFn: (r) => r.publishedAt ?? r.createdAt,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Fecha" />,
        cell: ({ row: { original: r } }) => {
          const v = r.publishedAt ?? r.createdAt;
          return (
            <div>
              <p className="text-xs font-medium text-foreground">{formatDateTime(v)}</p>
              <p className="text-[11px] text-muted-foreground">{timeAgo(v)}</p>
            </div>
          );
        }
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('reports.status')} />,
        cell: ({ row: { original: r } }) => (
          <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold', STATUS_STYLES[r.status] ?? STATUS_STYLES.DRAFT)}>
            {STATUS_LABELS[r.status] ?? r.status}
          </span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">
            Acciones
          </span>
        ),
        cell: ({ row: { original: r } }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {confirmDeleteId === r.id ? (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-red-600 font-medium">¿Eliminar?</span>
                <button onClick={() => handleDelete(r.id)} className="rounded-lg bg-red-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-600">Sí</button>
                <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50">No</button>
              </div>
            ) : (
              <>
                <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEdit(r)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button type="button" mode="icon" size="sm" variant="outline" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => setConfirmDeleteId(r.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, confirmDeleteId]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  return (
    <>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto"><X className="size-4" /></button>
        </div>
      )}

      <ListCard<ReportRow>
        title={t('reports.title')}
        description="Todos los informes de progreso de los alumnos"
        cardTitle={t('reports.list')}
        searchPlaceholder={t('reports.search')}
        searchTerm={search}
        onSearchChange={setSearch}
        primaryLabel={t('reports.newReport')}
        onPrimary={openCreate}
        table={table}
        recordCount={filtered.length}
        isLoading={loading}
        emptyMessage={t('reports.noReports')}
        onRowClick={openEdit}
      />

      {modalOpen && (
        <Modal title={editingId ? t('reports.editReport') : t('reports.newReport')} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            {formError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</p>}

            <Field label={t('reports.student')}>
              <select className={inputClass} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required disabled={!!editingId}>
                <option value="">{t('reports.selectStudent')}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.companyName ? ` — ${s.companyName}` : ''}</option>
                ))}
              </select>
            </Field>

            <Field label={t('reports.title')}>
              <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={t('reports.type')}>
                <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="PROGRESS">Progreso</option>
                  <option value="OBSERVATION">Observación</option>
                  <option value="LEVEL_CHANGE">Cambio de nivel</option>
                  <option value="RECOMMENDATION">Recomendación</option>
                </select>
              </Field>
              <Field label={t('reports.visibility')}>
                <select className={inputClass} value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>
                  <option value="INTERNAL_STAFF">Solo staff</option>
                  <option value="TUTORS_ONLY">Visible a padres</option>
                </select>
              </Field>
            </div>

            <Field label={t('reports.summary')}>
              <input className={inputClass} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Breve resumen (opcional)" />
            </Field>

            <Field label={t('reports.content')}>
              <textarea className={inputClass} rows={4} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </Field>

            <Field label={t('reports.status')}>
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="DRAFT">Borrador</option>
                <option value="PUBLISHED">Publicado</option>
                <option value="ARCHIVED">Archivado</option>
              </select>
            </Field>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">{t('reports.rating')}</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <RatingPicker rating={form.rating} theme={form.ratingTheme} onChange={(r, th) => setForm({ ...form, rating: r, ratingTheme: th })} />
              </div>
            </div>

            <ModalActions onCancel={() => setModalOpen(false)} cancel={t('reports.cancel')} save={t('reports.save')} disabled={saving || !form.studentId || !form.title.trim()} />
          </form>
        </Modal>
      )}
    </>
  );
};

export default ReportsModule;
