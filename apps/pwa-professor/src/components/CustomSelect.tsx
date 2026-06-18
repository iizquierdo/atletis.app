import { useEffect, useRef, useState } from "react";
import { MaterialIcon } from "./MaterialIcon";

export interface SelectOption {
  value: string;
  label: string;
}

export interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const CustomSelect = ({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  className = ""
}: CustomSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const showSearch = options.length > 3;

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleOutside);
      if (showSearch) setTimeout(() => searchRef.current?.focus(), 60);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open, showSearch]);

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-xl border bg-white px-3.5 py-2 text-[13px] font-medium outline-none transition-colors ${
          open
            ? "border-[var(--primary)] ring-2 ring-[var(--primary)]/10"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <span className={selected ? "text-slate-800" : "text-slate-400"}>
          {selected?.label ?? placeholder}
        </span>
        <MaterialIcon
          name={open ? "expand_less" : "expand_more"}
          className="text-[18px] text-slate-400"
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_rgb(0,0,0,0.12)]">
          {showSearch && (
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <MaterialIcon name="search" className="shrink-0 text-[16px] text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder-slate-400"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="text-slate-400">
                  <MaterialIcon name="close" className="text-[14px]" />
                </button>
              )}
            </div>
          )}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3.5 py-3 text-[12px] text-slate-400">Sin resultados</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full items-center justify-between px-3.5 py-2.5 text-[13px] text-left transition-colors hover:bg-slate-50 ${
                    opt.value === value
                      ? "font-semibold text-[var(--primary)]"
                      : "text-slate-700"
                  }`}
                >
                  <span>{opt.label}</span>
                  {opt.value === value && (
                    <MaterialIcon name="check" className="text-[16px] text-[var(--primary)]" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
