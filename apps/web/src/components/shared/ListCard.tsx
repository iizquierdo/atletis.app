import React from 'react';
import type { Table } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
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
import { DataGridTable } from '@/components/ui/data-grid-table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ListCardProps<T extends object> {
  /** Context title shown above the card. */
  title: string;
  /** Optional descriptive line under the title. */
  description?: string;
  /** Header title inside the card (rendered uppercase by CardTitle). */
  cardTitle: string;
  searchPlaceholder: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  /** Primary action label (e.g. "+ Nuevo …"). Omit to hide the button. */
  primaryLabel?: string;
  onPrimary?: () => void;
  /** Configured TanStack table instance (the caller owns columns + sorting). */
  table: Table<T>;
  recordCount: number;
  emptyMessage: string;
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  /** Extra content rendered in the toolbar before the primary button (filters, etc.). */
  toolbarExtras?: React.ReactNode;
}

/**
 * Standard Sinapsis list screen (card + searchable, sortable DataGrid + primary
 * action), matching `settings/CompaniesSettingsTable`. Use this for every product
 * list so tenant and module screens stay visually consistent.
 */
export function ListCard<T extends object>({
  title,
  description,
  cardTitle,
  searchPlaceholder,
  searchTerm,
  onSearchChange,
  primaryLabel,
  onPrimary,
  table,
  recordCount,
  emptyMessage,
  isLoading,
  onRowClick,
  toolbarExtras
}: ListCardProps<T>) {
  return (
    <div className="w-full animate-in fade-in duration-500 pb-20">
      <div className="mb-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h2>
        {description ? <p className="mt-1 font-medium text-slate-500">{description}</p> : null}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="min-h-0 flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <CardHeading>
            <CardTitle>{cardTitle}</CardTitle>
          </CardHeading>
          <CardToolbar className="w-full flex-wrap justify-stretch gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute start-3 top-1/2 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className={cn('ps-9')}
                aria-label={searchPlaceholder}
              />
            </div>
            {toolbarExtras}
            {primaryLabel && onPrimary ? (
              <Button type="button" variant="primary" onClick={onPrimary}>
                <Plus className="size-4" />
                {primaryLabel}
              </Button>
            ) : null}
          </CardToolbar>
        </CardHeader>
        <CardTable className="p-0">
          <DataGrid
            table={table}
            recordCount={recordCount}
            emptyMessage={emptyMessage}
            isLoading={isLoading}
            onRowClick={onRowClick}
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
}

export default ListCard;
