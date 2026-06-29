import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table';
import { AlertCircle, Search } from 'lucide-react';
import { adminFetch } from '../api';
import { Alert, AlertContent, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { Card, CardHeader, CardHeading, CardTable, CardTitle, CardToolbar } from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import { DataGridColumnHeader } from '@/components/ui/data-grid-column-header';
import { DataGridTable } from '@/components/ui/data-grid-table';
import { Input } from '@/components/ui/input';
import { mediaUrl } from '@/lib/media';
import { cn } from '@/lib/utils';

interface ResourceRow {
  id: string;
  title: string;
  disciplineName: string | null;
  type: string;
  visibility: string;
  resourceUrl: string | null;
  createdByName: string | null;
  active: boolean;
}

const labelize = (raw: string) =>
  String(raw || '')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const DisciplineResourcesAdminPage: React.FC = () => {
  const [rows, setRows] = useState<ResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminFetch('/api/admin/discipline-resources');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar los recursos');
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

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [row.title, row.disciplineName || '', row.type, row.visibility, row.createdByName || '']
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, searchTerm]);

  const columns = useMemo<ColumnDef<ResourceRow>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (row) => row.title,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Recurso" />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-semibold text-foreground">{row.original.title}</p>
            {row.original.resourceUrl && (
              <a
                href={mediaUrl(row.original.resourceUrl)}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Abrir enlace
              </a>
            )}
          </div>
        )
      },
      {
        id: 'discipline',
        accessorFn: (row) => row.disciplineName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Disciplina" />,
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.disciplineName || '—'}</span>
      },
      {
        id: 'type',
        accessorFn: (row) => row.type,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Tipo" />,
        cell: ({ row }) => <span className="text-sm font-medium">{labelize(row.original.type)}</span>
      },
      {
        id: 'visibility',
        accessorFn: (row) => row.visibility,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Visibilidad" />,
        cell: ({ row }) => (
          <span
            className={cn(
              'rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
              row.original.visibility === 'PUBLIC'
                ? 'bg-emerald-50 text-emerald-600'
                : row.original.visibility === 'ADMIN_ONLY'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-amber-50 text-amber-600'
            )}
          >
            {labelize(row.original.visibility)}
          </span>
        )
      },
      {
        id: 'createdBy',
        accessorFn: (row) => row.createdByName || '',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Creado por" />,
        cell: ({ row }) => <span className="text-sm font-medium">{row.original.createdByName || '—'}</span>
      }
    ],
    []
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const emptyMessage = rows.length === 0 && !loading ? 'No hay recursos todavía.' : 'Sin coincidencias.';

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="mb-2">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Recursos de Disciplinas</h2>
        <p className="mt-1 mb-10 text-sm font-medium text-slate-500">
          Biblioteca de recursos de todas las disciplinas y organizaciones.
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

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>Recursos de Disciplinas</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder="Buscar recursos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ps-9"
                aria-label="Buscar recursos"
              />
            </div>
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={filteredRows.length}
            isLoading={loading}
            loadingMessage="Cargando recursos..."
            emptyMessage={emptyMessage}
            tableLayout={{ rowBorder: true, headerBackground: true, headerBorder: true, width: 'auto' }}
          >
            <div className="overflow-x-auto">
              <DataGridTable />
            </div>
          </DataGrid>
        </CardTable>
      </Card>
    </div>
  );
};

export default DisciplineResourcesAdminPage;
