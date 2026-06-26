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
import { Building2, Eye, EyeOff, IdCard, Mail, Pencil, Phone, Trash2, UserRound } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import { cn } from '@webapp/lib/utils';
import ListCard from '@webapp/components/shared/ListCard';
import ProfileHeader from '@webapp/components/shared/ProfileHeader';

type ParentView = 'list' | 'details';
type DetailTab = 'Overview' | 'Children';

interface Props {
  view: ParentView;
  setView: (view: ViewType, params?: Record<string, string>) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
  recordId?: string;
}

interface CompanyItem { id: string; name: string }

interface ChildSummary {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  className?: string | null;
}

interface ParentRow {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email: string;
  phone?: string | null;
  document?: string | null;
  companyId: string;
  companyName?: string | null;
  emailVerifiedAt?: string | null;
  imageUrl?: string | null;
  children?: ChildSummary[];
}

interface ChildDetail {
  id: string;
  code?: string | null;
  firstName: string;
  lastName: string;
  imageUrl?: string | null;
  status?: string;
  companyName?: string | null;
  className?: string | null;
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';

const emptyForm = { firstName: '', lastName: '', email: '', phone: '', companyId: '', password: '', active: true };

const ParentsModule: React.FC<Props> = ({ view, setView, companyId, onSubTitleChange, recordId }) => {
  const { t } = useTranslation();

  // List state
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  // Detail state
  const [selected, setSelected] = useState<ParentRow | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('Overview');
  const [children, setChildren] = useState<ChildDetail[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);

  // Image upload
  const logoFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  // Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [showPassword, setShowPassword] = useState(false);

  // ---- Loaders ---------------------------------------------------------------

  const loadParents = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/parents');
      if (!res.ok) throw new Error();
      setParents(await res.json());
    } catch { setError(t('parents.errorLoad')); } finally { setLoading(false); }
  };

  const loadCompanies = async () => {
    try {
      const res = await fetch('/api/companies?status=Active');
      if (res.ok) setCompanies(await res.json());
    } catch { /* ignore */ }
  };

  const loadParent = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/parents/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(data);
      onSubTitleChange?.(`${data.firstName || ''} ${data.lastName || ''}`.trim());
    } catch { setError(t('parents.errorLoad')); }
  };

  const loadChildren = async (id: string) => {
    setChildrenLoading(true);
    try {
      const res = await fetch(`/api/parents/${id}/students`);
      setChildren(res.ok ? await res.json() : []);
    } catch { setChildren([]); } finally { setChildrenLoading(false); }
  };

  const uploadImage = async (kind: 'logo' | 'cover', file: File | undefined) => {
    if (!selected || !file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(`/api/parents/${selected.id}/image`, { method: 'POST', body: fd });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('parents.errorSave')); }
      setSelected(await res.json());
    } catch (err: any) { setError(err.message || t('parents.errorSave')); }
  };

  // ---- Effects ---------------------------------------------------------------

  useEffect(() => { void loadCompanies(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadParents(); }, [companyId]);

  useEffect(() => {
    if (view === 'list') { setSelected(null); setActiveTab('Overview'); }
    else if (view === 'details') {
      if (recordId) void loadParent(recordId);
      else setView('Parents');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, recordId]);

  useEffect(() => {
    if (view !== 'details' || !selected?.id) return;
    if (activeTab === 'Children') void loadChildren(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeTab, selected?.id]);

  // ---- CRUD ------------------------------------------------------------------

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, companyId: companyId || companies[0]?.id || '' });
    setShowPassword(false);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (p: ParentRow) => {
    setEditingId(p.id);
    setForm({
      firstName: p.firstName || '', lastName: p.lastName || '', email: p.email || '',
      phone: p.phone || '', companyId: p.companyId || '', password: '', active: Boolean(p.emailVerifiedAt)
    });
    setError('');
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    if (!form.email.trim()) return setError(t('parents.errorEmailRequired'));
    if (!editingId && !form.password) return setError(t('parents.errorPasswordRequired'));
    try {
      const payload: Record<string, unknown> = { ...form };
      if (editingId && !form.password) delete payload.password;
      if (!editingId) delete payload.active;
      const res = await fetch(editingId ? `/api/parents/${editingId}` : '/api/parents', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('parents.errorSave')); }
      setModalOpen(false);
      if (view === 'list') {
        await loadParents();
      } else if (editingId && selected?.id === editingId) {
        await loadParent(editingId);
      }
    } catch (err: any) { setError(err.message || t('parents.errorSave')); }
  };

  const remove = async (p: ParentRow) => {
    const label = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email;
    if (!window.confirm(t('parents.deleteConfirm', { name: label }))) return;
    setError('');
    try {
      const res = await fetch(`/api/parents/${p.id}`, { method: 'DELETE' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('parents.errorSave')); }
      if (view === 'list') await loadParents();
      else setView('Parents');
    } catch (err: any) { setError(err.message || t('parents.errorSave')); }
  };

  // ---- Table -----------------------------------------------------------------

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter((p) =>
      `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase().includes(q) ||
      (p.email || '').toLowerCase().includes(q) ||
      (p.document || '').toLowerCase().includes(q) ||
      (p.companyName || '').toLowerCase().includes(q)
    );
  }, [parents, search]);

  const columns = useMemo<ColumnDef<ParentRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => `${row.firstName || ''} ${row.lastName || ''}`,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('parents.name')} />,
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
        id: 'children',
        enableSorting: false,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('parents.children')} />,
        cell: ({ row }) => {
          const kids = row.original.children || [];
          if (!kids.length) return <span className="text-sm text-muted-foreground">—</span>;
          return (
            <div className="flex flex-col gap-1">
              {kids.map((k) => {
                const initials = `${(k.firstName || ' ').charAt(0)}${(k.lastName || ' ').charAt(0)}`.toUpperCase();
                return (
                  <div key={k.id} className="flex items-center gap-2">
                    {k.imageUrl
                      ? <img src={k.imageUrl} alt={initials} className="h-7 w-7 flex-shrink-0 rounded-lg object-cover" />
                      : <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">{initials}</div>
                    }
                    <span className="text-sm text-foreground">{`${k.firstName || ''} ${k.lastName || ''}`.trim()}</span>
                  </div>
                );
              })}
            </div>
          );
        }
      },
      {
        id: 'class',
        enableSorting: false,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('parents.class')} />,
        cell: ({ row }) => {
          const kids = row.original.children || [];
          const classNames = [...new Set(kids.map((k) => k.className).filter(Boolean))] as string[];
          if (!classNames.length) return <span className="text-sm text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {classNames.map((name) => (
                <span key={name} className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">{name}</span>
              ))}
            </div>
          );
        }
      },
      {
        id: 'sede',
        accessorFn: (row) => row.companyName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('parents.sede')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.companyName || '—'}</span>
      },
      {
        id: 'active',
        accessorFn: (row) => (row.emailVerifiedAt ? 'Activa' : 'Pendiente'),
        header: ({ column }) => <DataGridColumnHeader column={column} title="Cuenta" />,
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase',
              row.original.emailVerifiedAt ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            )}
          >
            {row.original.emailVerifiedAt ? 'Activa' : 'Pendiente'}
          </span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">
            {t('parents.actions')}
          </span>
        ),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => setView('ParentDetails', { id: p.id })} aria-label={t('parents.view') ?? 'Ver'}>
                <Eye className="size-3.5" />
              </Button>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEdit(p)} aria-label={t('parents.edit')}>
                <Pencil className="size-3.5" />
              </Button>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => remove(p)} aria-label={t('parents.delete')}>
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

  // ---- Shared edit modal -----------------------------------------------------

  const parentModal = modalOpen && (
    <Modal title={editingId ? t('parents.editParent') : t('parents.newParent')} onClose={() => setModalOpen(false)}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('parents.firstName')}><input className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></Field>
          <Field label={t('parents.lastName')}><input className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></Field>
          <Field label={t('parents.email')}><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
          <Field label={t('parents.phone')}><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        {!editingId && (
          <Field label={t('parents.password')}>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
        )}
        {editingId && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Cuenta activa</p>
                <p className="mt-1 text-xs text-slate-500">
                  Permite que el padre inicie sesion sin esperar el enlace de activacion por email.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.active}
                onClick={() => setForm({ ...form, active: !form.active })}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-200',
                  form.active ? 'bg-red-500' : 'bg-slate-300'
                )}
              >
                <span
                  className={cn(
                    'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
                    form.active ? 'translate-x-5' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>
          </div>
        )}
        <ModalActions onCancel={() => setModalOpen(false)} cancel={t('parents.cancel')} save={t('parents.save')} />
      </form>
    </Modal>
  );

  // ---- Detail view -----------------------------------------------------------

  if (view === 'details') {
    const fullName = `${selected?.firstName || ''} ${selected?.lastName || ''}`.trim();
    const initials = `${(selected?.firstName || ' ').charAt(0)}${(selected?.lastName || ' ').charAt(0)}`.toUpperCase();

    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadImage('logo', e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={coverFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadImage('cover', e.target.files?.[0]); e.target.value = ''; }} />

        <ProfileHeader
          title={fullName || '—'}
          initials={initials}
          imageUrl={selected?.imageUrl}
          coverUrl={(selected as any)?.coverUrl}
          onLogoClick={() => logoFileRef.current?.click()}
          onCoverClick={() => coverFileRef.current?.click()}
          meta={[
            { icon: <Building2 className="size-4" />, text: selected?.companyName || '—' },
            { icon: <Mail className="size-4" />, text: selected?.email || '—' },
            ...(selected?.phone ? [{ icon: <Phone className="size-4" />, text: selected.phone }] : [])
          ]}
          tabs={[
            { id: 'Overview', label: t('parents.overview') },
            { id: 'Children', label: t('parents.children') }
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as DetailTab)}
          onBack={() => setView('Parents')}
          actions={
            <Button type="button" variant="outline" onClick={() => selected && openEdit(selected)}>
              <Pencil className="size-3.5" /> {t('parents.edit')}
            </Button>
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">

          {activeTab === 'Overview' && selected && (
            <div className="grid grid-cols-1 gap-5 px-1 sm:grid-cols-2">
              <InfoItem label={t('parents.email')} value={selected.email} />
              <InfoItem label={t('parents.phone')} value={selected.phone || '—'} />
              <InfoItem label={t('parents.document')} value={selected.document || '—'} />
              <InfoItem label={t('parents.sede')} value={selected.companyName || '—'} />
              <InfoItem label="Cuenta" value={selected.emailVerifiedAt ? 'Activa' : 'Pendiente'} />
            </div>
          )}

          {activeTab === 'Children' && (
            <div className="px-1">
              {childrenLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">…</p>
              ) : children.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{t('parents.noChildren')}</p>
              ) : (
                <div className="space-y-2">
                  {children.map((child) => {
                    const initials2 = `${child.firstName.charAt(0)}${child.lastName.charAt(0)}`.toUpperCase();
                    return (
                      <div key={child.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-border dark:bg-card">
                        {child.imageUrl
                          ? <img src={child.imageUrl} alt={initials2} className="h-10 w-10 flex-shrink-0 rounded-xl object-cover" />
                          : <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-sm font-bold text-red-500">
                              {initials2 || <UserRound className="size-4" />}
                            </div>
                        }
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-foreground">
                            {`${child.firstName} ${child.lastName}`.trim()}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            {child.code && (
                              <span className="flex items-center gap-1"><IdCard className="size-3" /> {child.code}</span>
                            )}
                            {child.companyName && (
                              <span className="flex items-center gap-1"><Building2 className="size-3" /> {child.companyName}</span>
                            )}
                          </div>
                        </div>
                        {child.className && (
                          <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-600">
                            {child.className}
                          </span>
                        )}
                        <span className={cn(
                          'shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase',
                          child.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground'
                        )}>
                          {child.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {parentModal}
      </div>
    );
  }

  // ---- List view -------------------------------------------------------------

  return (
    <>
      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

      <ListCard<ParentRow>
        title={t('parents.title')}
        description={t('parents.description')}
        cardTitle={t('parents.title')}
        searchPlaceholder={t('parents.searchPlaceholder')}
        searchTerm={search}
        onSearchChange={setSearch}
        primaryLabel={t('parents.newParent')}
        onPrimary={openCreate}
        table={table}
        recordCount={filtered.length}
        isLoading={loading}
        emptyMessage={t('parents.noParents')}
        onRowClick={(p) => setView('ParentDetails', { id: p.id })}
      />

      {parentModal}
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

const ModalActions: React.FC<{ onCancel: () => void; cancel: string; save: string }> = ({ onCancel, cancel, save }) => (
  <div className="flex justify-end gap-2 pt-2">
    <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50">{cancel}</button>
    <button type="submit" className="rounded-xl bg-red-500 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600">{save}</button>
  </div>
);

export default ParentsModule;
