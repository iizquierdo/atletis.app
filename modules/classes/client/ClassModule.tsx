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
import { Building2, CalendarDays, Check, ChevronDown, Eye, Layers, Pencil, Power, PowerOff, Trash2, Upload, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import { cn } from '@webapp/lib/utils';
import ListCard from '@webapp/components/shared/ListCard';
import ProfileHeader from '@webapp/components/shared/ProfileHeader';
import ImportModal from '@webapp/components/shared/ImportModal';

type ClassView = 'list' | 'details';

interface Props {
  view: ClassView;
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

interface ClassTeacherSummary { id: string; name: string; avatar?: string | null }

interface ClassRow {
  id: string; code?: string | null; name: string; disciplineId: string; disciplineName?: string | null;
  companyId: string; companyName?: string | null; capacity?: number | null; status: string;
  teachers?: ClassTeacherSummary[]; scheduleCount?: number; studentCount?: number;
  imageUrl?: string | null; coverUrl?: string | null;
}

interface ScheduleForm { dayOfWeek: number; startTime: string; endTime: string; location: string }
interface LevelForm { id?: string; name: string; levelOrder: number }
interface AvailableStudent { id: string; code: string; firstName: string; lastName: string }
interface ClassCommunityRow { id: string; name: string; description?: string | null; imageUrl?: string | null; active: boolean; memberCount: number }

interface ResourceItem {
  id: string;
  title: string;
  description?: string | null;
  type: string;
  visibility: string;
  resourceUrl?: string | null;
}

const RESOURCE_TYPES = ['PEDAGOGICAL_MATERIAL', 'EXERCISE_VIDEO', 'TOOLS', 'WORK_GUIDELINES', 'GENERAL_FILE'];
const VISIBILITIES = ['ADMIN_ONLY', 'STAFF_ONLY', 'MEMBERS_ONLY', 'PUBLIC'];

const labelize = (raw: string) =>
  String(raw || '')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';

const emptyForm = {
  name: '', description: '', disciplineId: '', companyId: '', capacity: '', status: 'ACTIVE',
  schedules: [] as ScheduleForm[],
  teacherIds: [] as string[],
  levels: [] as LevelForm[]
};

const ClassModule: React.FC<Props> = ({ view, setView, currentUser, companyId, onSubTitleChange, recordId }) => {
  const { t } = useTranslation();
  const userId = currentUser?.id || '';

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const [meta, setMeta] = useState<{ statuses: MetaItem[]; staff: StaffItem[]; disciplines: DisciplineItem[]; resourceTypes: MetaItem[]; visibilities: MetaItem[] }>({ statuses: [], staff: [], disciplines: [], resourceTypes: [], visibilities: [] });
  const [companies, setCompanies] = useState<CompanyItem[]>([]);

  const [selected, setSelected] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Levels' | 'Teachers' | 'Schedule' | 'Students' | 'Attendance' | 'Communities' | 'Resources'>('Overview');

  // Resources tab
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceForm, setResourceForm] = useState({ title: '', description: '', type: 'GENERAL_FILE', visibility: 'STAFF_ONLY', resourceUrl: '' });
  const resourceFileRef = useRef<HTMLInputElement>(null);

  // Image upload
  const logoFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const uploadClassImage = async (kind: 'logo' | 'cover', file: File | undefined) => {
    if (!selected || !file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(`/api/classes/${selected.id}/image`, { method: 'POST', body: fd });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('classes.errorSave')); }
      setSelected(await res.json());
    } catch (err: any) { setError(err.message || t('classes.errorSave')); }
  };

  // Communities tab
  const [classCommunities, setClassCommunities] = useState<ClassCommunityRow[]>([]);
  const [commLoading, setCommLoading] = useState(false);
  const [commCreating, setCommCreating] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  // Student enrollment (details → Students tab)
  const [available, setAvailable] = useState<AvailableStudent[]>([]);
  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [enrollLevelId, setEnrollLevelId] = useState('');

  // Schedule inline ABM (details → Schedule tab)
  const [scheduleEditing, setScheduleEditing] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleForm[]>([]);
  const [scheduleSaving, setScheduleSaving] = useState(false);

  // Attendance (details → Attendance tab)
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceToggling, setAttendanceToggling] = useState<Set<string>>(new Set());

  // Level ABM (details → Levels tab)
  const emptyLevelForm = { id: '', name: '', description: '', color: '#6366f1', levelOrder: 0, active: true, imageUrl: '' };
  const [levelModalOpen, setLevelModalOpen] = useState(false);
  const [levelForm, setLevelForm] = useState({ ...emptyLevelForm });
  const [levelSaving, setLevelSaving] = useState(false);
  const [levelImageFile, setLevelImageFile] = useState<File | null>(null);
  const [levelImagePreview, setLevelImagePreview] = useState<string>('');

  const dayLabel = (d: number) => t(`classes.days.${d}`, { defaultValue: String(d) });
  const teacherName = (id: string) => meta.staff.find((s) => s.id === id)?.name || id;
  const typeOptions = useMemo(() => (meta.resourceTypes.length ? meta.resourceTypes.map((x) => x.name) : RESOURCE_TYPES), [meta.resourceTypes]);
  const visibilityOptions = useMemo(() => (meta.visibilities.length ? meta.visibilities.map((x) => x.name) : VISIBILITIES), [meta.visibilities]);

  const loadClasses = async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (companyId) qs.set('companyId', companyId);
      const res = await fetch(`/api/classes?${qs.toString()}`);
      if (!res.ok) throw new Error();
      setClasses(await res.json());
    } catch { setError(t('classes.errorLoad')); } finally { setLoading(false); }
  };

  const loadMeta = async () => {
    try {
      const res = await fetch('/api/classes/meta');
      if (res.ok) {
        const data = await res.json();
        setMeta({
          statuses: data.categories?.statuses || [],
          staff: data.staff || [],
          disciplines: data.disciplines || [],
          resourceTypes: data.categories?.resourceTypes || [],
          visibilities: data.categories?.visibilities || []
        });
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
      const res = await fetch(`/api/classes/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(data);
      onSubTitleChange?.(data.name);
    } catch { setError(t('classes.errorLoad')); }
  };

  const loadAvailable = async (id: string) => {
    try {
      const res = await fetch(`/api/classes/${id}/available-students`);
      if (res.ok) setAvailable(await res.json()); else setAvailable([]);
    } catch { setAvailable([]); }
  };

  const loadClassResources = async (id: string) => {
    try {
      const res = await fetch(`/api/classes/${id}/resources`);
      setResources(res.ok ? await res.json() : []);
    } catch {
      setResources([]);
    }
  };

  useEffect(() => { void loadMeta(); }, []);
  useEffect(() => {
    if (view === 'list') { void loadClasses(); setSelected(null); }
    else if (recordId) { void loadDetails(recordId); }
    else { setView('Classes'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, companyId, recordId]);

  const loadClassCommunities = async (id: string) => {
    setCommLoading(true);
    try {
      const res = await fetch(`/api/classes/${id}/communities`);
      if (res.ok) setClassCommunities(await res.json()); else setClassCommunities([]);
    } catch { setClassCommunities([]); } finally { setCommLoading(false); }
  };

  const createClassCommunity = async () => {
    if (!selected?.id || commCreating) return;
    setCommCreating(true);
    try {
      const res = await fetch(`/api/classes/${selected.id}/communities`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (res.ok) {
        const comm = await res.json();
        setClassCommunities((prev) => [...prev, comm]);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'No se pudo crear la comunidad.');
      }
    } catch { alert('Error de red.'); } finally { setCommCreating(false); }
  };

  useEffect(() => {
    if (view === 'details' && activeTab === 'Students' && selected?.id) void loadAvailable(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeTab, selected?.id]);

  useEffect(() => {
    if (view === 'details' && activeTab === 'Communities' && selected?.id) void loadClassCommunities(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeTab, selected?.id]);

  useEffect(() => {
    if (view === 'details' && activeTab === 'Resources' && selected?.id) void loadClassResources(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeTab, selected?.id]);

  useEffect(() => {
    if (activeTab !== 'Attendance' || !selected?.id) return;
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const from = fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 15));
    const to = fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15));
    setAttendanceLoading(true);
    fetch(`/api/classes/${selected.id}/attendance?from=${from}&to=${to}`)
      .then((r) => r.json()).then((rows: { studentId: string; date: string; present: boolean }[]) => {
        const map: Record<string, boolean> = {};
        rows.forEach((r) => { map[`${r.studentId}_${r.date}`] = r.present; });
        setAttendance(map);
      }).catch(() => {}).finally(() => setAttendanceLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selected?.id]);

  const attendanceDates = useMemo(() => {
    if (!selected?.schedules) return [];
    const classDays = new Set((selected.schedules as any[]).map((s: any) => Number(s.dayOfWeek)));
    if (classDays.size === 0) return [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const result: { date: Date; key: string }[] = [];
    for (let i = -15; i <= 15; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      if (classDays.has(d.getDay())) result.push({ date: d, key: d.toISOString().slice(0, 10) });
    }
    return result;
  }, [selected?.schedules]);

  const toggleAttendance = async (studentId: string, dateKey: string) => {
    const k = `${studentId}_${dateKey}`;
    const next = attendance[k] !== true;
    setAttendance((prev) => ({ ...prev, [k]: next }));
    setAttendanceToggling((prev) => new Set(prev).add(k));
    try {
      await fetch(`/api/classes/${selected!.id}/attendance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, date: dateKey, present: next })
      });
    } catch { setAttendance((prev) => ({ ...prev, [k]: !next })); }
    finally { setAttendanceToggling((prev) => { const s = new Set(prev); s.delete(k); return s; }); }
  };

  const openDetails = (c: ClassRow) => { setActiveTab('Overview'); setView('ClassDetails', { id: c.id }); };

  const classImportColumns = [
    { key: 'name', header: 'Nombre', required: true, example: 'Natación Avanzada' },
    { key: 'description', header: 'Descripción', example: 'Clase para nadadores avanzados' },
    { key: 'disciplineName', header: 'Disciplina', required: true, example: 'Natación' },
    { key: 'companyName', header: 'Sede', required: true, example: 'Sede Central' },
    { key: 'capacity', header: 'Capacidad', example: '20' },
  ];

  const handleClassImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    const errors: { row: number; message: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      if (!row.name) { errors.push({ row: rowNum, message: 'Nombre es requerido' }); continue; }
      const discipline = row.disciplineName
        ? meta.disciplines.find((d) => d.name.toLowerCase() === row.disciplineName.toLowerCase())
        : null;
      if (!discipline) { errors.push({ row: rowNum, message: `Disciplina "${row.disciplineName}" no encontrada` }); continue; }
      const company = row.companyName
        ? companies.find((c) => c.name.toLowerCase() === row.companyName.toLowerCase())
        : companies[0];
      if (!company) { errors.push({ row: rowNum, message: `Sede "${row.companyName}" no encontrada` }); continue; }
      try {
        const res = await fetch('/api/classes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name, description: row.description || '',
            disciplineId: discipline.id, companyId: company.id,
            capacity: row.capacity ? Number(row.capacity) : null,
            status: 'ACTIVE', schedules: [], teacherIds: [], levels: [],
          }),
        });
        if (!res.ok) { const b = await res.json().catch(() => ({})); errors.push({ row: rowNum, message: b?.error || 'Error al crear' }); }
        else success++;
      } catch { errors.push({ row: rowNum, message: 'Error de conexión' }); }
    }
    if (success > 0) await loadClasses();
    return { success, errors };
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, companyId: companyId || companies[0]?.id || '' });
    setModalOpen(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      ...emptyForm,
      name: c.name || '', description: c.description || '', disciplineId: c.disciplineId || '',
      companyId: c.companyId || '', capacity: c.capacity != null ? String(c.capacity) : '', status: c.status || 'ACTIVE',
      schedules: (c.schedules || []).map((s: any) => ({ dayOfWeek: Number(s.dayOfWeek), startTime: s.startTime || '', endTime: s.endTime || '', location: s.location || '' })),
      teacherIds: (c.teachers || []).map((x: any) => x.teacherId).filter(Boolean),
      levels: (c.ownLevels || []).map((l: any) => ({ id: l.id, name: l.name, levelOrder: Number(l.levelOrder) || 0 }))
    });
    setModalOpen(true);
  };

  const submitClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return setError(t('classes.errorAuthRequired'));
    if (!form.name.trim()) return;
    if (!form.disciplineId) return setError(t('classes.errorDisciplineRequired'));
    if (!form.companyId) return setError(t('classes.errorSedeRequired'));
    try {
      const payload = {
        ...form,
        capacity: form.capacity.trim() ? Number(form.capacity) : null,
        schedules: form.schedules.filter((s) => Number.isFinite(s.dayOfWeek) && s.startTime && s.endTime),
        levels: form.levels.filter((l) => l.name.trim())
      };
      const isEdit = Boolean(editingId);
      const res = await fetch(isEdit ? `/api/classes/${editingId}` : '/api/classes', {
        method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('classes.errorSave')); }
      setModalOpen(false);
      if (view === 'list') await loadClasses(); else if (editingId) await loadDetails(editingId);
    } catch (e: any) { setError(e.message || t('classes.errorSave')); }
  };

  const toggleStatus = async (c: ClassRow) => {
    await fetch(`/api/classes/${c.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) });
    await loadClasses();
  };

  const openLevelCreate = () => {
    const nextOrder = Math.max(0, ...((selected?.ownLevels || []) as any[]).map((l: any) => Number(l.levelOrder ?? 0))) + 1;
    setLevelForm({ ...emptyLevelForm, levelOrder: nextOrder });
    setLevelImageFile(null);
    setLevelImagePreview('');
    setLevelModalOpen(true);
  };

  const openLevelEdit = (l: any) => {
    setLevelForm({ id: l.id, name: l.name || '', description: l.description || '', color: l.color || '#6366f1', levelOrder: l.levelOrder ?? 0, active: l.active !== false, imageUrl: l.imageUrl || '' });
    setLevelImageFile(null);
    setLevelImagePreview(l.imageUrl || '');
    setLevelModalOpen(true);
  };

  const submitLevel = async () => {
    if (!selected || !levelForm.name.trim()) return;
    setLevelSaving(true);
    try {
      const isEdit = Boolean(levelForm.id);
      const url = isEdit ? `/api/classes/${selected.id}/levels/${levelForm.id}` : `/api/classes/${selected.id}/levels`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: levelForm.name, description: levelForm.description || null, color: levelForm.color || null, levelOrder: levelForm.levelOrder, active: levelForm.active })
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('classes.errorSave')); }
      const saved = await res.json();
      if (levelImageFile) {
        const fd = new FormData();
        fd.append('file', levelImageFile);
        await fetch(`/api/classes/${selected.id}/levels/${saved.id}/image`, { method: 'POST', body: fd });
      }
      setLevelModalOpen(false);
      await loadDetails(selected.id);
    } catch (e: any) { setError(e.message || t('classes.errorSave')); }
    finally { setLevelSaving(false); }
  };

  const deleteLevel = async (levelId: string) => {
    if (!selected) return;
    try {
      await fetch(`/api/classes/${selected.id}/levels/${levelId}`, { method: 'DELETE' });
      await loadDetails(selected.id);
    } catch { /* ignore */ }
  };

  const openScheduleEdit = () => {
    setScheduleDraft((selected?.schedules || []).map((s: any) => ({
      dayOfWeek: Number(s.dayOfWeek), startTime: s.startTime || '', endTime: s.endTime || '', location: s.location || ''
    })));
    setScheduleEditing(true);
  };

  const saveSchedules = async () => {
    if (!selected) return;
    setScheduleSaving(true);
    try {
      const res = await fetch(`/api/classes/${selected.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedules: scheduleDraft.filter((s) => Number.isFinite(s.dayOfWeek) && s.startTime && s.endTime) })
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('classes.errorSave')); }
      setScheduleEditing(false);
      await loadDetails(selected.id);
    } catch (e: any) { setError(e.message || t('classes.errorSave')); }
    finally { setScheduleSaving(false); }
  };

  const enrollStudent = async () => {
    if (!selected || !enrollStudentId) return;
    try {
      const res = await fetch(`/api/classes/${selected.id}/students`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: enrollStudentId, levelId: enrollLevelId || null })
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('classes.errorSave')); }
      setEnrollStudentId(''); setEnrollLevelId('');
      await loadDetails(selected.id); await loadAvailable(selected.id);
    } catch (e: any) { setError(e.message || t('classes.errorSave')); }
  };

  const removeStudent = async (studentId: string) => {
    if (!selected) return;
    await fetch(`/api/classes/${selected.id}/students/${studentId}`, { method: 'DELETE' });
    await loadDetails(selected.id); await loadAvailable(selected.id);
  };

  const openCreateResource = () => {
    setResourceForm({ title: '', description: '', type: typeOptions[0] || 'GENERAL_FILE', visibility: 'STAFF_ONLY', resourceUrl: '' });
    if (resourceFileRef.current) resourceFileRef.current.value = '';
    setResourceModalOpen(true);
  };

  const submitResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!userId) return setError(t('classes.errorAuthRequired'));
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
        res = await fetch(`/api/classes/${selected.id}/resources/upload`, { method: 'POST', body: fd });
      } else {
        res = await fetch(`/api/classes/${selected.id}/resources`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...resourceForm, createdById: userId, updatedById: userId })
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || t('classes.errorSave'));
      }
      setResourceModalOpen(false);
      await loadClassResources(selected.id);
    } catch (e: any) {
      setError(e.message || t('classes.errorSave'));
    }
  };

  const deleteResource = async (r: ResourceItem) => {
    if (!selected) return;
    if (!confirm(t('classes.deleteConfirm'))) return;
    await fetch(`/api/classes/${selected.id}/resources/${r.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedById: userId })
    });
    await loadClassResources(selected.id);
  };

  const statusOptions = useMemo(() => (meta.statuses.length ? meta.statuses.map((x) => x.name) : ['ACTIVE', 'INACTIVE', 'ARCHIVED']), [meta.statuses]);
  const selectedDiscipline = useMemo(() => meta.disciplines.find((d) => d.id === form.disciplineId), [meta.disciplines, form.disciplineId]);
  const teacherOptions = useMemo(() => meta.staff, [meta.staff]);

  const toggleInArray = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  // Level options for student enrollment = inherited (discipline) + own (class).
  const enrollLevelOptions = useMemo(() => {
    if (!selected) return [] as { id: string; name: string; inherited?: boolean }[];
    const inherited = (selected.inheritedLevels || []).map((l: any) => ({ id: l.id, name: l.name, inherited: true }));
    const own = (selected.ownLevels || []).map((l: any) => ({ id: l.id, name: l.name }));
    return [...inherited, ...own];
  }, [selected]);

  // ---- List table -----------------------------------------------------------
  const [sorting, setSorting] = useState<SortingState>([]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.disciplineName || '').toLowerCase().includes(q) ||
        (c.companyName || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q)
    );
  }, [classes, search]);

  const columns = useMemo<ColumnDef<ClassRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('classes.name')} />,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-3">
              {c.imageUrl
                ? <img src={c.imageUrl} alt={c.name} className="h-9 w-9 flex-shrink-0 rounded-xl object-cover" />
                : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500"><CalendarDays className="size-4" /></div>
              }
              <div>
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{c.disciplineName || '—'}</p>
              </div>
            </div>
          );
        }
      },
      {
        id: 'sede',
        accessorFn: (row) => row.companyName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('classes.sede')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.companyName || '—'}</span>
      },
      {
        id: 'teachers',
        accessorFn: (row) => (row.teachers || []).length,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('classes.teachersCount')} />,
        cell: ({ row }) => {
          const teachers = row.original.teachers || [];
          if (teachers.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
          const visible = teachers.slice(0, 4);
          const extra = teachers.length - visible.length;
          return (
            <div className="flex items-center -space-x-2">
              {visible.map((t) => (
                <div key={t.id} title={t.name} className="size-7 shrink-0 rounded-full ring-2 ring-background overflow-hidden bg-slate-100 flex items-center justify-center">
                  {t.avatar
                    ? <img src={t.avatar} alt={t.name} className="size-full object-cover" />
                    : <span className="text-[10px] font-semibold text-slate-500 uppercase leading-none">{t.name.charAt(0)}</span>}
                </div>
              ))}
              {extra > 0 && (
                <div className="size-7 shrink-0 rounded-full ring-2 ring-background bg-slate-200 flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-slate-600">+{extra}</span>
                </div>
              )}
            </div>
          );
        }
      },
      {
        id: 'students',
        accessorFn: (row) => row.studentCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('classes.studentsCount')} />,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <span className="text-sm text-muted-foreground">
              {c.studentCount ?? 0}{c.capacity != null ? `/${c.capacity}` : ''}
            </span>
          );
        }
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('classes.status')} />,
        cell: ({ row }) => (
          <span className={cn('rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider', row.original.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground')}>
            {row.original.status === 'ACTIVE' ? t('classes.active') : t('classes.inactive')}
          </span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">{t('classes.actions')}</span>
        ),
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openDetails(c)} aria-label={t('classes.view')}>
                <Eye className="size-3.5" />
              </Button>
              <Button type="button" mode="icon" size="sm" variant="outline" className={cn('size-8', c.status === 'ACTIVE' && 'text-destructive hover:bg-destructive/10')} onClick={() => toggleStatus(c)} aria-label={t('classes.status')}>
                {c.status === 'ACTIVE' ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
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

  // ---------------------------------------------------------------- details --
  if (view === 'details') {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadClassImage('logo', e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={coverFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadClassImage('cover', e.target.files?.[0]); e.target.value = ''; }} />

        <ProfileHeader
          title={selected ? selected.name : '—'}
          initials={selected ? (selected.name?.charAt(0) || '?').toUpperCase() : '?'}
          imageUrl={selected?.imageUrl}
          coverUrl={selected?.coverUrl}
          onLogoClick={() => logoFileRef.current?.click()}
          onCoverClick={() => coverFileRef.current?.click()}
          meta={[
            { icon: <Layers className="size-4" />, text: selected?.disciplineName || '—' },
            { icon: <Building2 className="size-4" />, text: selected?.companyName || '—' },
            { text: selected?.status === 'ACTIVE' ? t('classes.active') : t('classes.inactive') }
          ]}
          tabs={[
            { id: 'Overview', label: t('classes.overview') },
            { id: 'Levels', label: t('classes.levels') },
            { id: 'Teachers', label: t('classes.teachers') },
            { id: 'Schedule', label: t('classes.schedule') },
            { id: 'Students', label: t('classes.students') },
            { id: 'Attendance', label: 'Asistencia' },
            { id: 'Communities', label: 'Comunidades' },
            { id: 'Resources', label: t('classes.resources') }
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as typeof activeTab)}
          onBack={() => setView('Classes')}
          actions={
            <Button type="button" variant="outline" onClick={() => selected && openEdit(selected)}>
              <Pencil className="size-3.5" /> {t('classes.edit')}
            </Button>
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
          {activeTab === 'Overview' && selected && (
            <div className="grid gap-4 px-1 sm:grid-cols-2 lg:grid-cols-3">
              <Info label={t('classes.discipline')} value={selected.disciplineName} />
              <Info label={t('classes.sede')} value={selected.companyName} />
              <Info label={t('classes.capacity')} value={selected.capacity != null ? String(selected.capacity) : null} />
              <Info label={t('classes.status')} value={selected.status === 'ACTIVE' ? t('classes.active') : t('classes.inactive')} />
              <Info label="Código" value={selected.code} />
              <div className="sm:col-span-2 lg:col-span-3"><Info label={t('classes.description2')} value={selected.description} /></div>
            </div>
          )}

          {activeTab === 'Levels' && selected && (
            <div className="px-1 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('classes.levels')}</span>
                <button type="button" onClick={openLevelCreate}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors">
                  <i className="fa-solid fa-plus text-[10px]" />{t('classes.addLevel', { defaultValue: 'Agregar nivel' })}
                </button>
              </div>

              {(selected.ownLevels || []).length === 0
                ? <Empty text={t('classes.none')} />
                : <div className="grid gap-3 sm:grid-cols-2">
                    {(selected.ownLevels as any[]).map((l: any) => (
                      <div key={l.id} className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        {/* Color bar */}
                        <div className="w-1.5 self-stretch shrink-0 rounded-l-xl" style={{ backgroundColor: l.color || '#e2e8f0' }} />
                        {/* Logo */}
                        <div className="size-12 shrink-0 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center my-3">
                          {l.imageUrl
                            ? <img src={l.imageUrl} alt={l.name} className="size-full object-cover" />
                            : <span className="text-lg font-bold text-slate-300">{(l.name || '?').charAt(0).toUpperCase()}</span>}
                        </div>
                        {/* Info */}
                        <div className="min-w-0 flex-1 py-3 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800 truncate">{l.name}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${l.active !== false ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                              {l.active !== false ? t('classes.active') : t('classes.inactive')}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">#{l.levelOrder}</span>
                          </div>
                          {l.description && <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{l.description}</p>}
                        </div>
                        {/* Actions */}
                        <div className="flex flex-col gap-1 pr-3 py-3 shrink-0">
                          <button type="button" onClick={() => openLevelEdit(l)}
                            className="flex size-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                            <Pencil className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => deleteLevel(l.id)}
                            className="flex size-7 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>}

              {/* Level modal */}
              {levelModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                      <h2 className="text-base font-bold text-slate-800">
                        {levelForm.id ? t('classes.editLevel', { defaultValue: 'Editar nivel' }) : t('classes.addLevel', { defaultValue: 'Agregar nivel' })}
                      </h2>
                      <button type="button" onClick={() => setLevelModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="size-4" /></button>
                    </div>
                    <div className="space-y-4 px-6 py-5">
                      {/* Nombre */}
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">{t('classes.levelName', { defaultValue: 'Nombre' })} *</label>
                        <input className={inputClass} value={levelForm.name} onChange={(e) => setLevelForm({ ...levelForm, name: e.target.value })} placeholder="Ej: Principiante" />
                      </div>
                      {/* Descripción */}
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">{t('classes.description', { defaultValue: 'Descripción' })}</label>
                        <textarea className={inputClass} rows={2} value={levelForm.description} onChange={(e) => setLevelForm({ ...levelForm, description: e.target.value })} placeholder="Descripción del nivel..." />
                      </div>
                      {/* Color + Orden */}
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="mb-1 block text-xs font-semibold text-slate-600">{t('classes.color', { defaultValue: 'Color' })}</label>
                          <div className="flex items-center gap-2">
                            <input type="color" value={levelForm.color} onChange={(e) => setLevelForm({ ...levelForm, color: e.target.value })}
                              className="size-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5" />
                            <input className={inputClass} value={levelForm.color} onChange={(e) => setLevelForm({ ...levelForm, color: e.target.value })} placeholder="#6366f1" />
                          </div>
                        </div>
                        <div className="w-24">
                          <label className="mb-1 block text-xs font-semibold text-slate-600">{t('classes.levelOrder', { defaultValue: 'Orden' })}</label>
                          <input type="number" min={0} className={inputClass} value={levelForm.levelOrder}
                            onChange={(e) => setLevelForm({ ...levelForm, levelOrder: Number(e.target.value) })} />
                        </div>
                      </div>
                      {/* Foto */}
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600">{t('classes.levelImage', { defaultValue: 'Foto / Logo' })}</label>
                        <div className="flex items-center gap-3">
                          <div className="size-16 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
                            {levelImagePreview
                              ? <img src={levelImagePreview} alt="" className="size-full object-cover" />
                              : <span className="text-2xl font-bold text-slate-200">{(levelForm.name || '?').charAt(0).toUpperCase()}</span>}
                          </div>
                          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm text-slate-500 hover:border-primary hover:text-primary transition-colors">
                            <i className="fa-solid fa-upload text-xs" />
                            {levelImageFile ? levelImageFile.name : t('classes.uploadImage', { defaultValue: 'Subir imagen' })}
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setLevelImageFile(f);
                              if (f) { const r = new FileReader(); r.onload = (ev) => setLevelImagePreview(String(ev.target?.result || '')); r.readAsDataURL(f); }
                              else setLevelImagePreview(levelForm.imageUrl);
                            }} />
                          </label>
                        </div>
                      </div>
                      {/* Estado */}
                      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <span className="text-sm font-medium text-slate-700">{t('classes.active')}</span>
                        <button type="button"
                          onClick={() => setLevelForm({ ...levelForm, active: !levelForm.active })}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${levelForm.active ? 'bg-primary' : 'bg-slate-200'}`}>
                          <span className={`inline-block size-5 transform rounded-full bg-white shadow transition-transform ${levelForm.active ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                      <button type="button" disabled={levelSaving} onClick={() => setLevelModalOpen(false)}
                        className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                        {t('classes.cancel', { defaultValue: 'Cancelar' })}
                      </button>
                      <button type="button" disabled={levelSaving || !levelForm.name.trim()} onClick={submitLevel}
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60">
                        {levelSaving && <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                        {t('classes.save', { defaultValue: 'Guardar' })}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Teachers' && selected && (
            <div className="px-1">
              {(selected.teachers || []).length === 0 ? <Empty text={t('classes.none')} /> : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(selected.teachers as any[]).map((x) => (
                    <div key={x.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="size-11 shrink-0 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center ring-2 ring-slate-100">
                        {x.teacherAvatar
                          ? <img src={x.teacherAvatar} alt={x.teacherName} className="size-full object-cover" />
                          : <span className="text-sm font-bold text-slate-400 uppercase">{(x.teacherName || '?').charAt(0)}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{x.teacherName}</p>
                        {x.teacherEmail && (
                          <a href={`mailto:${x.teacherEmail}`} className="flex items-center gap-1 truncate text-xs text-slate-500 hover:text-primary transition-colors">
                            <svg className="size-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="2"/><path d="M1 5l7 5 7-5"/></svg>
                            {x.teacherEmail}
                          </a>
                        )}
                        {x.teacherPhone && (
                          <a href={`tel:${x.teacherPhone}`} className="flex items-center gap-1 truncate text-xs text-slate-500 hover:text-primary transition-colors">
                            <svg className="size-3 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 2h3l1.5 3.5-1.8 1.1a9 9 0 004.7 4.7l1.1-1.8L15 11v3a1 1 0 01-1 1C5.2 15 1 10.8 1 3a1 1 0 011-1z"/></svg>
                            {x.teacherPhone}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'Schedule' && selected && (
            <div className="px-1 space-y-3">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('classes.schedule')}</span>
                {!scheduleEditing && (
                  <button type="button" onClick={openScheduleEdit}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 transition-colors">
                    <Pencil className="size-3" />{t('classes.editSchedule', { defaultValue: 'Editar horarios' })}
                  </button>
                )}
              </div>

              {/* Read mode */}
              {!scheduleEditing && (
                (selected.schedules || []).length === 0
                  ? <Empty text={t('classes.none')} />
                  : <div className="grid gap-2 sm:grid-cols-2">
                      {(selected.schedules as any[]).map((s: any, i: number) => (
                        <div key={s.id ?? i} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <span className="text-sm font-semibold text-slate-900">{dayLabel(Number(s.dayOfWeek))}</span>
                          <span className="text-sm text-slate-600">{s.startTime} – {s.endTime}{s.location ? ` · ${s.location}` : ''}</span>
                        </div>
                      ))}
                    </div>
              )}

              {/* Edit mode */}
              {scheduleEditing && (
                <div className="space-y-2">
                  {scheduleDraft.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-4 text-center text-sm text-slate-400">
                      {t('classes.none')}
                    </p>
                  )}
                  {scheduleDraft.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
                      <select
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        value={s.dayOfWeek}
                        onChange={(e) => { const d = [...scheduleDraft]; d[i] = { ...d[i], dayOfWeek: Number(e.target.value) }; setScheduleDraft(d); }}>
                        {[1,2,3,4,5,6,0].map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                      </select>
                      <div className="flex items-center gap-1.5">
                        <input type="time" value={s.startTime}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          onChange={(e) => { const d = [...scheduleDraft]; d[i] = { ...d[i], startTime: e.target.value }; setScheduleDraft(d); }} />
                        <span className="text-slate-400">–</span>
                        <input type="time" value={s.endTime}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          onChange={(e) => { const d = [...scheduleDraft]; d[i] = { ...d[i], endTime: e.target.value }; setScheduleDraft(d); }} />
                      </div>
                      <input
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        placeholder={t('classes.location', { defaultValue: 'Lugar (opcional)' })}
                        value={s.location}
                        onChange={(e) => { const d = [...scheduleDraft]; d[i] = { ...d[i], location: e.target.value }; setScheduleDraft(d); }} />
                      <button type="button"
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        onClick={() => setScheduleDraft(scheduleDraft.filter((_, idx) => idx !== i))}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}

                  {/* Add row */}
                  <button type="button"
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-500 hover:border-primary hover:text-primary transition-colors"
                    onClick={() => setScheduleDraft([...scheduleDraft, { dayOfWeek: 1, startTime: '', endTime: '', location: '' }])}>
                    <i className="fa-solid fa-plus text-xs" />{t('classes.addSchedule')}
                  </button>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-1">
                    <button type="button" disabled={scheduleSaving}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                      onClick={() => setScheduleEditing(false)}>
                      {t('classes.cancel', { defaultValue: 'Cancelar' })}
                    </button>
                    <button type="button" disabled={scheduleSaving}
                      className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
                      onClick={saveSchedules}>
                      {scheduleSaving && <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                      {t('classes.save', { defaultValue: 'Guardar' })}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Students' && selected && (
            <div className="px-1 space-y-4">
              <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex-1 min-w-[12rem]">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('classes.assignStudent')}</label>
                  <select className={inputClass} value={enrollStudentId} onChange={(e) => setEnrollStudentId(e.target.value)}>
                    <option value="">—</option>
                    {available.map((s) => <option key={s.id} value={s.id}>{s.lastName}, {s.firstName} ({s.code})</option>)}
                  </select>
                </div>
                {enrollLevelOptions.length > 0 && (
                  <div className="min-w-[10rem]">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('classes.level')}</label>
                    <select className={inputClass} value={enrollLevelId} onChange={(e) => setEnrollLevelId(e.target.value)}>
                      <option value="">—</option>
                      {enrollLevelOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}
                <button type="button" onClick={enrollStudent} disabled={!enrollStudentId} className={cn(primaryBtn, !enrollStudentId && 'opacity-40')}>
                  <i className="fa-solid fa-plus" /> {t('classes.addStudent')}
                </button>
              </div>
              {available.length === 0 && <p className="text-xs text-slate-400">{t('classes.noAvailableStudents')}</p>}
              {(selected.students || []).length === 0 ? <Empty text={t('classes.noStudents')} /> : (
                <div className="space-y-2">
                  {(selected.students as any[]).map((s) => {
                    const lvl = enrollLevelOptions.find((l) => l.id === s.levelId)?.name;
                    const initials = [s.firstName?.[0], s.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
                    return (
                      <div key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-center gap-3">
                          {s.imageUrl
                            ? <img src={s.imageUrl} alt={initials} className="size-9 rounded-full object-cover" />
                            : <div className="flex size-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">{initials}</div>
                          }
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{s.lastName ? `${s.lastName}, ${s.firstName}` : s.studentId}</p>
                            <p className="text-xs text-slate-400">{s.studentCode || ''}{lvl ? ` · ${lvl}` : ''}</p>
                          </div>
                        </div>
                        <Button type="button" mode="icon" size="sm" variant="outline" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => removeStudent(s.studentId)} aria-label={t('classes.removeStudent')}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'Attendance' && selected && (() => {
            const todayKey = new Date().toISOString().slice(0, 10);
            const students = selected.students as any[];
            if (attendanceDates.length === 0) return (
              <div className="px-1 py-10 text-center text-sm text-slate-400">
                Esta clase no tiene horarios configurados.<br />Agregá horarios en el tab <strong>Horarios</strong> para habilitar la asistencia.
              </div>
            );
            return (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                {attendanceLoading && (
                  <div className="flex items-center justify-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                    <span className="size-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> Cargando asistencia…
                  </div>
                )}
                <table className="w-full border-collapse text-sm" style={{ minWidth: `${180 + attendanceDates.length * 56}px` }}>
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[180px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                        Alumno
                      </th>
                      {attendanceDates.map(({ date, key }) => {
                        const isToday = key === todayKey;
                        const dow = date.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
                        return (
                          <th key={key} className={cn('min-w-[52px] border-b border-slate-200 px-1 py-2 text-center', isToday ? 'bg-primary/10' : 'bg-slate-50')}>
                            <div className={cn('text-[10px] font-bold capitalize', isToday ? 'text-primary' : 'text-slate-400')}>{dow}</div>
                            <div className={cn('text-xs font-bold', isToday ? 'text-primary' : 'text-slate-700')}>
                              {date.getDate()}/{date.getMonth() + 1}
                            </div>
                            {isToday && <div className="mx-auto mt-0.5 h-1 w-4 rounded-full bg-primary" />}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 && (
                      <tr><td colSpan={attendanceDates.length + 1} className="py-8 text-center text-sm text-slate-400">Sin alumnos inscriptos</td></tr>
                    )}
                    {students.map((s, si) => {
                      const rowBg = si % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
                      return (
                        <tr key={s.id}>
                          <td className={cn('sticky left-0 z-10 min-w-[210px] border-r border-slate-100 px-3 py-2', rowBg)}>
                            <div className="flex items-center gap-2.5">
                              {(() => {
                                const ini = [s.firstName?.[0], s.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';
                                return s.imageUrl
                                  ? <img src={s.imageUrl} alt={ini} className="size-7 shrink-0 rounded-full object-cover" />
                                  : <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">{ini}</div>;
                              })()}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-800">
                                  {s.lastName ? `${s.lastName}, ${s.firstName}` : s.studentId}
                                </p>
                                {s.studentCode && <p className="text-[11px] text-slate-400">{s.studentCode}</p>}
                              </div>
                            </div>
                          </td>
                          {attendanceDates.map(({ key }) => {
                            const k = `${s.studentId}_${key}`;
                            const present = attendance[k];
                            const isToday = key === todayKey;
                            const toggling = attendanceToggling.has(k);
                            return (
                              <td key={key} className={cn('px-1 py-2 text-center', isToday ? 'bg-primary/5' : rowBg)}>
                                <button
                                  type="button"
                                  onClick={() => void toggleAttendance(s.studentId, key)}
                                  disabled={toggling}
                                  title={present === true ? 'Presente — click para marcar ausente' : 'Ausente — click para marcar presente'}
                                  className={cn(
                                    'mx-auto flex size-8 items-center justify-center rounded-full border-2 transition-all duration-150',
                                    toggling && 'opacity-50 cursor-wait',
                                    present === true
                                      ? 'border-emerald-400 bg-emerald-400 text-white hover:bg-emerald-500 hover:border-emerald-500'
                                      : 'border-slate-200 bg-white text-slate-300 hover:border-primary hover:text-primary'
                                  )}
                                >
                                  {toggling
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : present === true
                                      ? <Check className="size-4" />
                                      : <span className="size-1.5 rounded-full bg-current" />}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex items-center gap-4 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="flex size-5 items-center justify-center rounded-full bg-emerald-400 text-white"><Check className="size-3" /></span>Presente
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="flex size-5 items-center justify-center rounded-full border-2 border-slate-200 bg-white"><span className="size-1 rounded-full bg-slate-300" /></span>Ausente
                  </span>
                  <span className="flex items-center gap-1.5 ml-auto">
                    <span className="h-2 w-4 rounded-full bg-primary/30" />Hoy
                  </span>
                </div>
              </div>
            );
          })()}

          {/* ---- Communities ---- */}
          {activeTab === 'Communities' && (
            <div className="px-1">
              {commLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">…</p>
              ) : classCommunities.length === 0 ? (
                <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-14 text-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-red-50 text-red-400">
                    <Users className="size-7" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Sin comunidad creada</p>
                    <p className="mt-1 text-xs text-slate-400">Creá una comunidad con todos los alumnos de esta clase.</p>
                  </div>
                  <button
                    type="button"
                    disabled={commCreating}
                    onClick={() => void createClassCommunity()}
                    className="flex items-center gap-2 rounded-xl bg-red-500 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {commCreating
                      ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      : <UserPlus className="size-4" />}
                    Crear comunidad de clase
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {classCommunities.map((c) => (
                    <div key={c.id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      {c.imageUrl
                        ? <img src={c.imageUrl} alt={c.name} className="size-11 shrink-0 rounded-xl object-cover" />
                        : <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-400"><Users className="size-5" /></div>
                      }
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                        {c.description && <p className="mt-0.5 truncate text-xs text-slate-400">{c.description}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="flex items-center gap-1 text-xs font-medium text-slate-500">
                          <Users className="size-3.5" /> {c.memberCount} miembro{c.memberCount !== 1 ? 's' : ''}
                        </span>
                        <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold', c.active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400')}>
                          {c.active ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      disabled={commCreating}
                      onClick={() => void createClassCommunity()}
                      className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {commCreating
                        ? <span className="size-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        : <UserPlus className="size-3.5" />}
                      Nueva comunidad
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Resources' && selected && (
            <div className="px-1">
              <div className="mb-4 flex justify-end">
                <button type="button" onClick={openCreateResource} className={primaryBtn}>
                  <i className="fa-solid fa-plus" /> {t('classes.newResource')}
                </button>
              </div>
              {resources.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{t('classes.noResources')}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {resources.map((r) => (
                    <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                          <p className="text-xs text-slate-400">{labelize(r.type)} · {labelize(r.visibility)}</p>
                        </div>
                        <button type="button" onClick={() => deleteResource(r)} className="h-8 w-8 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500" aria-label={t('classes.delete')}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      {r.description && <p className="mt-2 text-xs text-slate-500">{r.description}</p>}
                      {r.resourceUrl && (
                        <a href={r.resourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-500 hover:text-red-600">
                          <i className="fa-solid fa-up-right-from-square" /> {t('classes.open')}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {resourceModalOpen && (
          <Modal title={t('classes.newResource')} onClose={() => setResourceModalOpen(false)}>
            <form onSubmit={submitResource} className="space-y-4">
              <Field label={t('classes.resourceTitle')}>
                <input className={inputClass} value={resourceForm.title} onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })} required />
              </Field>
              <Field label={t('classes.description2')}>
                <textarea className={inputClass} rows={2} value={resourceForm.description} onChange={(e) => setResourceForm({ ...resourceForm, description: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('classes.resourceType')}>
                  <select className={inputClass} value={resourceForm.type} onChange={(e) => setResourceForm({ ...resourceForm, type: e.target.value })}>
                    {typeOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}
                  </select>
                </Field>
                <Field label={t('classes.resourceVisibility')}>
                  <select className={inputClass} value={resourceForm.visibility} onChange={(e) => setResourceForm({ ...resourceForm, visibility: e.target.value })}>
                    {visibilityOptions.map((x) => <option key={x} value={x}>{labelize(x)}</option>)}
                  </select>
                </Field>
              </div>
              <Field label={t('classes.resourceUrl')}>
                <input className={inputClass} value={resourceForm.resourceUrl} onChange={(e) => setResourceForm({ ...resourceForm, resourceUrl: e.target.value })} placeholder="https://..." />
              </Field>
              <Field label={t('classes.uploadFile')}>
                <input ref={resourceFileRef} type="file" className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file:uppercase" />
              </Field>
              <ModalActions onCancel={() => setResourceModalOpen(false)} cancel={t('classes.cancel')} save={t('classes.save')} />
            </form>
          </Modal>
        )}

        {modalOpen && ClassForm()}
      </div>
    );
  }

  // ------------------------------------------------------------------- form --
  function ClassForm() {
    return (
      <Modal title={editingId ? t('classes.editClass') : t('classes.newClass')} onClose={() => setModalOpen(false)} wide>
        <form onSubmit={submitClass} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('classes.name')}><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label={t('classes.discipline')}>
              <select className={inputClass} value={form.disciplineId} onChange={(e) => setForm({ ...form, disciplineId: e.target.value })} required>
                <option value="">—</option>
                {meta.disciplines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label={t('classes.sede')}>
              <select className={inputClass} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={t('classes.capacity')}><input type="number" min={0} className={inputClass} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
            <Field label={t('classes.status')}>
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {statusOptions.map((x) => <option key={x} value={x}>{x === 'ACTIVE' ? t('classes.active') : x === 'INACTIVE' ? t('classes.inactive') : x}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('classes.description2')}><textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>

          {/* Schedule */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('classes.schedule')}</span>
              <button type="button" onClick={() => setForm({ ...form, schedules: [...form.schedules, { dayOfWeek: 1, startTime: '', endTime: '', location: '' }] })} className="text-xs font-bold text-red-500"><i className="fa-solid fa-plus mr-1" />{t('classes.addSchedule')}</button>
            </div>
            {form.schedules.map((s, i) => (
              <div key={i} className="flex gap-2">
                <select className={inputClass} value={s.dayOfWeek} onChange={(e) => { const next = [...form.schedules]; next[i] = { ...next[i], dayOfWeek: Number(e.target.value) }; setForm({ ...form, schedules: next }); }}>
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                </select>
                <input type="time" className={inputClass} value={s.startTime} onChange={(e) => { const next = [...form.schedules]; next[i] = { ...next[i], startTime: e.target.value }; setForm({ ...form, schedules: next }); }} />
                <input type="time" className={inputClass} value={s.endTime} onChange={(e) => { const next = [...form.schedules]; next[i] = { ...next[i], endTime: e.target.value }; setForm({ ...form, schedules: next }); }} />
                <input className={inputClass} placeholder={t('classes.location')} value={s.location} onChange={(e) => { const next = [...form.schedules]; next[i] = { ...next[i], location: e.target.value }; setForm({ ...form, schedules: next }); }} />
                <button type="button" onClick={() => setForm({ ...form, schedules: form.schedules.filter((_, idx) => idx !== i) })} className="h-10 w-10 shrink-0 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500"><i className="fa-solid fa-trash" /></button>
              </div>
            ))}
          </div>

          {/* Own levels */}
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('classes.ownLevels')}</span>
              <button type="button" onClick={() => setForm({ ...form, levels: [...form.levels, { name: '', levelOrder: form.levels.length }] })} className="text-xs font-bold text-red-500"><i className="fa-solid fa-plus mr-1" />{t('classes.addLevel')}</button>
            </div>
            {selectedDiscipline && (selectedDiscipline.levels || []).length > 0 && (
              <p className="text-[11px] text-slate-400">{t('classes.inheritedLevels')}: {(selectedDiscipline.levels || []).map((l) => l.name).join(', ')}</p>
            )}
            {form.levels.map((l, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputClass} placeholder={t('classes.levelName')} value={l.name} onChange={(e) => { const next = [...form.levels]; next[i] = { ...next[i], name: e.target.value }; setForm({ ...form, levels: next }); }} />
                <button type="button" onClick={() => setForm({ ...form, levels: form.levels.filter((_, idx) => idx !== i) })} className="h-10 w-10 shrink-0 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500"><i className="fa-solid fa-trash" /></button>
              </div>
            ))}
          </div>

          {/* Teachers */}
          <MultiSelect label={t('classes.selectTeachers')} options={teacherOptions} selected={form.teacherIds} onToggle={(id) => setForm((f) => ({ ...f, teacherIds: toggleInArray(f.teacherIds, id) }))} />

          <ModalActions onCancel={() => setModalOpen(false)} cancel={t('classes.cancel')} save={t('classes.save')} />
        </form>
      </Modal>
    );
  }

  return (
    <>
      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

      <ListCard<ClassRow>
        title={t('classes.title')}
        description={t('classes.description')}
        cardTitle={t('classes.title')}
        searchPlaceholder={t('classes.searchPlaceholder')}
        searchTerm={search}
        onSearchChange={setSearch}
        primaryLabel={t('classes.newClass')}
        onPrimary={openCreate}
        table={table}
        recordCount={filtered.length}
        isLoading={loading}
        emptyMessage={t('classes.noClasses')}
        onRowClick={(c) => openDetails(c)}
        toolbarExtras={
          <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            Importar
          </Button>
        }
      />

      {modalOpen && ClassForm()}
      {importOpen && (
        <ImportModal
          title="Importar Clases"
          templateFilename="plantilla-clases.xlsx"
          columns={classImportColumns}
          onImport={handleClassImport}
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

const MultiSelect: React.FC<{ label: string; options: StaffItem[]; selected: string[]; onToggle: (id: string) => void; placeholder?: string }> = ({ label, options, selected, onToggle, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selectedOptions = options.filter((o) => selected.includes(o.id));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q) || (o.roleName || '').toLowerCase().includes(q) || (o.email || '').toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="space-y-1.5" ref={ref}>
      <label className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</label>
      <div className="relative">
        {/* Control: shows selected teachers as removable pills + a toggle */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
          className="flex min-h-[2.75rem] w-full cursor-pointer flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
        >
          {selectedOptions.length === 0 && <span className="px-1 text-slate-400">{placeholder || '—'}</span>}
          {selectedOptions.map((o) => (
            <span key={o.id} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
              {o.name}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggle(o.id); }}
                className="rounded p-0.5 text-red-400 hover:bg-red-100 hover:text-red-600"
                aria-label={`Quitar ${o.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <ChevronDown className={cn('ml-auto size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
        </div>

        {/* Panel: search + checkable option list (in-flow so it never clips inside the modal) */}
        {open && (
          <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Buscar..."
                className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </div>
            <div className="max-h-44 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-slate-400">Sin resultados</p>
              ) : (
                filtered.map((o) => {
                  const checked = selected.includes(o.id);
                  return (
                    <button
                      type="button"
                      key={o.id}
                      onClick={() => onToggle(o.id)}
                      className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50', checked && 'bg-red-50/60')}
                    >
                      <span className="text-slate-700">{o.name}{o.roleName ? <span className="text-slate-400"> · {o.roleName}</span> : null}</span>
                      {checked && <Check className="size-4 shrink-0 text-red-500" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

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

export default ClassModule;
