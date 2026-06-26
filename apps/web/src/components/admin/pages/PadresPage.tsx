import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, Pencil, Search, Trash2 } from 'lucide-react';
import { adminFetch } from '../api';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardHeading,
  CardTable,
  CardTitle,
  CardToolbar
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import { DataGridColumnHeader } from '@/components/ui/data-grid-column-header';
import { DataGridTable } from '@/components/ui/data-grid-table';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input, inputVariants } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch, SwitchWrapper } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ParentRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string;
  phone: string | null;
  document: string | null;
  companyId: string;
  companyName: string | null;
  organizationId: string;
  organizationName: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

interface CompanyOption {
  id: string;
  name: string;
  organizationId: string;
  organizationName: string;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  document: string;
  companyId: string;
  password: string;
  active: boolean;
}

const emptyForm = (): FormState => ({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  document: '',
  companyId: '',
  password: '',
  active: true
});

const PadresPage: React.FC = () => {
  const [rows, setRows] = useState<ParentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setStatus(null);
    try {
      const res = await adminFetch('/api/admin/parents');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar los padres');
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!modalOpen) return;
    void (async () => {
      try {
        const res = await adminFetch('/api/admin/parents/companies');
        const data = await res.json();
        if (!res.ok) return;
        setCompanyOptions(Array.isArray(data) ? data : []);
      } catch {
        setCompanyOptions([]);
      }
    })();
  }, [modalOpen]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        `${row.firstName || ''} ${row.lastName || ''}`,
        row.email,
        row.phone || '',
        row.document || '',
        row.companyName || '',
        row.organizationName || ''
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchTerm]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
    setStatus(null);
  }, []);

  const openEdit = useCallback((row: ParentRow) => {
    setEditingId(row.id);
    setForm({
      firstName: row.firstName || '',
      lastName: row.lastName || '',
      email: row.email || '',
      phone: row.phone || '',
      document: row.document || '',
      companyId: row.companyId || '',
      password: '',
      active: Boolean(row.emailVerifiedAt)
    });
    setModalOpen(true);
    setStatus(null);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingId(null);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setStatus({ type: 'error', message: 'Nombre y apellido son obligatorios.' });
      return;
    }
    if (!form.email.trim()) {
      setStatus({ type: 'error', message: 'El email es obligatorio.' });
      return;
    }
    if (!form.companyId) {
      setStatus({ type: 'error', message: 'La sede es obligatoria.' });
      return;
    }
    if (!editingId && !form.password) {
      setStatus({ type: 'error', message: 'La contraseña es obligatoria.' });
      return;
    }

    const payload: Record<string, unknown> = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      document: form.document.trim() || null,
      companyId: form.companyId
    };
    if (editingId) payload.active = form.active;
    if (form.password) payload.password = form.password;

    setSaving(true);
    setStatus(null);
    try {
      const url = editingId ? `/api/admin/parents/${editingId}` : '/api/admin/parents';
      const res = await adminFetch(url, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo guardar');
      await load();
      closeModal();
      setStatus({ type: 'success', message: editingId ? 'Padre actualizado.' : 'Padre creado.' });
    } catch (e: unknown) {
      setStatus({ type: 'error', message: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally {
      setSaving(false);
    }
  };

  const remove = useCallback(
    async (row: ParentRow) => {
      const label = `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.email;
      if (!window.confirm(`¿Eliminar al padre ${label}? Esta acción no se puede deshacer.`)) return;
      setStatus(null);
      try {
        const res = await adminFetch(`/api/admin/parents/${row.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'No se pudo eliminar');
        await load();
        setStatus({ type: 'success', message: 'Padre eliminado.' });
      } catch (e: unknown) {
        setStatus({ type: 'error', message: e instanceof Error ? e.message : 'No se pudo eliminar' });
      }
    },
    [load]
  );

  const columns = useMemo<ColumnDef<ParentRow>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => `${row.firstName || ''} ${row.lastName || ''}`,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Nombre" />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-semibold text-foreground">
              {`${row.original.firstName || ''} ${row.original.lastName || ''}`.trim() || '—'}
            </p>
            <p className="text-muted-foreground text-[11px] font-medium">{row.original.email}</p>
          </div>
        )
      },
      {
        id: 'phone',
        accessorFn: (row) => row.phone || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Teléfono" />,
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.phone || '—'}</span>
      },
      {
        id: 'document',
        accessorFn: (row) => row.document || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Documento" />,
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.document || '—'}</span>
      },
      {
        id: 'sede',
        accessorFn: (row) => row.companyName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Sede" />,
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.companyName || '—'}</span>
      },
      {
        id: 'organization',
        accessorFn: (row) => row.organizationName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Organización" />,
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.organizationName || '—'}</span>
      },
      {
        id: 'active',
        accessorFn: (row) => (row.emailVerifiedAt ? 'Activa' : 'Pendiente'),
        header: ({ column }) => <DataGridColumnHeader column={column} title="Cuenta" />,
        cell: ({ row }) => (
          <span
            className={cn(
              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
              row.original.emailVerifiedAt ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
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
            Acciones
          </span>
        ),
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Button type="button" mode="icon" size="sm" variant="outline" className="size-8" onClick={() => openEdit(p)} aria-label="Editar">
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                mode="icon"
                size="sm"
                variant="outline"
                className="size-8 text-destructive hover:bg-destructive/10"
                onClick={() => void remove(p)}
                aria-label="Eliminar"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          );
        }
      }
    ],
    [openEdit, remove]
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const emptyMessage = rows.length === 0 && !loading ? 'No hay padres todavía.' : 'Sin coincidencias.';
  const selectClass = cn(inputVariants({ variant: 'md' }), 'cursor-pointer');

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="mb-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Padres</h2>
        <p className="mt-1 mb-10 text-sm font-medium text-slate-500">
          Alta, baja y modificación de padres/responsables (cuentas con rol Tutor) de todas las organizaciones.
        </p>
      </div>

      {loadError && (
        <Alert variant="destructive" appearance="light" size="md">
          <AlertIcon>
            <AlertCircle className="size-5" />
          </AlertIcon>
          <AlertContent>
            <AlertDescription>{loadError}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      {status && !modalOpen && (
        <Alert variant={status.type === 'success' ? 'success' : 'destructive'} appearance="light" size="md">
          <AlertIcon>
            {status.type === 'success' ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}
          </AlertIcon>
          <AlertContent>
            <AlertDescription>{status.message}</AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>Padres</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder="Buscar padres..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn('ps-9')}
                aria-label="Buscar padres"
              />
            </div>
            <Button type="button" variant="primary" onClick={openCreate}>
              Nuevo padre
            </Button>
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filteredRows.length}
            isLoading={loading}
            loadingMessage="Cargando padres..."
            emptyMessage={emptyMessage}
            tableLayout={{ rowBorder: true, headerBackground: true, headerBorder: true, width: 'auto' }}
          >
            <div className="overflow-x-auto">
              <DataGridTable />
            </div>
          </DataGrid>
        </CardTable>
      </Card>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" showCloseButton>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar padre' : 'Nuevo padre'}</DialogTitle>
          </DialogHeader>
          {status && modalOpen && (
            <Alert variant={status.type === 'success' ? 'success' : 'destructive'} appearance="light" size="sm" className="mb-2">
              <AlertIcon>
                {status.type === 'success' ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
              </AlertIcon>
              <AlertContent>
                <AlertDescription>{status.message}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <DialogBody>
            <form onSubmit={(e) => void submit(e)} id="admin-parent-form" className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="p-first" className="text-xs">Nombre *</Label>
                  <Input id="p-first" required value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-last" className="text-xs">Apellido *</Label>
                  <Input id="p-last" required value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-email" className="text-xs">Email *</Label>
                  <Input id="p-email" type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-phone" className="text-xs">Teléfono</Label>
                  <Input id="p-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-doc" className="text-xs">Documento</Label>
                  <Input id="p-doc" value={form.document} onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-company" className="text-xs">Sede *</Label>
                  <select
                    id="p-company"
                    className={selectClass}
                    required
                    value={form.companyId}
                    onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {companyOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.organizationName} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="p-pass" className="text-xs">
                    {editingId ? 'Contraseña (dejar en blanco para no cambiar)' : 'Contraseña *'}
                  </Label>
                  <Input
                    id="p-pass"
                    type="password"
                    required={!editingId}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  />
                </div>
                {editingId && (
                  <div className="md:col-span-2 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="p-active" className="text-sm font-semibold">
                          Cuenta activa
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Al activar la cuenta, el padre puede iniciar sesion sin usar el enlace de email.
                        </p>
                      </div>
                      <SwitchWrapper>
                        <Switch
                          id="p-active"
                          checked={form.active}
                          onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
                          disabled={saving}
                        />
                      </SwitchWrapper>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </DialogBody>
          <DialogFooter className="border-t border-border pt-4 sm:space-x-2">
            <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="admin-parent-form" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PadresPage;
