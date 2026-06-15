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
import { Dumbbell, Eye, FileText, Layers, Pencil, Power, PowerOff } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import { cn } from '@webapp/lib/utils';
import ListCard from '@webapp/components/shared/ListCard';
import ProfileHeader from '@webapp/components/shared/ProfileHeader';

type DisciplineView = 'list' | 'details';

interface DisciplineModuleProps {
  view: DisciplineView;
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
}

interface MetaItem {
  id: string;
  name: string;
}

interface DisciplineItem {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  active: boolean;
  levelCount?: number;
  resourceCount?: number;
}

interface LevelItem {
  id: string;
  disciplineId: string;
  name: string;
  description?: string | null;
  levelOrder: number;
  color?: string | null;
  active: boolean;
}

interface ResourceItem {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  visibility: string;
  resourceUrl?: string | null;
  thumbnailUrl?: string | null;
  active: boolean;
  createdByName?: string;
}

const SELECTED_KEY = 'sinapsis.disciplines.selected';
const RESOURCE_TYPES = ['PEDAGOGICAL_MATERIAL', 'EXERCISE_VIDEO', 'TOOLS', 'WORK_GUIDELINES', 'GENERAL_FILE'];
const VISIBILITIES = ['ADMIN_ONLY', 'STAFF_ONLY', 'MEMBERS_ONLY', 'PUBLIC'];

const labelize = (raw: string) =>
  String(raw || '')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';

const DisciplineModule: React.FC<DisciplineModuleProps> = ({ view, setView, currentUser, onSubTitleChange }) => {
  const { t } = useTranslation();

  const [disciplines, setDisciplines] = useState<DisciplineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<DisciplineItem | null>(null);
  const [levels, setLevels] = useState<LevelItem[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [meta, setMeta] = useState<{ resourceTypes: MetaItem[]; visibilities: MetaItem[] }>({ resourceTypes: [], visibilities: [] });
  const [activeTab, setActiveTab] = useState<'Overview' | 'Levels' | 'Resources'>('Overview');

  // Discipline modal
  const [disciplineModalOpen, setDisciplineModalOpen] = useState(false);
  const [editingDisciplineId, setEditingDisciplineId] = useState<string | null>(null);
  const [disciplineForm, setDisciplineForm] = useState({ name: '', description: '', imageUrl: '', active: true });

  // Level modal
  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [editingLevelId, setEditingLevelId] = useState<string | null>(null);
  const [levelForm, setLevelForm] = useState({ name: '', description: '', color: '#0ea5e9' });

  // Resource modal
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState({ title: '', description: '', type: 'GENERAL_FILE', visibility: 'STAFF_ONLY', resourceUrl: '' });
  const resourceFileRef = useRef<HTMLInputElement>(null);

  const userId = currentUser?.id || '';

  const typeOptions = useMemo(() => (meta.resourceTypes.length ? meta.resourceTypes.map((x) => x.name) : RESOURCE_TYPES), [meta.resourceTypes]);
  const visibilityOptions = useMemo(() => (meta.visibilities.length ? meta.visibilities.map((x) => x.name) : VISIBILITIES), [meta.visibilities]);

  const loadDisciplines = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/disciplines');
      if (!res.ok) throw new Error();
      setDisciplines(await res.json());
    } catch {
      setError(t('disciplines.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  const loadMeta = async () => {
    try {
      const res = await fetch('/api/disciplines/meta');
      if (res.ok) setMeta((await res.json()).categories || { resourceTypes: [], visibilities: [] });
    } catch {
      /* defaults used */
    }
  };

  const loadDetails = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/disciplines/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(data);
      setLevels(Array.isArray(data.levels) ? data.levels : []);
      onSubTitleChange?.(data.name);
      const resResources = await fetch(`/api/disciplines/${id}/resources`);
      setResources(resResources.ok ? await resResources.json() : []);
    } catch {
      setError(t('disciplines.errorLoad'));
    }
  };

  useEffect(() => {
    void loadMeta();
  }, []);

  useEffect(() => {
    if (view === 'list') {
      void loadDisciplines();
      setSelected(null);
    } else if (view === 'details') {
      const id = localStorage.getItem(SELECTED_KEY);
      if (id) void loadDetails(id);
      else setView('Disciplines');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const openDetails = (d: DisciplineItem) => {
    localStorage.setItem(SELECTED_KEY, d.id);
    setSelected(d);
    setActiveTab('Overview');
    setView('DisciplineDetails');
  };

  // ---- Discipline CRUD ------------------------------------------------------
  const openCreateDiscipline = () => {
    setEditingDisciplineId(null);
    setDisciplineForm({ name: '', description: '', imageUrl: '', active: true });
    setDisciplineModalOpen(true);
  };

  const openEditDiscipline = (d: DisciplineItem) => {
    setEditingDisciplineId(d.id);
    setDisciplineForm({ name: d.name, description: d.description || '', imageUrl: d.imageUrl || '', active: d.active });
    setDisciplineModalOpen(true);
  };

  const submitDiscipline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return setError(t('disciplines.errorAuthRequired'));
    if (!disciplineForm.name.trim()) return;
    try {
      const isEdit = Boolean(editingDisciplineId);
      const res = await fetch(isEdit ? `/api/disciplines/${editingDisciplineId}` : '/api/disciplines', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...disciplineForm, createdById: userId, updatedById: userId })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('disciplines.errorSave'));
      }
      setDisciplineModalOpen(false);
      await loadDisciplines();
      if (isEdit && selected?.id === editingDisciplineId) await loadDetails(editingDisciplineId);
    } catch (e: any) {
      setError(e.message || t('disciplines.errorSave'));
    }
  };

  const toggleDiscipline = async (d: DisciplineItem) => {
    try {
      await fetch(`/api/disciplines/${d.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !d.active, updatedById: userId })
      });
      await loadDisciplines();
    } catch {
      setError(t('disciplines.errorSave'));
    }
  };

  // ---- Levels ---------------------------------------------------------------
  const openCreateLevel = () => {
    setEditingLevelId(null);
    setLevelForm({ name: '', description: '', color: '#0ea5e9' });
    setLevelModalOpen(true);
  };

  const openEditLevel = (l: LevelItem) => {
    setEditingLevelId(l.id);
    setLevelForm({ name: l.name, description: l.description || '', color: l.color || '#0ea5e9' });
    setLevelModalOpen(true);
  };

  const submitLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!levelForm.name.trim()) return;
    try {
      const isEdit = Boolean(editingLevelId);
      const url = isEdit
        ? `/api/disciplines/${selected.id}/levels/${editingLevelId}`
        : `/api/disciplines/${selected.id}/levels`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(levelForm)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('disciplines.errorSave'));
      }
      setLevelModalOpen(false);
      await loadDetails(selected.id);
    } catch (e: any) {
      setError(e.message || t('disciplines.errorSave'));
    }
  };

  const toggleLevel = async (l: LevelItem) => {
    if (!selected) return;
    await fetch(`/api/disciplines/${selected.id}/levels/${l.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !l.active })
    });
    await loadDetails(selected.id);
  };

  const moveLevel = async (index: number, dir: -1 | 1) => {
    if (!selected) return;
    const next = [...levels];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLevels(next);
    await fetch(`/api/disciplines/${selected.id}/levels/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedLevelIds: next.map((l) => l.id) })
    });
    await loadDetails(selected.id);
  };

  // ---- Resources ------------------------------------------------------------
  const openCreateResource = () => {
    setResourceForm({ title: '', description: '', type: typeOptions[0] || 'GENERAL_FILE', visibility: 'STAFF_ONLY', resourceUrl: '' });
    if (resourceFileRef.current) resourceFileRef.current.value = '';
    setResourceModalOpen(true);
  };

  const submitResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!userId) return setError(t('disciplines.errorAuthRequired'));
    if (!resourceForm.title.trim()) return;
    try {
      const file = resourceFileRef.current?.files?.[0];
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', resourceForm.title);
        fd.append('description', resourceForm.description);
        fd.append('type', resourceForm.type);
        fd.append('visibility', resourceForm.visibility);
        fd.append('createdById', userId);
        res = await fetch(`/api/disciplines/${selected.id}/resources/upload`, { method: 'POST', body: fd });
      } else {
        res = await fetch(`/api/disciplines/${selected.id}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...resourceForm, createdById: userId, updatedById: userId })
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('disciplines.errorSave'));
      }
      setResourceModalOpen(false);
      await loadDetails(selected.id);
    } catch (e: any) {
      setError(e.message || t('disciplines.errorSave'));
    }
  };

  const deleteResource = async (r: ResourceItem) => {
    if (!selected) return;
    if (!confirm(t('disciplines.deleteConfirm'))) return;
    await fetch(`/api/disciplines/${selected.id}/resources/${r.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedById: userId })
    });
    await loadDetails(selected.id);
  };

  // ---- List table (standard Sinapsis ListCard) ------------------------------
  const [sorting, setSorting] = useState<SortingState>([]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return disciplines;
    return disciplines.filter((d) => d.name.toLowerCase().includes(q) || (d.description || '').toLowerCase().includes(q));
  }, [disciplines, search]);

  const columns = useMemo<ColumnDef<DisciplineItem>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.name')} />,
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
                <Dumbbell className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{d.name}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{d.description || '—'}</p>
              </div>
            </div>
          );
        }
      },
      {
        id: 'levels',
        accessorFn: (row) => row.levelCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.levels')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.levelCount ?? 0}</span>
      },
      {
        id: 'resources',
        accessorFn: (row) => row.resourceCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.resources')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.resourceCount ?? 0}</span>
      },
      {
        id: 'status',
        accessorFn: (row) => (row.active ? 'active' : 'inactive'),
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.status')} />,
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
              row.original.active ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground'
            )}
          >
            {row.original.active ? t('disciplines.active') : t('disciplines.inactive')}
          </span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">
            {t('disciplines.actions')}
          </span>
        ),
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openDetails(d)} aria-label={t('disciplines.view')}>
                <Eye className="size-3.5" />
              </Button>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEditDiscipline(d)} aria-label={t('disciplines.edit')}>
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className={cn('size-8', d.active && 'text-destructive hover:bg-destructive/10')}
                onClick={() => toggleDiscipline(d)}
                aria-label={t('disciplines.status')}
              >
                {d.active ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
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

  // ---- Render ---------------------------------------------------------------
  const primaryBtn =
    'px-5 py-2.5 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2';
  const ghostBtn =
    'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all';

  if (view === 'details') {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <ProfileHeader
          title={selected?.name || '—'}
          imageUrl={selected?.imageUrl || undefined}
          icon={<Dumbbell className="size-10" />}
          meta={[
            { icon: <Layers className="size-4" />, text: `${levels.length} ${t('disciplines.levels')}` },
            { icon: <FileText className="size-4" />, text: `${resources.length} ${t('disciplines.resources')}` },
            { text: selected?.active ? t('disciplines.active') : t('disciplines.inactive') }
          ]}
          tabs={[
            { id: 'Overview', label: t('disciplines.overview') },
            { id: 'Levels', label: t('disciplines.levels') },
            { id: 'Resources', label: t('disciplines.resources') }
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as 'Overview' | 'Levels' | 'Resources')}
          onBack={() => setView('Disciplines')}
          actions={
            <Button type="button" variant="outline" onClick={() => selected && openEditDiscipline(selected)}>
              <Pencil className="size-3.5" /> {t('disciplines.edit')}
            </Button>
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
        {activeTab === 'Overview' && selected && (
          <div className="grid gap-6 px-1 md:grid-cols-3">
            {selected.imageUrl ? (
              <img src={selected.imageUrl} alt="" className="h-40 w-full rounded-2xl object-cover md:col-span-1" />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-2xl bg-slate-100 text-slate-300 md:col-span-1">
                <i className="fa-solid fa-dumbbell text-4xl" />
              </div>
            )}
            <div className="space-y-3 md:col-span-2">
              <p className="text-sm text-slate-600">{selected.description || '—'}</p>
              <div className="flex gap-6 pt-2">
                <div>
                  <p className="text-2xl font-bold text-slate-900">{levels.length}</p>
                  <p className="text-xs uppercase tracking-widest text-slate-400">{t('disciplines.levels')}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{resources.length}</p>
                  <p className="text-xs uppercase tracking-widest text-slate-400">{t('disciplines.resources')}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Levels' && (
          <div className="px-1">
            <div className="mb-4 flex justify-end">
              <button onClick={openCreateLevel} className={primaryBtn}>
                <i className="fa-solid fa-plus" /> {t('disciplines.newLevel')}
              </button>
            </div>
            {levels.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{t('disciplines.noLevels')}</p>
            ) : (
              <div className="space-y-2">
                {levels.map((l, i) => (
                  <div key={l.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <span className="h-4 w-4 rounded-full" style={{ backgroundColor: l.color || '#cbd5e1' }} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{l.name}</p>
                      {l.description && <p className="text-xs text-slate-500">{l.description}</p>}
                    </div>
                    {!l.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400">{t('disciplines.inactive')}</span>}
                    <button title={t('disciplines.moveUp')} onClick={() => moveLevel(i, -1)} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100"><i className="fa-solid fa-chevron-up" /></button>
                    <button title={t('disciplines.moveDown')} onClick={() => moveLevel(i, 1)} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100"><i className="fa-solid fa-chevron-down" /></button>
                    <button title={t('disciplines.edit')} onClick={() => openEditLevel(l)} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100"><i className="fa-solid fa-pen" /></button>
                    <button onClick={() => toggleLevel(l)} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100"><i className={`fa-solid ${l.active ? 'fa-toggle-on text-red-500' : 'fa-toggle-off'}`} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Resources' && (
          <div className="px-1">
            <div className="mb-4 flex justify-end">
              <button onClick={openCreateResource} className={primaryBtn}>
                <i className="fa-solid fa-plus" /> {t('disciplines.newResource')}
              </button>
            </div>
            {resources.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{t('disciplines.noResources')}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {resources.map((r) => (
                  <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                        <p className="text-xs text-slate-400">{labelize(r.type)} · {labelize(r.visibility)}</p>
                      </div>
                      <button onClick={() => deleteResource(r)} className="h-8 w-8 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500"><i className="fa-solid fa-trash" /></button>
                    </div>
                    {r.description && <p className="mt-2 text-xs text-slate-500">{r.description}</p>}
                    {r.resourceUrl && (
                      <a href={r.resourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-500 hover:text-red-600">
                        <i className="fa-solid fa-up-right-from-square" /> {t('disciplines.open')}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </div>

        {/* Level modal */}
        {levelModalOpen && (
          <Modal onClose={() => setLevelModalOpen(false)} title={editingLevelId ? t('disciplines.editLevel') : t('disciplines.newLevel')}>
            <form onSubmit={submitLevel} className="space-y-4">
              <Field label={t('disciplines.levelName')}>
                <input className={inputClass} value={levelForm.name} onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })} required />
              </Field>
              <Field label={t('disciplines.descriptionLabel')}>
                <textarea className={inputClass} rows={2} value={levelForm.description} onChange={(e) => setLevelForm({ ...levelForm, description: e.target.value })} />
              </Field>
              <Field label={t('disciplines.color')}>
                <input type="color" className="h-10 w-20 rounded-lg border border-slate-200" value={levelForm.color} onChange={(e) => setLevelForm({ ...levelForm, color: e.target.value })} />
              </Field>
              <ModalActions onCancel={() => setLevelModalOpen(false)} cancelLabel={t('disciplines.cancel')} saveLabel={t('disciplines.save')} />
            </form>
          </Modal>
        )}

        {/* Resource modal */}
        {resourceModalOpen && (
          <Modal onClose={() => setResourceModalOpen(false)} title={t('disciplines.newResource')}>
            <form onSubmit={submitResource} className="space-y-4">
              <Field label={t('disciplines.resourceTitle')}>
                <input className={inputClass} value={resourceForm.title} onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })} required />
              </Field>
              <Field label={t('disciplines.descriptionLabel')}>
                <textarea className={inputClass} rows={2} value={resourceForm.description} onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('disciplines.type')}>
                  <select className={inputClass} value={resourceForm.type} onChange={(e) => setResourceForm({ ...resourceForm, type: e.target.value })}>
                    {typeOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}
                  </select>
                </Field>
                <Field label={t('disciplines.visibility')}>
                  <select className={inputClass} value={resourceForm.visibility} onChange={(e) => setResourceForm({ ...resourceForm, visibility: e.target.value })}>
                    {visibilityOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}
                  </select>
                </Field>
              </div>
              <Field label={t('disciplines.url')}>
                <input className={inputClass} value={resourceForm.resourceUrl} onChange={(e) => setResourceForm({ ...resourceForm, resourceUrl: e.target.value })} placeholder="https://..." />
              </Field>
              <Field label={t('disciplines.uploadFile')}>
                <input ref={resourceFileRef} type="file" className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase" />
              </Field>
              <ModalActions onCancel={() => setResourceModalOpen(false)} cancelLabel={t('disciplines.cancel')} saveLabel={t('disciplines.save')} />
            </form>
          </Modal>
        )}
      </div>
    );
  }

  // ---- List view (standard Sinapsis ListCard) -------------------------------
  return (
    <>
      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

      <ListCard<DisciplineItem>
        title={t('disciplines.title')}
        description={t('disciplines.description')}
        cardTitle={t('disciplines.title')}
        searchPlaceholder={t('disciplines.searchPlaceholder')}
        searchTerm={search}
        onSearchChange={setSearch}
        primaryLabel={t('disciplines.newDiscipline')}
        onPrimary={openCreateDiscipline}
        table={table}
        recordCount={filtered.length}
        isLoading={loading}
        emptyMessage={t('disciplines.noDisciplines')}
        onRowClick={(d) => openDetails(d)}
      />

      {disciplineModalOpen && (
        <Modal onClose={() => setDisciplineModalOpen(false)} title={editingDisciplineId ? t('disciplines.editDiscipline') : t('disciplines.newDiscipline')}>
          <form onSubmit={submitDiscipline} className="space-y-4">
            <Field label={t('disciplines.name')}>
              <input className={inputClass} value={disciplineForm.name} onChange={(e) => setDisciplineForm({ ...disciplineForm, name: e.target.value })} required />
            </Field>
            <Field label={t('disciplines.descriptionLabel')}>
              <textarea className={inputClass} rows={3} value={disciplineForm.description} onChange={(e) => setDisciplineForm({ ...disciplineForm, description: e.target.value })} />
            </Field>
            <Field label={t('disciplines.imageUrl')}>
              <input className={inputClass} value={disciplineForm.imageUrl} onChange={(e) => setDisciplineForm({ ...disciplineForm, imageUrl: e.target.value })} placeholder="https://..." />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={disciplineForm.active} onChange={(e) => setDisciplineForm({ ...disciplineForm, active: e.target.checked })} />
              {t('disciplines.active')}
            </label>
            <ModalActions onCancel={() => setDisciplineModalOpen(false)} cancelLabel={t('disciplines.cancel')} saveLabel={t('disciplines.save')} />
          </form>
        </Modal>
      )}
    </>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</label>
    {children}
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <button onClick={onClose} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100"><i className="fa-solid fa-xmark" /></button>
      </div>
      {children}
    </div>
  </div>
);

const ModalActions: React.FC<{ onCancel: () => void; cancelLabel: string; saveLabel: string }> = ({ onCancel, cancelLabel, saveLabel }) => (
  <div className="flex justify-end gap-2 pt-2">
    <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50">{cancelLabel}</button>
    <button type="submit" className="rounded-xl bg-red-500 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600">{saveLabel}</button>
  </div>
);

export default DisciplineModule;
