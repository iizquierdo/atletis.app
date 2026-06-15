import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  meta?: ProfileHeaderMeta[];
  tabs: ProfileHeaderTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  onBack?: () => void;
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
  meta = [],
  tabs,
  activeTab,
  onTabChange,
  onBack,
  actions
}) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
      <div className="relative h-32 bg-gradient-to-r from-primary to-primary/75">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          >
            <ArrowLeft className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 px-8 pb-8 md:flex-row">
        <div className="relative -mt-12">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-white shadow-xl dark:border-card">
            {imageUrl ? (
              <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
            ) : icon ? (
              <span className="flex h-full w-full items-center justify-center bg-primary/15 text-3xl text-primary">{icon}</span>
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-primary/15 text-3xl font-bold text-primary">
                {initials || '?'}
              </span>
            )}
          </div>
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
