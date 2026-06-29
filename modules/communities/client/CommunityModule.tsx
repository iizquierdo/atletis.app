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
import { Building2, Camera, Eye, FileText, Globe, Heart, Link2, MessageCircle, Paperclip, Pencil, Power, PowerOff, Send, Trash2, UsersRound, Video, X } from 'lucide-react';
import { Button } from '@webapp/components/ui/button';
import { DataGridColumnHeader } from '@webapp/components/ui/data-grid-column-header';
import { cn } from '@webapp/lib/utils';
import ListCard from '@webapp/components/shared/ListCard';
import ProfileHeader from '@webapp/components/shared/ProfileHeader';

type CommunityView = 'list' | 'details';

interface Props {
  view: CommunityView;
  setView: (view: ViewType, params?: Record<string, string>) => void;
  currentUser?: AppUser;
  companyId?: string;
  onSubTitleChange?: (subtitle: string) => void;
  recordId?: string;
}

interface CompanyItem { id: string; name: string }
interface DisciplineItem { id: string; name: string }
interface CommunityRow { id: string; name: string; active: boolean; companyId: string; companyName?: string; memberCount?: number; postCount?: number; imageUrl?: string | null; coverUrl?: string | null }
interface MemberItem { id: string; studentId: string; firstName?: string; lastName?: string; code?: string; imageUrl?: string | null }
interface StudentItem { id: string; firstName: string; lastName: string; code: string }
interface PostItem {
  id: string; title: string; content?: string | null; status: string; membersOnly: boolean;
  authorId: string; authorName?: string; authorImageUrl?: string | null; authorAvatarUrl?: string | null;
  authorFirstName?: string; authorLastName?: string;
  coverUrl?: string | null; mediaType?: string | null;
  likesCount: number; commentsCount: number; likedByMe: boolean; createdAt: string;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100';

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'hace un momento';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `hace ${Math.floor(diff / 86400)} d`;
  return `hace ${Math.floor(diff / 604800)} sem`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const CommunityModule: React.FC<Props> = ({ view, setView, currentUser, companyId, onSubTitleChange, recordId }) => {
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

  // Compose (inline social feed)
  const [composeDraft, setComposeDraft] = useState('');
  const [composeExpanded, setComposeExpanded] = useState(false);
  const [composeSubmitting, setComposeSubmitting] = useState(false);
  const [composeAttachment, setComposeAttachment] = useState<{ url: string; mediaType: string } | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);

  // File refs
  const logoFileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const imageAttachRef = useRef<HTMLInputElement>(null);
  const videoAttachRef = useRef<HTMLInputElement>(null);
  const docAttachRef = useRef<HTMLInputElement>(null);

  const uploadAttachment = async (file: File) => {
    if (!selected || attachmentUploading) return;
    setAttachmentUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/communities/${selected.id}/posts/upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error();
      const { url, mediaType } = await res.json();
      setComposeAttachment({ url, mediaType });
      setShowLinkInput(false);
      setLinkDraft('');
    } catch { setError('No se pudo subir el archivo.'); } finally { setAttachmentUploading(false); }
  };

  const addLinkAttachment = () => {
    const url = linkDraft.trim();
    if (!url) return;
    setComposeAttachment({ url, mediaType: 'link' });
    setShowLinkInput(false);
    setLinkDraft('');
  };

  const removeMember = async (studentId: string) => {
    if (!selected) return;
    try {
      await fetch(`/api/communities/${selected.id}/members/${studentId}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((m) => m.studentId !== studentId));
    } catch { setError(t('communities.errorSave')); }
  };

  const uploadCommunityImage = async (kind: 'logo' | 'cover', file: File | undefined) => {
    if (!selected || !file) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', kind);
      const res = await fetch(`/api/communities/${selected.id}/image`, { method: 'POST', body: fd });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || 'Error al subir imagen'); }
      setSelected(await res.json());
    } catch (err: any) { setError(err.message || 'Error al subir imagen'); }
  };

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
    else if (recordId) { void loadDetails(recordId); }
    else { setView('Communities'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, companyId, recordId]);

  const openDetails = (c: CommunityRow) => { setActiveTab('Overview'); setView('CommunityDetails', { id: c.id }); };

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

  const openMemberModal = async () => {
    try {
      const r = await fetch('/api/students?status=ACTIVE&limit=500');
      const data = r.ok ? await r.json() : [];
      const list: StudentItem[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setAllStudents(list);
      setMemberSel(members.map((m) => m.studentId));
    } catch { setAllStudents([]); }
    setMemberModalOpen(true);
  };

  const saveMembers = async () => {
    if (!selected) return;
    try {
      await fetch(`/api/communities/${selected.id}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentIds: memberSel }) });
      setMemberModalOpen(false);
      await loadDetails(selected.id);
    } catch { setError(t('communities.errorSave')); }
  };

  const submitNewPost = async () => {
    if (!selected || (!composeDraft.trim() && !composeAttachment) || composeSubmitting) return;
    setComposeSubmitting(true);
    try {
      const body: Record<string, any> = {
        title: composeDraft.trim() || (composeAttachment?.mediaType === 'link' ? composeAttachment.url : 'Adjunto'),
        content: composeDraft.trim() || null,
        status: 'PUBLISHED',
      };
      if (composeAttachment) {
        body.coverUrl = composeAttachment.url;
        body.mediaType = composeAttachment.mediaType;
      }
      const res = await fetch(`/api/communities/${selected.id}/posts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error();
      const updated = await fetch(`/api/communities/${selected.id}/posts`).then((r) => (r.ok ? r.json() : posts));
      setPosts(updated);
      setComposeDraft('');
      setComposeAttachment(null);
      setComposeExpanded(false);
      setShowLinkInput(false);
      setLinkDraft('');
    } catch { setError(t('communities.errorSave')); } finally { setComposeSubmitting(false); }
  };

  const deletePost = async (postId: string) => {
    if (!selected) return;
    try {
      await fetch(`/api/communities/${selected.id}/posts/${postId}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch { setError(t('communities.errorSave')); }
  };

  const toggleLike = async (postId: string) => {
    if (!selected) return;
    try {
      const res = await fetch(`/api/communities/${selected.id}/posts/${postId}/like`, { method: 'POST' });
      if (!res.ok) return;
      const { liked, count } = await res.json();
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likedByMe: liked, likesCount: count } : p));
    } catch { /* ignore */ }
  };

  // ---- List table -----------------------------------------------------------
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
              {c.imageUrl
                ? <img src={mediaUrl(c.imageUrl)} alt={c.name} className="h-9 w-9 flex-shrink-0 rounded-xl object-cover" />
                : <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500"><UsersRound className="size-4" /></div>
              }
              <div>
                <p className="text-sm font-semibold text-foreground">{c.name}</p>
                <p className="text-[11px] font-medium text-muted-foreground">{c.companyName || '—'}</p>
              </div>
            </div>
          );
        }
      },
      {
        id: 'memberCount',
        accessorFn: (row) => row.memberCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('communities.members')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.memberCount ?? 0}</span>
      },
      {
        id: 'postCount',
        accessorFn: (row) => row.postCount ?? 0,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('communities.posts')} />,
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.postCount ?? 0}</span>
      },
      {
        id: 'status',
        accessorFn: (row) => row.active,
        header: ({ column }) => <DataGridColumnHeader column={column} title={t('communities.status')} />,
        cell: ({ row }) => (
          <span className={cn('rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider', row.original.active ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground')}>
            {row.original.active ? t('communities.active') : t('communities.inactive')}
          </span>
        )
      },
      {
        id: 'actions', header: () => null, enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={(e) => { e.stopPropagation(); openDetails(row.original); }}>
              <Eye className="size-3.5" />
            </Button>
            <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
              <Pencil className="size-3.5" />
            </Button>
          </div>
        )
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const table = useReactTable({ data: filtered, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  const primaryBtn = 'px-5 py-2.5 bg-red-500 hover:bg-red-600 active:scale-[0.98] transition-all text-white rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2';
  const toggleSel = (id: string) => setMemberSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  if (view === 'details') {
    const visiblePosts = posts.filter((p) => p.status !== 'ARCHIVED');
    const currentUserAvatar = (currentUser as any)?.imageUrl || (currentUser as any)?.avatar;
    const currentUserInitials = `${(currentUser?.firstName || currentUser?.name || ' ')[0]}`.toUpperCase();

    return (
      <div className="space-y-6 animate-in fade-in duration-300 pb-10">
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

        <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadCommunityImage('logo', e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={coverFileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { void uploadCommunityImage('cover', e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={imageAttachRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) void uploadAttachment(e.target.files[0]); e.target.value = ''; }} />
        <input ref={videoAttachRef} type="file" accept="video/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) void uploadAttachment(e.target.files[0]); e.target.value = ''; }} />
        <input ref={docAttachRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) void uploadAttachment(e.target.files[0]); e.target.value = ''; }} />

        <ProfileHeader
          title={selected?.name || '—'}
          imageUrl={selected?.imageUrl || undefined}
          coverUrl={selected?.coverUrl || undefined}
          onLogoClick={() => logoFileRef.current?.click()}
          onCoverClick={() => coverFileRef.current?.click()}
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
              <div className="mb-4 flex justify-end">
                <button onClick={openMemberModal} className={primaryBtn}><i className="fa-solid fa-user-plus" /> {t('communities.manageMembers')}</button>
              </div>
              {members.length === 0 ? <Empty text={t('communities.noMembers')} /> : (
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                  {members.map((m) => {
                    const name = m.firstName ? `${m.firstName} ${m.lastName}` : m.studentId;
                    const initials = `${(m.firstName || ' ')[0]}${(m.lastName || ' ')[0]}`.toUpperCase();
                    return (
                      <div key={m.id} className="group relative flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center shadow-sm">
                        <button
                          type="button"
                          onClick={() => void removeMember(m.studentId)}
                          className="absolute right-2 top-2 hidden size-6 items-center justify-center rounded-full bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 group-hover:flex transition-colors"
                          title="Quitar miembro"
                        >
                          <X className="size-3.5" />
                        </button>
                        {m.imageUrl
                          ? <img src={mediaUrl(m.imageUrl)} alt={name} className="size-14 rounded-full object-cover ring-2 ring-slate-100" />
                          : <div className="flex size-14 items-center justify-center rounded-full bg-red-50 text-lg font-bold text-red-500 ring-2 ring-slate-100">{initials}</div>
                        }
                        <div className="min-w-0 w-full">
                          <p className="truncate text-xs font-semibold text-slate-800">{name}</p>
                          {m.code && <p className="truncate text-[10px] text-slate-400">{m.code}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'Posts' && (
            <div className="space-y-4 px-1">
              {/* Compose box */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex gap-3">
                  {currentUserAvatar
                    ? <img src={mediaUrl(currentUserAvatar)} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                    : <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-sm font-bold text-red-500">{currentUserInitials}</div>
                  }
                  {!composeExpanded ? (
                    <button
                      type="button"
                      onClick={() => setComposeExpanded(true)}
                      className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-sm text-slate-400 hover:bg-slate-100 transition-colors"
                    >
                      ¿Qué querés compartir con la comunidad?
                    </button>
                  ) : (
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-500">
                          <Globe className="size-3" /> Público
                        </span>
                      </div>
                      <textarea
                        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                        placeholder="¿Qué querés compartir con la comunidad?"
                        rows={3}
                        value={composeDraft}
                        onChange={(e) => setComposeDraft(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) void submitNewPost(); }}
                      />
                      {/* Attachment preview */}
                      {composeAttachment && (
                        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          {composeAttachment.mediaType === 'image' && (
                            <img src={mediaUrl(composeAttachment.url)} alt="" className="max-h-48 w-full object-cover" />
                          )}
                          {composeAttachment.mediaType === 'video' && (
                            <video src={mediaUrl(composeAttachment.url)} controls className="max-h-48 w-full" />
                          )}
                          {composeAttachment.mediaType === 'document' && (
                            <div className="flex items-center gap-2 px-4 py-3">
                              <Paperclip className="size-4 text-slate-500" />
                              <a href={composeAttachment.url} target="_blank" rel="noreferrer" className="truncate text-sm text-blue-600 underline">{composeAttachment.url.split('/').pop()}</a>
                            </div>
                          )}
                          {composeAttachment.mediaType === 'link' && (
                            <div className="flex items-center gap-2 px-4 py-3">
                              <Link2 className="size-4 text-slate-500" />
                              <a href={composeAttachment.url} target="_blank" rel="noreferrer" className="truncate text-sm text-blue-600 underline">{composeAttachment.url}</a>
                            </div>
                          )}
                          <button type="button" onClick={() => setComposeAttachment(null)} className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Link input */}
                      {showLinkInput && !composeAttachment && (
                        <div className="flex gap-2">
                          <input
                            type="url"
                            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                            placeholder="https://..."
                            value={linkDraft}
                            onChange={(e) => setLinkDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLinkAttachment(); } }}
                            autoFocus
                          />
                          <button type="button" onClick={addLinkAttachment} disabled={!linkDraft.trim()} className="rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-40">Agregar</button>
                          <button type="button" onClick={() => { setShowLinkInput(false); setLinkDraft(''); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-500 hover:bg-slate-50">✕</button>
                        </div>
                      )}

                      <div className="flex items-center gap-3 border-t border-slate-100 pt-3">
                        <button type="button" title="Imagen" disabled={attachmentUploading} onClick={() => imageAttachRef.current?.click()} className="text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors">
                          <Camera className="size-5" />
                        </button>
                        <button type="button" title="Video" disabled={attachmentUploading} onClick={() => videoAttachRef.current?.click()} className="text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors">
                          <Video className="size-5" />
                        </button>
                        <button type="button" title="Documento" disabled={attachmentUploading} onClick={() => docAttachRef.current?.click()} className="text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors">
                          <Paperclip className="size-5" />
                        </button>
                        <button type="button" title="Link" onClick={() => { setShowLinkInput((v) => !v); setComposeAttachment(null); }} className={cn('transition-colors', showLinkInput ? 'text-blue-500' : 'text-slate-400 hover:text-slate-600')}>
                          <Link2 className="size-5" />
                        </button>
                        {attachmentUploading && <span className="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />}
                        <div className="flex-1" />
                        <button type="button" onClick={() => { setComposeExpanded(false); setComposeDraft(''); setComposeAttachment(null); setShowLinkInput(false); setLinkDraft(''); }} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700">
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => void submitNewPost()}
                          disabled={(!composeDraft.trim() && !composeAttachment) || composeSubmitting}
                          className="flex items-center gap-1.5 rounded-full bg-pink-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-pink-600 disabled:opacity-50 transition-colors"
                        >
                          {composeSubmitting
                            ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                            : <Send className="size-3.5" />}
                          Publicar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Posts feed */}
              {visiblePosts.length === 0 ? (
                <Empty text={t('communities.noPosts')} />
              ) : (
                visiblePosts.map((p) => {
                  const avatar = p.authorImageUrl || p.authorAvatarUrl;
                  const initials = `${(p.authorFirstName || p.authorName || ' ')[0]}${(p.authorLastName || ' ')[0]}`.toUpperCase().trim() || '?';
                  const isAuthor = p.authorId === userId;
                  return (
                    <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        {avatar
                          ? <img src={mediaUrl(avatar)} alt={p.authorName} className="size-10 shrink-0 rounded-full object-cover" />
                          : <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-sm font-bold text-red-500">{initials}</div>
                        }
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900">{p.authorName}</p>
                          <p className="text-xs text-slate-400">
                            {fmtDate(p.createdAt)} · {timeAgo(p.createdAt)}
                            {selected?.companyName ? ` · ${selected.companyName}` : ''}
                          </p>
                        </div>
                        {isAuthor && (
                          <button type="button" onClick={() => void deletePost(p.id)} className="shrink-0 text-slate-300 hover:text-red-400 transition-colors">
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>

                      {p.content && <p className="mt-3 text-sm leading-relaxed text-slate-700">{p.content}</p>}

                      {/* Attachment */}
                      {p.coverUrl && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
                          {p.mediaType === 'image' && (
                            <img src={mediaUrl(p.coverUrl)} alt="" className="max-h-72 w-full object-cover" />
                          )}
                          {p.mediaType === 'video' && (
                            <video src={mediaUrl(p.coverUrl)} controls className="max-h-72 w-full" />
                          )}
                          {p.mediaType === 'document' && (
                            <a href={mediaUrl(p.coverUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-slate-50 px-4 py-3 text-sm text-blue-600 hover:bg-slate-100">
                              <Paperclip className="size-4 shrink-0" />
                              <span className="truncate">{p.coverUrl.split('/').pop()}</span>
                            </a>
                          )}
                          {p.mediaType === 'link' && (
                            <a href={mediaUrl(p.coverUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-slate-50 px-4 py-3 text-sm text-blue-600 hover:bg-slate-100">
                              <Link2 className="size-4 shrink-0" />
                              <span className="truncate">{p.coverUrl}</span>
                            </a>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex items-center gap-5 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={() => void toggleLike(p.id)}
                          className={cn('flex items-center gap-1.5 text-sm transition-colors', p.likedByMe ? 'text-red-500' : 'text-slate-400 hover:text-red-400')}
                        >
                          <Heart className={cn('size-4', p.likedByMe && 'fill-current')} />
                          <span>{p.likesCount}</span>
                        </button>
                        <button type="button" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors">
                          <MessageCircle className="size-4" />
                          <span>Comentar</span>
                        </button>
                      </div>
                    </div>
                  );
                })
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
