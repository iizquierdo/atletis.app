import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle, Download, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  example?: string;
}

export interface ImportResult {
  success: number;
  errors: { row: number; message: string }[];
}

interface Props {
  title: string;
  templateFilename: string;
  columns: ImportColumn[];
  onImport: (rows: Record<string, string>[]) => Promise<ImportResult>;
  onClose: () => void;
}

type Step = 'idle' | 'preview' | 'importing' | 'done';

export const ImportModal: React.FC<Props> = ({ title, templateFilename, columns, onImport, onClose }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('idle');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      columns.map((c) => c.header),
      columns.map((c) => c.example ?? ''),
    ]);
    ws['!cols'] = columns.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
    XLSX.writeFile(wb, templateFilename);
  };

  const parseFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      const wb = XLSX.read(data, { type: 'binary', cellText: true, cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false });
      const headerToKey: Record<string, string> = {};
      columns.forEach((c) => { headerToKey[c.header] = c.key; });
      const mapped = raw.map((r) => {
        const row: Record<string, string> = {};
        Object.entries(r).forEach(([h, v]) => {
          const key = headerToKey[String(h).trim()];
          if (key) row[key] = String(v ?? '').trim();
        });
        return row;
      });
      setRows(mapped);
      setStep('preview');
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  };

  const startImport = async () => {
    setStep('importing');
    const res = await onImport(rows);
    setResult(res);
    setStep('done');
  };

  const reset = () => { setRows([]); setFileName(''); setStep('idle'); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 text-base leading-none">✕</button>
        </div>

        {/* Download template */}
        <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-700">Plantilla Excel</p>
            <p className="text-xs text-slate-400">Descargá la plantilla, completá los datos e importá</p>
          </div>
          <Button type="button" variant="outline" onClick={downloadTemplate} className="shrink-0 gap-1.5">
            <Download className="size-4" />
            Descargar
          </Button>
        </div>

        {/* Column chips */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {columns.map((c) => (
            <span
              key={c.key}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${c.required ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}
            >
              {c.header}{c.required ? ' *' : ''}
            </span>
          ))}
          <span className="text-[10px] text-slate-400 self-center">* requerido</span>
        </div>

        {/* Upload zone */}
        {step === 'idle' && (
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-10 text-center transition-colors hover:border-red-300 hover:bg-red-50/30"
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <FileSpreadsheet className="size-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">Arrastrá tu archivo o hacé clic para seleccionar</p>
            <p className="text-xs text-slate-400">.xlsx o .xls</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ''; }}
            />
          </div>
        )}

        {/* Preview */}
        {step === 'preview' && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-600 truncate">{fileName}</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 shrink-0">{rows.length} filas</span>
              <button onClick={reset} className="ml-auto text-xs text-slate-400 hover:text-slate-600 shrink-0">Cambiar</button>
            </div>
            <div className="mb-4 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    {columns.map((c) => (
                      <th key={c.key} className="whitespace-nowrap px-3 py-2 font-semibold text-slate-500">{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {columns.map((c) => (
                        <td key={c.key} className="max-w-[120px] truncate px-3 py-2 text-slate-700">{row[c.key] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && (
                <p className="px-3 py-2 text-xs text-slate-400">… y {rows.length - 5} filas más</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={reset}>Cancelar</Button>
              <Button type="button" variant="primary" onClick={startImport}>
                Importar {rows.length} {rows.length === 1 ? 'fila' : 'filas'}
              </Button>
            </div>
          </div>
        )}

        {/* Importing spinner */}
        {step === 'importing' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="size-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
            <p className="text-sm text-slate-600">Importando datos…</p>
          </div>
        )}

        {/* Results */}
        {step === 'done' && result && (
          <div className="space-y-3">
            {result.success > 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3">
                <CheckCircle className="size-5 shrink-0 text-emerald-500" />
                <p className="text-sm font-semibold text-emerald-700">
                  {result.success} {result.success === 1 ? 'registro importado' : 'registros importados'} correctamente
                </p>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <AlertCircle className="size-5 shrink-0 text-red-500" />
                  <p className="text-sm font-semibold text-red-700">
                    {result.errors.length} {result.errors.length === 1 ? 'error' : 'errores'}
                  </p>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {result.errors.map((e) => (
                    <p key={e.row} className="text-xs text-red-600">Fila {e.row}: {e.message}</p>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button type="button" variant="primary" onClick={onClose}>Cerrar</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportModal;
