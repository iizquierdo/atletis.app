import React, { useRef, useState, useEffect } from 'react';
import { Building2, Mail, Pencil, ShieldCheck, User } from 'lucide-react';
import { AppUser } from '../types';
import { ProfileHeader } from './shared/ProfileHeader';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface UserProfileProps {
  user?: AppUser;
  onRefresh?: () => void;
  onEdit?: () => void;
}

const nameInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
  }
  const p = parts[0] || '?';
  return (p.length >= 2 ? p.slice(0, 2) : `${p}${p}`).toUpperCase();
};

const Info: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-border dark:bg-card">
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
    <p className="mt-0.5 text-sm text-slate-800 dark:text-foreground">{value || '—'}</p>
  </div>
);

const UserProfile: React.FC<UserProfileProps> = ({ user, onRefresh, onEdit }) => {
  const profileName = user?.name || '—';
  const profileRole = user?.roleRef?.name || user?.role || '—';
  const profileEmail = user?.email || '—';
  const profileCompany = user?.company?.name || '—';
  const profileAvatar = user?.avatar || '';

  const [activeTab, setActiveTab] = useState<'Overview' | 'Security'>('Overview');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, [user?.id]);

  const resolveAvatarUrl = (avatar?: string) => {
    if (!avatar) return '';
    if (avatar.startsWith('http://') || avatar.startsWith('https://')) return avatar;
    if (avatar.startsWith('/')) return avatar;
    return avatar;
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const response = await fetch(`/api/users/${user.id}/avatar`, { method: 'POST', body: formData });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload avatar');
      }
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message || 'Error al subir la imagen');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Error al cambiar la contraseña');
        return;
      }
      toast.success('Contraseña actualizada');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Error al cambiar la contraseña');
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-border dark:bg-card dark:text-foreground';

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-10">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
      />

      <ProfileHeader
        title={profileName}
        initials={nameInitials(profileName)}
        imageUrl={resolveAvatarUrl(profileAvatar) || null}
        onLogoClick={() => fileInputRef.current?.click()}
        meta={[
          { icon: <User className="size-4" />, text: profileRole },
          { icon: <Building2 className="size-4" />, text: profileCompany },
          { icon: <Mail className="size-4" />, text: profileEmail },
        ]}
        tabs={[
          { id: 'Overview', label: 'Resumen' },
          { id: 'Security', label: 'Seguridad', icon: <ShieldCheck className="size-3.5" /> },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as typeof activeTab)}
        actions={
          <Button type="button" variant="outline" onClick={onEdit}>
            <Pencil className="size-3.5" /> Editar
          </Button>
        }
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-border dark:bg-card">
        {activeTab === 'Overview' && user && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Nombre" value={user.firstName || profileName.split(' ')[0]} />
            <Info label="Apellido" value={user.lastName || profileName.split(' ').slice(1).join(' ')} />
            <Info label="Email" value={user.email} />
            <Info label="Rol" value={user.roleRef?.name || user.role} />
            <Info label="Sucursal" value={user.company?.name} />
            <Info label="Idioma" value={user.language} />
          </div>
        )}

        {activeTab === 'Security' && (
          <div className="max-w-md space-y-5">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Cambiar contraseña</h4>
              <div className="mt-3 border-b border-slate-100 dark:border-border" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Contraseña actual</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Nueva contraseña</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Confirmar nueva contraseña</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSavePassword}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
              >
                Guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;
