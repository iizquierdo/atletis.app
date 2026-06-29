import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUser, ViewType } from '@sinapsis/shared-types';
import { mediaUrl } from '@webapp/lib/media';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { Building2, CalendarDays, Dumbbell, Eye, FileText, Pencil, Power, PowerOff } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import { cn } from '@webapp/lib/utils';
import ListCard from '@webapp/components/shared/ListCard';
import ProfileHeader from '@webapp/components/shared/ProfileHeader';

type DisciplineView = 'list' | 'details' | 'resources';

interface DisciplineModuleProps {
  view: DisciplineView;
  setView: (view: ViewType, params?: Record<string, string>) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
  recordId?: string;
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
  coverUrl?: string | null;
  active: boolean;
  resourceCount?: number;
  classCount?: number;
  studentCount?: number;
}

interface ResourceItem {
  id: string;
  disciplineId: string;
  title: string;
  description?: string | null;
  type: string;
  visibility: string;
  resourceUrl?: string | null;
  thumbnailUrl?: string | null;
  active: boolean;
  createdByName?: string;
}

interface ClassSchedule {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface ClassRow {
  id: string;
  code?: string | null;
  name: string;
  companyId: string;
  companyName?: string | null;
  capacity?: number | null;
  status: string;
  teacherCount?: number;
  scheduleCount?: number;
  studentCount?: number;
  schedules?: ClassSchedule[];
}

interface CompanyItem {
  id: string;
  name: string;
}

const RESOURCE_TYPES = ['PEDAGOGICAL_MATERIAL', 'EXERCISE_VIDEO', 'TOOLS', 'WORK_GUIDELINES', 'GENERAL_FILE'];
const VISIBILITIES = ['ADMIN_ONLY', 'STAFF_ONLY', 'MEMBERS_ONLY', 'PUBLIC'];

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const fmtSchedules = (schedules: ClassSchedule[] | undefined): string => {
  if (!schedules || schedules.length === 0) return '';
  return schedules.map((s) => `${DAY_SHORT[s.dayOfWeek] ?? s.dayOfWeek} ${s.startTime}–${s.endTime}`).join(' · ');
};

const labelize = (raw: string) =>
  String(raw || '')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';

const DisciplineModule: React.FC<DisciplineModuleProps> = ({ view, setView, currentUser, onSubTitleChange, recordId }) => {
  const { t } = useTranslation();

  const [disciplines, setDisciplines] = useState<DisciplineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<DisciplineItem | null>(null);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [allResources, setAllResources] = useState<(ResourceItem & { disciplineName?: string; disciplineImageUrl?: string | null })[]>([]);
  const [allResourcesLoading, setAllResourcesLoading] = useState(false);
  const [meta, setMeta] = useState<{ resourceTypes: MetaItem[]; visibilities: MetaItem[] }>({ resourceTypes: [], visibilities: [] });
  const [activeTab, setActiveTab] = useState<'Overview' | 'Resources' | 'Classes'>('Overview');

  // Discipline modal
  const [disciplineModalOpen, setDisciplineModalOpen] = useState(false);
  const [editingDisciplineId, setEditingDisciplineId] = useState<string | null>(null);
  const [disciplineForm, setDisciplineForm] = useState({ name: '', description: '' });

  // Logo / cover upload (click the avatar or banner in the header)
  const logoFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  // Resource modal (per-discipline, used in details view)
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState({ title: '', description: '', type: 'GENERAL_FILE', visibility: 'STAFF_ONLY', resourceUrl: '' });
  const resourceFileRef = useRef<HTMLInputElement>(null);

  // Global resource ABM (used in resources library view)
  const globalResourceFileRef = useRef<HTMLInputElement>(null);
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourceSorting, setResourceSorting] = useState<SortingState>([]);
  const [globalResourceModalOpen, setGlobalResourceModalOpen] = useState(false);
  const [editingGlobalResourceId, setEditingGlobalResourceId] = useState<string | null>(null);
  const [globalResourceForm, setGlobalResourceForm] = useState({ disciplineId: '', title: '', description: '', type: 'GENERAL_FILE', visibility: 'STAFF_ONLY', resourceUrl: '' });

  // Classes ABM (scoped to the current discipline)
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [classForm, setClassForm] = useState({ name: '', companyId: '', capacity: '', status: 'ACTIVE', description: '' });

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

  const loadAllResources = async () => {
    setAllResourcesLoading(true);
    try {
      const res = await fetch('/api/disciplines/resources');
      setAllResources(res.ok ? await res.json() : []);
    } catch {
      setAllResources([]);
    } finally {
      setAllResourcesLoading(false);
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
      onSubTitleChange?.(data.name);
      const resResources = await fetch(`/api/disciplines/${id}/resources`);
      setResources(resResources.ok ? await resResources.json() : []);
    } catch {
      setError(t('disciplines.errorLoad'));
    }
  };

  useEffect(() => {
    void loadMeta();
    void loadCompanies();
  }, []);

  useEffect(() => {
    if (view === 'details' && activeTab === 'Classes' && selected?.id) void loadClasses(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeTab, selected?.id]);

  useEffect(() => {
    if (view === 'list') {
      void loadDisciplines();
      setSelected(null);
    } else if (view === 'details') {
      if (recordId) void loadDetails(recordId);
      else setView('Disciplines');
    } else if (view === 'resources') {
      void loadAllResources();
      void loadDisciplines();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, recordId]);

  const openDetails = (d: DisciplineItem) => {
    setSelected(d);
    setActiveTab('Overview');
    setView('DisciplineDetails', { id: d.id });
  };

  // ---- Discipline CRUD ------------------------------------------------------
  const openCreateDiscipline = () => {
    setEditingDisciplineId(null);
    setDisciplineForm({ name: '', description: '' });
    setDisciplineModalOpen(true);
  };

  const openEditDiscipline = (d: DisciplineItem) => {
    setEditingDisciplineId(d.id);
    setDisciplineForm({ name: d.name, description: d.description || '' });
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

  // Upload a logo (avatar) or cover (banner) image for the current discipline.
  const uploadDisciplineImage = async (kind: 'logo' | 'cover', file: File | undefined) => {
    if (!selected || !file) return;
    if (!userId) return setError(t('disciplines.errorAuthRequired'));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      fd.append('updatedById', userId);
      const res = await fetch(`/api/disciplines/${selected.id}/image`, { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('disciplines.errorSave'));
      }
      setSelected(await res.json());
    } catch (e: any) {
      setError(e.message || t('disciplines.errorSave'));
    }
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

  // ---- Global resources ABM (library view) ----------------------------------
  const openCreateGlobalResource = () => {
    setEditingGlobalResourceId(null);
    setGlobalResourceForm({ disciplineId: disciplines[0]?.id || '', title: '', description: '', type: typeOptions[0] || 'GENERAL_FILE', visibility: 'STAFF_ONLY', resourceUrl: '' });
    if (globalResourceFileRef.current) globalResourceFileRef.current.value = '';
    setGlobalResourceModalOpen(true);
  };

  const openEditGlobalResource = (r: ResourceItem) => {
    setEditingGlobalResourceId(r.id);
    setGlobalResourceForm({ disciplineId: r.disciplineId, title: r.title, description: r.description || '', type: r.type, visibility: r.visibility, resourceUrl: r.resourceUrl || '' });
    if (globalResourceFileRef.current) globalResourceFileRef.current.value = '';
    setGlobalResourceModalOpen(true);
  };

  const submitGlobalResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return setError(t('disciplines.errorAuthRequired'));
    if (!globalResourceForm.title.trim() || !globalResourceForm.disciplineId) return;
    try {
      const file = globalResourceFileRef.current?.files?.[0];
      let res: Response;
      if (editingGlobalResourceId) {
        res = await fetch(`/api/disciplines/${globalResourceForm.disciplineId}/resources/${editingGlobalResourceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...globalResourceForm, updatedById: userId })
        });
      } else if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', globalResourceForm.title);
        fd.append('description', globalResourceForm.description);
        fd.append('type', globalResourceForm.type);
        fd.append('visibility', globalResourceForm.visibility);
        fd.append('createdById', userId);
        res = await fetch(`/api/disciplines/${globalResourceForm.disciplineId}/resources/upload`, { method: 'POST', body: fd });
      } else {
        res = await fetch(`/api/disciplines/${globalResourceForm.disciplineId}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...globalResourceForm, createdById: userId, updatedById: userId })
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('disciplines.errorSave'));
      }
      setGlobalResourceModalOpen(false);
      await loadAllResources();
    } catch (e: any) {
      setError(e.message || t('disciplines.errorSave'));
    }
  };

  const deleteGlobalResource = async (r: ResourceItem) => {
    if (!confirm(t('disciplines.deleteConfirm'))) return;
    try {
      await fetch(`/api/disciplines/${r.disciplineId}/resources/${r.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updatedById: userId })
      });
      await loadAllResources();
    } catch {
      setError(t('disciplines.errorSave'));
    }
  };

  // ---- Classes ABM ----------------------------------------------------------
  const loadClasses = async (disciplineId: string) => {
    setClassesLoading(true);
    try {
      const res = await fetch(`/api/classes?disciplineId=${encodeURIComponent(disciplineId)}`);
      setClasses(res.ok ? await res.json() : []);
    } catch {
      setClasses([]);
    } finally {
      setClassesLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      const res = await fetch('/api/companies?status=Active');
      if (res.ok) setCompanies(await res.json());
    } catch {
      /* sede dropdown stays empty */
    }
  };

  const openCreateClass = () => {
    setEditingClassId(null);
    setClassForm({ name: '', companyId: companies[0]?.id || '', capacity: '', status: 'ACTIVE', description: '' });
    setClassModalOpen(true);
  };

  const openEditClass = (c: ClassRow) => {
    setEditingClassId(c.id);
    setClassForm({
      name: c.name || '',
      companyId: c.companyId || '',
      capacity: c.capacity != null ? String(c.capacity) : '',
      status: c.status || 'ACTIVE',
      description: ''
    });
    setClassModalOpen(true);
  };

  const submitClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!userId) return setError(t('classes.errorAuthRequired'));
    if (!classForm.name.trim()) return;
    if (!classForm.companyId) return setError(t('classes.errorSedeRequired'));
    try {
      // disciplineId is fixed to the current discipline. We intentionally omit
      // schedules/teacherIds/levels so existing relations are preserved on edit.
      const payload = {
        name: classForm.name.trim(),
        disciplineId: selected.id,
        companyId: classForm.companyId,
        capacity: classForm.capacity.trim() ? Number(classForm.capacity) : null,
        status: classForm.status,
        description: classForm.description.trim() || null,
        createdById: userId,
        updatedById: userId
      };
      const isEdit = Boolean(editingClassId);
      const res = await fetch(isEdit ? `/api/classes/${editingClassId}` : '/api/classes', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('classes.errorSave'));
      }
      setClassModalOpen(false);
      await loadClasses(selected.id);
    } catch (e: any) {
      setError(e.message || t('classes.errorSave'));
    }
  };

  const toggleClassStatus = async (c: ClassRow) => {
    if (!selected) return;
    try {
      await fetch(`/api/classes/${c.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
      });
      await loadClasses(selected.id);
    } catch {
      setError(t('classes.errorSave'));
    }
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
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-red-50 text-red-500">
                {d.imageUrl ? (
                  <img src={mediaUrl(d.imageUrl)} alt={d.name} className="h-full w-full object-cover" />
                ) : (
                  <Dumbbell className="size-4" />
                )}
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
        id: 'resources',
        accessorFn: (row) => row.resourceCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.resources')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.resourceCount ?? 0}</span>
      },
      {
        id: 'classCount',
        accessorFn: (row) => row.classCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.classes')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.classCount ?? 0}</span>
      },
      {
        id: 'studentCount',
        accessorFn: (row) => row.studentCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.students')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.studentCount ?? 0}</span>
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

  // ---- Resources library table -----------------------------------------------
  const filteredAllResources = useMemo(() => {
    const q = resourceSearch.trim().toLowerCase();
    if (!q) return allResources;
    return allResources.filter(
      (r) => r.title.toLowerCase().includes(q) || (r.disciplineName || '').toLowerCase().includes(q)
    );
  }, [allResources, resourceSearch]);

  const resourceColumns = useMemo<ColumnDef<ResourceItem & { disciplineName?: string; disciplineImageUrl?: string | null }>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (row) => row.title,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.resourceTitle')} />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-semibold text-foreground">{row.original.title}</p>
            {row.original.description && <p className="text-[11px] text-muted-foreground">{row.original.description}</p>}
          </div>
        )
      },
      {
        id: 'type',
        accessorFn: (row) => row.type,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.type')} />,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{labelize(row.original.type)}</span>
      },
      {
        id: 'visibility',
        accessorFn: (row) => row.visibility,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.visibility')} />,
        cell: ({ row }) => <span className="text-xs text-muted-foreground">{labelize(row.original.visibility)}</span>
      },
      {
        id: 'discipline',
        accessorFn: (row) => row.disciplineName || '—',
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('disciplines.discipline')} />,
        cell: ({ row }) => {
          const { disciplineName, disciplineImageUrl } = row.original;
          return (
            <div className="flex items-center gap-2">
              {disciplineImageUrl ? (
                <img src={mediaUrl(disciplineImageUrl)} alt={disciplineName || ''} className="size-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Dumbbell className="size-3.5 text-muted-foreground" />
                </div>
              )}
              <span className="text-sm text-muted-foreground">{disciplineName || '—'}</span>
            </div>
          );
        }
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
          const r = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {r.resourceUrl && (
                <a href={mediaUrl(r.resourceUrl)} target="_blank" rel="noreferrer">
                  <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" aria-label={t('disciplines.open')}>
                    <i className="fa-solid fa-up-right-from-square text-[11px]" />
                  </Button>
                </a>
              )}
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEditGlobalResource(r)} aria-label={t('disciplines.edit')}>
                <Pencil className="size-3.5" />
              </Button>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => deleteGlobalResource(r)} aria-label={t('disciplines.delete')}>
                <i className="fa-solid fa-trash text-[11px]" />
              </Button>
            </div>
          );
        }
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const resourceTable = useReactTable({
    data: filteredAllResources,
    columns: resourceColumns,
    state: { sorting: resourceSorting },
    onSortingChange: setResourceSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  // ---- Render ---------------------------------------------------------------
  const primaryBtn =
    'px-5 py-2.5 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2';
  const ghostBtn =
    'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all';

  if (view === 'resources') {
    return (
      <>
        {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <ListCard<ResourceItem & { disciplineName?: string }>
          title={t('disciplines.resourcesTitle')}
          description={t('disciplines.resourceLibraryDesc')}
          cardTitle={t('disciplines.resourcesTitle')}
          searchPlaceholder={t('disciplines.searchResourcesPlaceholder')}
          searchTerm={resourceSearch}
          onSearchChange={setResourceSearch}
          primaryLabel={t('disciplines.newResource')}
          onPrimary={openCreateGlobalResource}
          table={resourceTable}
          recordCount={filteredAllResources.length}
          isLoading={allResourcesLoading}
          emptyMessage={t('disciplines.noResources')}
        />

        {globalResourceModalOpen && (
          <Modal onClose={() => setGlobalResourceModalOpen(false)} title={editingGlobalResourceId ? t('disciplines.editResource') : t('disciplines.newResource')}>
            <form onSubmit={submitGlobalResource} className="space-y-4">
              <Field label={t('disciplines.discipline')}>
                <select className={inputClass} value={globalResourceForm.disciplineId} onChange={(e) => setGlobalResourceForm({ ...globalResourceForm, disciplineId: e.target.value })} required>
                  <option value="">—</option>
                  {disciplines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label={t('disciplines.resourceTitle')}>
                <input className={inputClass} value={globalResourceForm.title} onChange={(e) => setGlobalResourceForm({ ...globalResourceForm, title: e.target.value })} required />
              </Field>
              <Field label={t('disciplines.descriptionLabel')}>
                <textarea className={inputClass} rows={2} value={globalResourceForm.description} onChange={(e) => setGlobalResourceForm({ ...globalResourceForm, description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('disciplines.type')}>
                  <select className={inputClass} value={globalResourceForm.type} onChange={(e) => setGlobalResourceForm({ ...globalResourceForm, type: e.target.value })}>
                    {typeOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}
                  </select>
                </Field>
                <Field label={t('disciplines.visibility')}>
                  <select className={inputClass} value={globalResourceForm.visibility} onChange={(e) => setGlobalResourceForm({ ...globalResourceForm, visibility: e.target.value })}>
                    {visibilityOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}
                  </select>
                </Field>
              </div>
              <Field label={t('disciplines.url')}>
                <input className={inputClass} value={globalResourceForm.resourceUrl} onChange={(e) => setGlobalResourceForm({ ...globalResourceForm, resourceUrl: e.target.value })} placeholder="https://..." />
              </Field>
              {!editingGlobalResourceId && (
                <Field label={t('disciplines.uploadFile')}>
                  <input ref={globalResourceFileRef} type="file" className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase" />
                </Field>
              )}
              <ModalActions onCancel={() => setGlobalResourceModalOpen(false)} cancelLabel={t('disciplines.cancel')} saveLabel={t('disciplines.save')} />
            </form>
          </Modal>
        )}
      </>
    );
  }

  if (view === 'details') {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <ProfileHeader
          title={selected?.name || '—'}
          imageUrl={selected?.imageUrl || undefined}
          coverUrl={selected?.coverUrl || undefined}
          icon={<Dumbbell className="size-10" />}
          meta={[
            { icon: <FileText className="size-4" />, text: `${resources.length} ${t('disciplines.resources')}` },
            { text: selected?.active ? t('disciplines.active') : t('disciplines.inactive') }
          ]}
          tabs={[
            { id: 'Overview', label: t('disciplines.overview') },
            { id: 'Resources', label: t('disciplines.resources') },
            { id: 'Classes', label: t('classes.title') }
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as 'Overview' | 'Resources' | 'Classes')}
          onBack={() => setView('Disciplines')}
          onLogoClick={() => logoFileRef.current?.click()}
          onCoverClick={() => coverFileRef.current?.click()}
          actions={
            <Button type="button" variant="outline" onClick={() => selected && openEditDiscipline(selected)}>
              <Pencil className="size-3.5" /> {t('disciplines.edit')}
            </Button>
          }
        />

        {/* Hidden inputs driven by clicking the avatar (logo) / banner (cover). */}
        <input
          ref={logoFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void uploadDisciplineImage('logo', e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={coverFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void uploadDisciplineImage('cover', e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
        {activeTab === 'Overview' && selected && (
          <div className="space-y-4 px-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('disciplines.descriptionLabel')}</p>
              <p className="mt-1 text-sm text-slate-600">{selected.description || '—'}</p>
            </div>
            <div className="flex gap-6 pt-2">
              <div>
                <p className="text-2xl font-bold text-slate-900">{resources.length}</p>
                <p className="text-xs uppercase tracking-widest text-slate-400">{t('disciplines.resources')}</p>
              </div>
            </div>
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
                      <a href={mediaUrl(r.resourceUrl)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-500 hover:text-red-600">
                        <i className="fa-solid fa-up-right-from-square" /> {t('disciplines.open')}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Classes' && (
          <div className="px-1">
            <div className="mb-4 flex justify-end">
              <button onClick={openCreateClass} className={primaryBtn}>
                <i className="fa-solid fa-plus" /> {t('classes.newClass')}
              </button>
            </div>
            {classesLoading ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">…</p>
            ) : classes.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{t('classes.noClasses')}</p>
            ) : (
              <div className="space-y-2">
                {classes.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-border dark:bg-card">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
                      <CalendarDays className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-foreground">{c.name}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-slate-400">
                        <Building2 className="size-3" /> {c.companyName || '—'}
                        {typeof c.studentCount === 'number' && <span>· {c.studentCount} {t('classes.studentsCount')}</span>}
                        {fmtSchedules(c.schedules) && <span>· {fmtSchedules(c.schedules)}</span>}
                      </p>
                    </div>
                    <span className={cn('rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider', c.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground')}>
                      {c.status === 'ACTIVE' ? t('classes.active') : t('classes.inactive')}
                    </span>
                    <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => setView('ClassDetails', { id: c.id })} aria-label={t('classes.view')}>
                      <Eye className="size-3.5" />
                    </Button>
                    <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEditClass(c)} aria-label={t('classes.edit')}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      mode="icon"
                      size="sm"
                      variant="outline"
                      className={cn('size-8', c.status === 'ACTIVE' && 'text-destructive hover:bg-destructive/10')}
                      onClick={() => toggleClassStatus(c)}
                      aria-label={t('classes.status')}
                    >
                      {c.status === 'ACTIVE' ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </div>

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

        {/* Class modal (ABM scoped to this discipline) */}
        {classModalOpen && (
          <Modal onClose={() => setClassModalOpen(false)} title={editingClassId ? t('classes.editClass') : t('classes.newClass')}>
            <form onSubmit={submitClass} className="space-y-4">
              <Field label={t('classes.name')}>
                <input className={inputClass} value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('classes.sede')}>
                  <select className={inputClass} value={classForm.companyId} onChange={(e) => setClassForm({ ...classForm, companyId: e.target.value })} required>
                    <option value="">—</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label={t('classes.capacity')}>
                  <input type="number" min={0} className={inputClass} value={classForm.capacity} onChange={(e) => setClassForm({ ...classForm, capacity: e.target.value })} />
                </Field>
              </div>
              <Field label={t('classes.status')}>
                <select className={inputClass} value={classForm.status} onChange={(e) => setClassForm({ ...classForm, status: e.target.value })}>
                  <option value="ACTIVE">{t('classes.active')}</option>
                  <option value="INACTIVE">{t('classes.inactive')}</option>
                </select>
              </Field>
              <Field label={t('classes.description2')}>
                <textarea className={inputClass} rows={2} value={classForm.description} onChange={(e) => setClassForm({ ...classForm, description: e.target.value })} />
              </Field>
              {editingClassId && (
                <p className="text-[11px] text-slate-400">{t('disciplines.classAdvancedHint')}</p>
              )}
              <ModalActions onCancel={() => setClassModalOpen(false)} cancelLabel={t('classes.cancel')} saveLabel={t('classes.save')} />
            </form>
          </Modal>
        )}

        {/* Discipline edit modal (available from the detail view too) */}
        {disciplineModalOpen && (
          <Modal onClose={() => setDisciplineModalOpen(false)} title={editingDisciplineId ? t('disciplines.editDiscipline') : t('disciplines.newDiscipline')}>
            <form onSubmit={submitDiscipline} className="space-y-4">
              <Field label={t('disciplines.name')}>
                <input className={inputClass} value={disciplineForm.name} onChange={(e) => setDisciplineForm({ ...disciplineForm, name: e.target.value })} required />
              </Field>
              <Field label={t('disciplines.descriptionLabel')}>
                <textarea className={inputClass} rows={3} value={disciplineForm.description} onChange={(e) => setDisciplineForm({ ...disciplineForm, description: e.target.value })} />
              </Field>
              <ModalActions onCancel={() => setDisciplineModalOpen(false)} cancelLabel={t('disciplines.cancel')} saveLabel={t('disciplines.save')} />
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
