import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import { api, extractErrorMessage } from "../lib/api";
import type { DisciplineResource, StudentDiscipline } from "../types";

const isActiveDiscipline = (discipline: StudentDiscipline) => discipline.status === "ACTIVE";

const getDateValue = (value?: string | null) => {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const formatDate = (value?: string | null) => {
  if (!value) return "Reciente";

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "Reciente";

  return new Date(timestamp).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
};

const isImageUrl = (value: string) => {
  const normalized = value.split("?")[0].toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"].some((extension) =>
    normalized.endsWith(extension)
  );
};

const extractYouTubeId = (value?: string | null) => {
  if (!value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const id = url.pathname.replace("/", "").trim();
      return id || null;
    }

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }

      if (url.pathname.startsWith("/embed/")) {
        const id = url.pathname.split("/embed/")[1]?.split("/")[0];
        return id || null;
      }

      if (url.pathname.startsWith("/shorts/")) {
        const id = url.pathname.split("/shorts/")[1]?.split("/")[0];
        return id || null;
      }
    }
  } catch {
    return null;
  }

  return null;
};

const getResourcePreview = (resource: DisciplineResource) => {
  const youtubeId = extractYouTubeId(resource.resourceUrl);
  if (youtubeId) {
    return {
      kind: "youtube" as const,
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      imageUrl: resource.thumbnailUrl ?? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    };
  }

  const mediaUrl = resource.thumbnailUrl ?? resource.resourceUrl ?? null;
  if (!mediaUrl) {
    return { kind: "none" as const, imageUrl: null };
  }

  if (isImageUrl(mediaUrl)) {
    return { kind: "image" as const, imageUrl: mediaUrl };
  }

  return { kind: "external" as const, imageUrl: resource.thumbnailUrl ?? null };
};

export const MultimediaResourcePage = () => {
  const { resourceId } = useParams<{ resourceId: string }>();
  const { students } = useStudents();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resources, setResources] = useState<DisciplineResource[]>([]);

  const disciplineAssignments = useMemo(
    () => students.flatMap((student) => student.disciplines ?? []).filter(isActiveDiscipline),
    [students]
  );

  const disciplineIds = useMemo(
    () =>
      Array.from(
        new Set(disciplineAssignments.map((assignment) => assignment.discipline.id).filter(Boolean))
      ),
    [disciplineAssignments]
  );

  const disciplineIdsKey = useMemo(() => disciplineIds.join("|"), [disciplineIds]);

  const disciplineNameById = useMemo(() => {
    const map: Record<string, string> = {};
    disciplineAssignments.forEach((assignment) => {
      map[assignment.discipline.id] = assignment.discipline.name;
    });
    return map;
  }, [disciplineAssignments]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const resourceResults = await Promise.allSettled(
          disciplineIds.map((disciplineId) =>
            api.get<DisciplineResource[]>(`/disciplines/${disciplineId}/resources`, {
              params: { active: true }
            })
          )
        );

        const nextResources = resourceResults.flatMap((result) =>
          result.status === "fulfilled" ? result.value.data : []
        );

        if (cancelled) return;
        setResources(nextResources);
      } catch (requestError) {
        if (cancelled) return;
        setError(extractErrorMessage(requestError));
        setResources([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [disciplineIdsKey]);

  const resource = useMemo(
    () =>
      [...resources]
        .sort(
          (a, b) =>
            getDateValue(b.publishedAt ?? b.createdAt ?? null) -
            getDateValue(a.publishedAt ?? a.createdAt ?? null)
        )
        .find((item) => item.id === resourceId) ?? null,
    [resourceId, resources]
  );

  const preview = resource ? getResourcePreview(resource) : null;
  const publishedLabel = formatDate(resource?.publishedAt ?? resource?.createdAt);

  return (
    <div className="screen-stack social-screen social-article-page">
      <Link className="social-article-back" to="/multimedia">
        <MaterialIcon name="arrow_back" />
        Volver a Biblioteca
      </Link>

      {loading && (
        <article className="empty-state-card">
          <p>Cargando recurso...</p>
        </article>
      )}

      {error && (
        <article className="empty-state-card">
          <p>{error}</p>
        </article>
      )}

      {!loading && !error && !resource && (
        <article className="empty-state-card">
          <p>No encontramos este recurso para los alumnos vinculados a tu cuenta.</p>
        </article>
      )}

      {!loading && !error && resource && (
        <article className="social-featured-card social-article-card">
          <div className="social-featured-media social-article-media multimedia-resource-media">
            {preview?.kind === "youtube" ? (
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                src={preview.embedUrl}
                title={resource.title}
              />
            ) : preview?.kind === "image" && preview.imageUrl ? (
              <img alt={resource.title} src={preview.imageUrl} />
            ) : preview?.imageUrl ? (
              <img alt={resource.title} src={preview.imageUrl} />
            ) : (
              <div className="social-featured-placeholder">
                <MaterialIcon name="library_books" />
              </div>
            )}
          </div>

          <div className="social-featured-content social-article-content">
            <span>Recurso completo</span>
            <h1>{resource.title}</h1>

            <div className="social-article-meta">
              <small>{disciplineNameById[resource.disciplineId] ?? "Disciplina"}</small>
              <small>{publishedLabel}</small>
            </div>

            {resource.description && (
              <div className="social-article-body">
                {resource.description.split(/\r?\n/).map((paragraph, index) => (
                  <p key={`${resource.id}-${index}`}>{paragraph || "\u00A0"}</p>
                ))}
              </div>
            )}

            {resource.resourceUrl && preview?.kind !== "youtube" && (
              <div className="social-article-attachments">
                <h2>Abrir recurso</h2>
                <div className="social-article-links">
                  <a href={resource.resourceUrl} rel="noreferrer" target="_blank">
                    Ver contenido original
                    <MaterialIcon name="open_in_new" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </article>
      )}
    </div>
  );
};
