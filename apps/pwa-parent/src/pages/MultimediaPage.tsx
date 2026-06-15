import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import { api, extractErrorMessage } from "../lib/api";
import type { DisciplineResource, StudentDiscipline } from "../types";

type MediaKind = "image" | "video" | "file";

interface MediaItem {
  id: string;
  title: string;
  subtitle: string;
  previewUrl: string | null;
  href: string | null;
  kind: MediaKind;
  date: string | null;
}

const isActiveDiscipline = (discipline: StudentDiscipline) => discipline.status === "ACTIVE";

const getDateValue = (value?: string | null) => {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const isImageUrl = (value: string) => {
  const normalized = value.split("?")[0].toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"].some((extension) =>
    normalized.endsWith(extension)
  );
};

const isVideoUrl = (value: string) => {
  const normalized = value.split("?")[0].toLowerCase();
  return [".mp4", ".webm", ".mov", ".m3u8"].some((extension) => normalized.endsWith(extension));
};

const getMediaKindFromUrl = (value: string, mimeType?: string | null): MediaKind => {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  if (isVideoUrl(value)) return "video";
  if (isImageUrl(value)) return "image";
  return "file";
};

const dedupeMedia = (items: MediaItem[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.previewUrl ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const MultimediaPage = () => {
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

  const mediaItems = useMemo(() => {
    const items = resources.map<MediaItem>((resource) => {
      const previewUrl = resource.thumbnailUrl ?? resource.resourceUrl ?? null;
      const kind =
        previewUrl && resource.type === "EXERCISE_VIDEO"
          ? "video"
          : previewUrl
            ? getMediaKindFromUrl(previewUrl)
            : "file";

      return {
        id: resource.id,
        title: resource.title,
        subtitle: disciplineNameById[resource.disciplineId] ?? "Disciplina",
        previewUrl,
        href: resource.resourceUrl ?? resource.thumbnailUrl ?? null,
        kind,
        date: resource.publishedAt ?? resource.createdAt ?? null
      };
    });

    return dedupeMedia(items).sort((a, b) => getDateValue(b.date) - getDateValue(a.date));
  }, [disciplineNameById, resources]);

  const mainMedia = mediaItems[0] ?? null;
  const sideMedia = mediaItems.slice(1, 4);

  const emptyMessage = "No hay recursos multimedia publicados todavia para las disciplinas de tus alumnos.";

  return (
    <div className="screen-stack multimedia-screen">
      {error && (
        <div className="error-banner">
          <MaterialIcon className="error-banner-icon" name="warning" />
          <span>{error}</span>
        </div>
      )}

      <section className="section-stack">
        <div className="media-head">
          <h2>Biblioteca</h2>
        </div>

        {loading && (
          <article className="empty-state-card">
            <p>Cargando recursos...</p>
          </article>
        )}

        {!loading && !mainMedia && (
          <article className="empty-state-card">
            <p>{emptyMessage}</p>
          </article>
        )}

        {mainMedia && (
          <div className="media-grid">
            <Link
              className="media-card feature"
              to={`/multimedia/${mainMedia.id}`}
            >
              {mainMedia.previewUrl ? (
                <img alt={mainMedia.title} src={mainMedia.previewUrl} />
              ) : (
                <div className="media-placeholder">
                  <MaterialIcon name="image" />
                </div>
              )}
              <div className="media-overlay">
                <p>{mainMedia.title}</p>
                <small>{mainMedia.subtitle}</small>
              </div>
              {mainMedia.kind === "video" && (
                <span className="media-video-badge">
                  <MaterialIcon name="play_circle" />
                </span>
              )}
            </Link>

            {sideMedia.map((item) => (
              <Link
                className="media-card side"
                key={item.id}
                to={`/multimedia/${item.id}`}
              >
                {item.previewUrl ? (
                  <img alt={item.title} src={item.previewUrl} />
                ) : (
                  <div className="media-placeholder">
                    <MaterialIcon name="image" />
                  </div>
                )}
                {item.kind === "video" && (
                  <span className="media-video-badge small">
                    <MaterialIcon name="play_circle" />
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
