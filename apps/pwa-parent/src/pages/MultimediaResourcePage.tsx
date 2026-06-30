import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import { extractErrorMessage } from "../lib/api";
import { fetchLibraryResources } from "../lib/data";
import { isDisplayableImageUrl } from "../lib/media";
import {
  collectMultimediaScope,
  getLibraryResourceLabel,
  getResourceVisuals
} from "../lib/multimedia";
import type { LibraryResource } from "../types";

const getDateValue = (v?: string | null) => {
  if (!v) return 0;
  const t = Date.parse(v);
  return Number.isNaN(t) ? 0 : t;
};

const formatDate = (v?: string | null) => {
  if (!v) return "Reciente";
  const t = Date.parse(v);
  if (Number.isNaN(t)) return "Reciente";
  return new Date(t).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
};

const extractYouTubeId = (v?: string | null) => {
  if (!v) return null;
  const raw = v.trim();
  const iframeSrc = raw.match(/src=["']([^"']+)["']/i)?.[1];
  const value = iframeSrc || raw;
  const directMatch = value.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (directMatch?.[1]) return directMatch[1];
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.replace("/", "").trim() || null;
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      if (url.pathname.startsWith("/embed/"))
        return url.pathname.split("/embed/")[1]?.split("/")[0] || null;
      if (url.pathname.startsWith("/shorts/"))
        return url.pathname.split("/shorts/")[1]?.split("/")[0] || null;
    }
  } catch {
    return null;
  }
  return null;
};

const getResourcePreview = (resource: LibraryResource, visuals: ReturnType<typeof getResourceVisuals>) => {
  const youtubeId = extractYouTubeId(resource.resourceUrl);
  if (youtubeId) {
    return {
      kind: "youtube" as const,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      imageUrl:
        resource.thumbnailUrl ?? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    };
  }

  const resourceImage =
    (resource.thumbnailUrl && isDisplayableImageUrl(resource.thumbnailUrl) ? resource.thumbnailUrl : null) ||
    (resource.resourceUrl && isDisplayableImageUrl(resource.resourceUrl) ? resource.resourceUrl : null);

  if (resourceImage) {
    return { kind: "image" as const, imageUrl: resourceImage, coverUrl: null as string | null, logoUrl: null as string | null };
  }

  if (visuals.coverUrl || visuals.imageUrl) {
    return {
      kind: "context" as const,
      imageUrl: null as string | null,
      coverUrl: visuals.coverUrl,
      logoUrl: visuals.imageUrl
    };
  }

  return { kind: "none" as const, imageUrl: null, coverUrl: null, logoUrl: null };
};

export const MultimediaResourcePage = () => {
  const { resourceId } = useParams<{ resourceId: string }>();
  const { students } = useStudents();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resources, setResources] = useState<LibraryResource[]>([]);

  const scope = useMemo(() => collectMultimediaScope(students), [students]);
  const { disciplineIds, classIds, scopeKey, disciplineNameById, classNameById } = scope;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const next = await fetchLibraryResources({ disciplineIds, classIds });
        if (cancelled) return;
        setResources(next);
      } catch (e) {
        if (cancelled) return;
        setError(extractErrorMessage(e));
        setResources([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [scopeKey, disciplineIds, classIds]);

  const resource = useMemo(
    () =>
      [...resources]
        .sort(
          (a, b) =>
            getDateValue(b.publishedAt ?? b.createdAt ?? null) -
            getDateValue(a.publishedAt ?? a.createdAt ?? null)
        )
        .find((r) => r.id === resourceId) ?? null,
    [resourceId, resources]
  );

  const visuals = resource ? getResourceVisuals(resource, scope) : null;
  const preview = resource && visuals ? getResourcePreview(resource, visuals) : null;
  const publishedLabel = formatDate(resource?.publishedAt ?? resource?.createdAt);
  const contextLabel = resource
    ? getLibraryResourceLabel(resource, { disciplineNameById, classNameById })
    : null;

  return (
    <div className="px-4 pb-6 pt-5">
      <Link
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        to="/multimedia"
      >
        <MaterialIcon name="arrow_back" className="text-base" />
        Volver a Biblioteca
      </Link>

      {loading && (
        <div className="rounded-3xl bg-white p-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <p className="text-sm text-slate-400">Cargando recurso...</p>
        </div>
      )}

      {error && (
        <div className="rounded-3xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {!loading && !error && !resource && (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-white p-10 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <MaterialIcon name="library_books" className="text-4xl text-slate-200" />
          <p className="text-sm text-slate-400">
            No encontramos este recurso para los alumnos vinculados a tu cuenta.
          </p>
        </div>
      )}

      {!loading && !error && resource && preview && (
        <div className="overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
          <div className="relative bg-slate-100" style={{ aspectRatio: "16/9" }}>
            {preview.kind === "youtube" ? (
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full"
                referrerPolicy="strict-origin-when-cross-origin"
                src={preview.embedUrl}
                title={resource.title}
              />
            ) : preview.kind === "image" && preview.imageUrl ? (
              <img
                alt={resource.title}
                className="h-full w-full object-cover"
                src={preview.imageUrl}
              />
            ) : preview.kind === "context" && preview.coverUrl ? (
              <>
                <img
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  src={preview.coverUrl}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
                {preview.logoUrl ? (
                  <div className="absolute left-5 top-5">
                    <img
                      alt={contextLabel ?? resource.title}
                      className="h-14 w-14 rounded-xl object-cover ring-2 ring-white/30 shadow-lg"
                      src={preview.logoUrl}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <MaterialIcon name="library_books" className="text-5xl text-slate-300" />
              </div>
            )}
          </div>

          <div className="p-5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
              Recurso completo
            </span>
            <h1 className="mt-2 text-xl font-bold text-slate-900">{resource.title}</h1>

            <div className="mt-2 flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                {contextLabel}
              </span>
              <span className="text-[11px] text-slate-400">{publishedLabel}</span>
            </div>

            {resource.description && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                {resource.description.split(/\r?\n/).map((paragraph, i) => (
                  <p
                    key={`${resource.id}-${i}`}
                    className="text-sm leading-relaxed text-slate-700"
                  >
                    {paragraph || " "}
                  </p>
                ))}
              </div>
            )}

            {resource.resourceUrl && preview.kind !== "youtube" && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Abrir recurso
                </h2>
                <a
                  className="mt-2 flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] py-3.5 text-sm font-semibold text-white shadow-lg transition-opacity hover:opacity-90"
                  href={resource.resourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Ver contenido original
                  <MaterialIcon name="open_in_new" className="text-sm" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
