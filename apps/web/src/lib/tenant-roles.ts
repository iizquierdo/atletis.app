type RoleLike = {
  id?: string;
  name?: string | null;
  totalUsers?: number | null;
  _count?: { users?: number | null } | null;
};

const normalizeRoleName = (name?: string | null) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export type TenantRoleKey = 'admin' | 'leader' | 'teacher';

export const tenantRoleKey = (role?: RoleLike | null): TenantRoleKey | null => {
  const name = normalizeRoleName(role?.name);
  if (name === 'administrator' || name === 'administrador') return 'admin';
  if (name === 'admin sede' || name === 'lider' || name === 'leader') return 'leader';
  if (name === 'profesor' || name === 'professor') return 'teacher';
  return null;
};

export const tenantRoleDisplayName = (role?: RoleLike | null) => {
  const key = tenantRoleKey(role);
  if (key === 'admin') return 'Administrador';
  if (key === 'leader') return 'Líder';
  if (key === 'teacher') return 'Profesor';
  return role?.name || '';
};

export const filterTenantRoles = <T extends RoleLike>(roles: T[]): T[] => {
  const byKey = new Map<TenantRoleKey, T>();
  for (const role of roles) {
    const key = tenantRoleKey(role);
    if (!key) continue;

    const current = byKey.get(key);
    const currentUsers = Number(current?.totalUsers ?? current?._count?.users ?? 0);
    const nextUsers = Number(role.totalUsers ?? role._count?.users ?? 0);
    if (!current || nextUsers > currentUsers) {
      byKey.set(key, role);
    }
  }

  return (['admin', 'leader', 'teacher'] as TenantRoleKey[])
    .map((key) => byKey.get(key))
    .filter(Boolean) as T[];
};
