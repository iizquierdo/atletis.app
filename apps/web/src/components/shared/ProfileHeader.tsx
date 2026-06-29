import React from 'react';
import { ArrowLeft, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/media';

export interface ProfileHeaderTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface ProfileHeaderMeta {
  icon?: React.ReactNode;
  text: React.ReactNode;
}

export interface ProfileHeaderProps {
  title: string;
  /** Initials shown in the avatar box when no image/icon is provided. */
  initials?: string;
  imageUrl?: string | null;
  /** Icon rendered inside the avatar box (alternative to initials). */
  icon?: React.ReactNode;
  /** Wide banner image behind the avatar. Falls back to the gradient when absent. */
  coverUrl?: string | null;
  meta?: ProfileHeaderMeta[];
  tabs: ProfileHeaderTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onBack?: () => void;
  /** When set, the avatar becomes a button with a hover overlay (e.g. to upload a logo). */
  onLogoClick?: () => void;
  /** When set, the banner becomes a button with a hover overlay (e.g. to upload a cover). */
  onCoverClick?: () => void;
  /** Right-aligned actions over the name row (e.g. an Edit button). */
  actions?: React.ReactNode;
}

/**
 * "My Profile"-style header card (gradient banner + overlapping avatar + meta +
 * tabs), matching `components/UserAccount`. Use it for entity detail screens so
 * tenant/module detail views look consistent with the profile page.
 */
export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  title,
  initials,
  imageUrl,
  icon,
  coverUrl,
  meta = [],
  tabs,
  activeTab,
  onTabChange,
  onBack,
  onLogoClick,
  onCoverClick,
  actions
}) => {
  const resolvedCoverUrl = resolveMediaUrl(coverUrl);
  const resolvedImageUrl = resolveMediaUrl(imageUrl);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
      <div className="relative h-32 bg-gradient-to-r from-primary to-primary/75">
        {resolvedCoverUrl ? (
          <img src={resolvedCoverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}

        {onCoverClick ? (
          <button
            type="button"
            onClick={onCoverClick}
            aria-label="Change cover"
            className="group absolute inset-0 flex items-center justify-center transition-colors hover:bg-black/30"
          >
            <span className="flex items-center gap-2 rounded-xl bg-black/45 px-3 py-1.5 text-xs font-semibold text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              <Camera className="size-4" /> {coverUrl ? 'Cambiar portada' : 'Subir portada'}
            </span>
          </button>
        ) : null}

        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 px-8 pb-8 md:flex-row">
        <div className="relative -mt-12">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-xl dark:border-card">
            {resolvedImageUrl ? (
              <img src={resolvedImageUrl} alt={title} className="h-full w-full object-cover" />
            ) : icon ? (
              <span className="flex h-full w-full items-center justify-center bg-primary/15 text-3xl text-primary">{icon}</span>
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-primary/15 text-3xl font-bold text-primary">
                {initials || '?'}
              </span>
            )}
          </div>
          {onLogoClick ? (
            <button
              type="button"
              onClick={onLogoClick}
              aria-label="Change logo"
              className="group absolute inset-0 flex items-center justify-center rounded-2xl transition-colors hover:bg-black/30"
            >
              <span className="flex items-center justify-center rounded-full bg-black/45 p-2 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                <Camera className="size-4" />
              </span>
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex flex-1 items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h2>
            {meta.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-4">
                {meta.map((item, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                    {item.icon ? <span className="text-slate-400">{item.icon}</span> : null}
                    {item.text}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-8 border-t border-slate-100 px-8 dark:border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-2 border-b-2 py-4 text-xs font-bold uppercase tracking-widest transition-all',
              activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-slate-400 hover:text-slate-600'
            )}
          >
            {tab.icon ? <span className="flex items-center">{tab.icon}</span> : null}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default ProfileHeader;
