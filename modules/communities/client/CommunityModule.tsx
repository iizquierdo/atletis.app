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
import { Building2, Eye, FileText, Pencil, Power, PowerOff, UsersRound } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import { cn } from '@webapp/lib/utils';
import ListCard from '@webapp/components/shared/ListCard';
import ProfileHeader from '@webapp/components/shared/ProfileHeader';

type CommunityView = 'list' | 'details';

interface Props {
  view: CommunityView;
  setView: (view: ViewType) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
}

interface CompanyItem { id: string; name: string }
interface DisciplineItem { id: string; name: string }
interface CommunityRow { id: string; name: string; active: boolean; companyId: string; companyName?: string; memberCount?: number; postCount?: number }
interface MemberItem { id: string; studentId: string; firstName?: string; lastName?: string; code?: string }
interface StudentItem { id: string; firstName: string; lastName: string; code: string }
interface PostItem { id: string; title: string; content?: string | null; status: string; membersOnly: boolean; authorName?: string; createdAt: string }

const SELECTED_KEY = 'sinapsis.communities.selected';
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';
const labelize = (raw: string) => String(raw || '').toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const CommunityModule: React.FC<Props> = ({ view, setView, currentUser, companyId, onSubTitleChange }) => {
  const { t } = useTranslation();
  const userId = currentUser?.id || '';

  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [disciplines, setDisciplines] = useState<DisciplineItem[]>([]);

  const [selected, setSelected] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Members' | 'Posts'>('Overview');
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);

  const [communityModalOpen, setCommunityModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', companyId: '', disciplineId: '', active: true });

  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [allStudents, setAllStudents] = useState<StudentItem[]>([]);
  const [memberSel, setMemberSel] = useState<string[]>([]);

  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postForm, setPostForm] = useState({ title: '', content: '', status: 'PUBLISHED', membersOnly: false });

  const loadCommunities = async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (companyId) qs.set('companyId', companyId);
      const res = await fetch(`/api/communities?${qs.toString()}`);
      if (!res.ok) throw new Error();
      setCommunities(await res.json());
    } catch { setError(t('communities.errorLoad')); } finally { setLoading(false); }
  };

  const loadMeta = async () => {
    try { const r = await fetch('/api/communities/meta'); if (r.ok) { const d = await r.json(); setDisciplines(d.disciplines || []); } } catch { /* ignore */ }
    try { const r = await fetch('/api/companies?status=Active'); if (r.ok) setCompanies(await r.json()); } catch { /* ignore */ }
  };

  const loadDetails = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/communities/${id}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSelected(data);
      onSubTitleChange?.(data.name);
      const [mem, pos] = await Promise.all([
        fetch(`/api/communities/${id}/members`).then((r) => (r.ok ? r.json() : [])),
        fetch(`/api/communities/${id}/posts`).then((r) => (r.ok ? r.json() : []))
      ]);
      setMembers(mem); setPosts(pos);
    } catch { setError(t('communities.errorLoad')); }
  };

  useEffect(() => { void loadMeta(); }, []);
  useEffect(() => {
    if (view === 'list') { void loadCommunities(); setSelected(null); }
    else { const id = localStorage.getItem(SELECTED_KEY); if (id) void loadDetails(id); else setView('Communities'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, companyId]);

  const openDetails = (c: CommunityRow) => { localStorage.setItem(SELECTED_KEY, c.id); setActiveTab('Overview'); setView('CommunityDetails'); };

  const openCreate = () => { setEditingId(null); setForm({ name: '', description: '', companyId: companyId || companies[0]?.id || '', disciplineId: '', active: true }); setCommunityModalOpen(true); };
  const openEdit = (c: any) => { setEditingId(c.id); setForm({ name: c.name || '', description: c.description || '', companyId: c.companyId || '', disciplineId: c.disciplineId || '', active: c.active }); setCommunityModalOpen(true); };

  const submitCommunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.companyId) return;
    try {
      const isEdit = Boolean(editingId);
      const res = await fetch(isEdit ? `/api/communities/${editingId}` : '/api/communities', { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('communities.errorSave')); }
      setCommunityModalOpen(false);
      if (view === 'list') await loadCommunities(); else if (editingId) await loadDetails(editingId);
    } catch (e: any) { setError(e.message || t('communities.errorSave')); }
  };

  const toggleStatus = async (c: CommunityRow) => {
    await fetch(`/api/communities/${c.id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !c.active }) });
    await loadCommunities();
  };

  const openMemberModal = async () => {
    const res = await fetch('/api/students?status=ACTIVE');
    setAllStudents(res.ok ? await res.json() : []);
    setMemberSel(members.map((m) => m.studentId));
    setMemberModalOpen(true);
  };

  const saveMembers = async () => {
    if (!selected) return;
    await fetch(`/api/communities/${selected.id}/members`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentIds: memberSel }) });
    setMemberModalOpen(false);
    await loadDetails(selected.id);
  };

  const submitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !postForm.title.trim()) return;
    try {
      const res = await fetch(`/api/communities/${selected.id}/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(postForm) });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || t('communities.errorSave')); }
      setPostModalOpen(false); setPostForm({ title: '', content: '', status: 'PUBLISHED', membersOnly: false });
      await loadDetails(selected.id);
    } catch (e: any) { setError(e.message || t('communities.errorSave')); }
  };

  // ---- List table (standard Sinapsis ListCard) ------------------------------
  const [sorting, setSorting] = useState<SortingState>([]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter((c) => c.name.toLowerCase().includes(q) || (c.companyName || '').toLowerCase().includes(q));
  }, [communities, search]);

  const columns = useMemo<ColumnDef<CommunityRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('communities.name')} />,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
                <UsersRound className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{c.companyName || '—'}</p>
              </div>
            </div>
          );
        }
      },
      {
        id: 'sede',
        accessorFn: (row) => row.companyName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('communities.sede')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.companyName || '—'}</span>
      },
      {
        id: 'members',
        accessorFn: (row) => row.memberCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('communities.members')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.memberCount ?? 0}</span>
      },
      {
        id: 'posts',
        accessorFn: (row) => row.postCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('communities.posts')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.postCount ?? 0}</span>
      },
      {
        id: 'status',
        accessorFn: (row) => (row.active ? 'active' : 'inactive'),
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('communities.status')} />,
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
              row.original.active ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground'
            )}
          >
            {row.original.active ? t('communities.active') : t('communities.inactive')}
          </span>
        )
      },
      {
        id: 'actions',
        enableSorting: false,
        meta: { headerClassName: 'text-end', cellClassName: 'text-end' },
        header: () => (
          <span className="inline-flex w-full justify-end text-[0.8125rem] font-medium uppercase tracking-wide text-table-header-foreground">
            {t('communities.actions')}
          </span>
        ),
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openDetails(c)} aria-label={t('communities.view')}>
                <Eye className="size-3.5" />
              </Button>
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEdit(c)} aria-label={t('communities.edit')}>
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className={cn('size-8', c.active && 'text-destructive hover:bg-destructive/10')}
                onClick={() => toggleStatus(c)}
                aria-label={t('communities.status')}
              >
                {c.active ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
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
  const toggleSel = (id: string) => setMemberSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (view === 'details') {
    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <ProfileHeader
          title={selected?.name || '—'}
          imageUrl={selected?.imageUrl || undefined}
          icon={<UsersRound className="size-10" />}
          meta={[
            { icon: <Building2 className="size-4" />, text: selected?.companyName || '—' },
            { icon: <UsersRound className="size-4" />, text: `${selected?.memberCount ?? members.length} ${t('communities.members')}` },
            { icon: <FileText className="size-4" />, text: `${selected?.postCount ?? posts.length} ${t('communities.posts')}` },
            { text: selected?.active ? t('communities.active') : t('communities.inactive') }
          ]}
          tabs={[
            { id: 'Overview', label: t('communities.overview') },
            { id: 'Members', label: t('communities.members') },
            { id: 'Posts', label: t('communities.posts') }
          ]}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as 'Overview' | 'Members' | 'Posts')}
          onBack={() => setView('Communities')}
          actions={
            <Button type="button" variant="outline" onClick={() => selected && openEdit(selected)}>
              <Pencil className="size-3.5" /> {t('communities.edit')}
            </Button>
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
        {activeTab === 'Overview' && selected && (
          <div className="grid gap-4 px-1 sm:grid-cols-3">
            <Stat n={selected.memberCount ?? members.length} label={t('communities.members')} />
            <Stat n={selected.postCount ?? posts.length} label={t('communities.posts')} />
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 sm:col-span-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('communities.descriptionLabel')}</p>
              <p className="mt-0.5 text-sm text-slate-700">{selected.description || '—'}</p>
            </div>
          </div>
        )}

        {activeTab === 'Members' && (
          <div className="px-1">
            <div className="mb-4 flex justify-end"><button onClick={openMemberModal} className={primaryBtn}><i className="fa-solid fa-user-plus" /> {t('communities.manageMembers')}</button></div>
            {members.length === 0 ? <Empty text={t('communities.noMembers')} /> : (
              <div className="grid gap-2 sm:grid-cols-2">
                {members.map((m) => (
                  <div key={m.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
                    {m.firstName ? `${m.firstName} ${m.lastName}` : m.studentId} {m.code && <span className="text-xs text-slate-400">· {m.code}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Posts' && (
          <div className="px-1">
            <div className="mb-4 flex justify-end"><button onClick={() => setPostModalOpen(true)} className={primaryBtn}><i className="fa-solid fa-plus" /> {t('communities.newPost')}</button></div>
            {posts.length === 0 ? <Empty text={t('communities.noPosts')} /> : (
              <div className="space-y-3">
                {posts.map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${p.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{labelize(p.status)}</span>
                    </div>
                    {p.content && <p className="mt-2 text-xs text-slate-600">{p.content}</p>}
                    <p className="mt-2 text-[10px] uppercase tracking-widest text-slate-400">{p.authorName}{p.membersOnly ? ` · ${t('communities.membersOnly')}` : ''}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </div>

        {communityModalOpen && <CommunityForm />}
        {memberModalOpen && (
          <Modal title={t('communities.manageMembers')} onClose={() => setMemberModalOpen(false)}>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {allStudents.length === 0 ? <Empty text={t('communities.noMembers')} /> : allStudents.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <input type="checkbox" checked={memberSel.includes(s.id)} onChange={() => toggleSel(s.id)} />
                  <span>{s.firstName} {s.lastName} <span className="text-xs text-slate-400">· {s.code}</span></span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setMemberModalOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-600 hover:bg-slate-50">{t('communities.cancel')}</button>
              <button onClick={saveMembers} className="rounded-xl bg-red-500 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-red-600">{t('communities.saveMembers')}</button>
            </div>
          </Modal>
        )}
        {postModalOpen && (
          <Modal title={t('communities.newPost')} onClose={() => setPostModalOpen(false)}>
            <form onSubmit={submitPost} className="space-y-4">
              <Field label={t('communities.postTitle')}><input className={inputClass} value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} required /></Field>
              <Field label={t('communities.content')}><textarea className={inputClass} rows={4} value={postForm.content} onChange={(e) => setPostForm({ ...postForm, content: e.target.value })} /></Field>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={postForm.membersOnly} onChange={(e) => setPostForm({ ...postForm, membersOnly: e.target.checked })} />{t('communities.membersOnly')}</label>
                <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={postForm.status === 'PUBLISHED'} onChange={(e) => setPostForm({ ...postForm, status: e.target.checked ? 'PUBLISHED' : 'DRAFT' })} />{t('communities.publish')}</label>
              </div>
              <ModalActions onCancel={() => setPostModalOpen(false)} cancel={t('communities.cancel')} save={t('communities.save')} />
            </form>
          </Modal>
        )}
      </div>
    );
  }

  function CommunityForm() {
    return (
      <Modal title={editingId ? t('communities.editCommunity') : t('communities.newCommunity')} onClose={() => setCommunityModalOpen(false)}>
        <form onSubmit={submitCommunity} className="space-y-4">
          <Field label={t('communities.name')}><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label={t('communities.descriptionLabel')}><textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('communities.sede')}><select className={inputClass} value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label={t('communities.discipline')}><select className={inputClass} value={form.disciplineId} onChange={(e) => setForm({ ...form, disciplineId: e.target.value })}><option value="">—</option>{disciplines.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />{t('communities.active')}</label>
          <ModalActions onCancel={() => setCommunityModalOpen(false)} cancel={t('communities.cancel')} save={t('communities.save')} />
        </form>
      </Modal>
    );
  }

  return (
    <>
      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

      <ListCard<CommunityRow>
        title={t('communities.title')}
        description={t('communities.description')}
        cardTitle={t('communities.title')}
        searchPlaceholder={t('communities.searchPlaceholder')}
        searchTerm={search}
        onSearchChange={setSearch}
        primaryLabel={t('communities.newCommunity')}
        onPrimary={openCreate}
        table={table}
        recordCount={filtered.length}
        isLoading={loading}
        emptyMessage={t('communities.noCommunities')}
        onRowClick={(c) => openDetails(c)}
      />

      {communityModalOpen && <CommunityForm />}
    </>
  );
};

const Stat: React.FC<{ n: number; label: string }> = ({ n, label }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
    <p className="text-2xl font-bold text-slate-900">{n}</p>
    <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{text}</p>;

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5"><label className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</label>{children}</div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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

export default CommunityModule;
