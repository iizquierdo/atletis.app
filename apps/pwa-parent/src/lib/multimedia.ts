import { isDisplayableImageUrl, isDisplayableVideoUrl, resolveMediaUrl } from "./media";
import type { LibraryResource, StudentDiscipline, StudentSummary } from "../types";

const isActiveDiscipline = (d: StudentDiscipline) => d.status === "ACTIVE";
const isActiveClass = (c: NonNullable<StudentSummary["classes"]>[number]) => c.status === "ACTIVE";

export interface ContextMedia {
  imageUrl: string | null;
  coverUrl: string | null;
}

export type MediaKind = "image" | "video" | "file";

export interface ResourceVisuals {
  coverUrl: string | null;
  imageUrl: string | null;
  previewUrl: string | null;
  kind: MediaKind;
}

const extractYouTubeId = (v?: string | null): string | null => {
  const value = String(v || "").trim();
  if (!value) return null;
  const iframeSrc = value.match(/src=["']([^"']+)["']/i)?.[1];
  const raw = iframeSrc || value;
  return (
    raw.match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    )?.[1] ?? null
  );
};

export const collectMultimediaScope = (students: StudentSummary[]) => {
  const disciplineAssignments = students
    .flatMap((s) => s.disciplines ?? [])
    .filter(isActiveDiscipline);

  const classAssignments = students
    .flatMap((s) => s.classes ?? [])
    .filter(isActiveClass);

  const disciplineIds = Array.from(
    new Set(disciplineAssignments.map((a) => a.discipline.id).filter(Boolean))
  );

  const classIds = Array.from(
    new Set(classAssignments.map((c) => c.classId).filter(Boolean))
  );

  const disciplineNameById: Record<string, string> = {};
  const disciplineMediaById: Record<string, ContextMedia> = {};
  disciplineAssignments.forEach((a) => {
    disciplineNameById[a.discipline.id] = a.discipline.name;
    disciplineMediaById[a.discipline.id] = {
      imageUrl: resolveMediaUrl(a.discipline.imageUrl),
      coverUrl: resolveMediaUrl(a.discipline.coverUrl)
    };
  });

  const classNameById: Record<string, string> = {};
  const classMediaById: Record<string, ContextMedia> = {};
  classAssignments.forEach((c) => {
    classNameById[c.classId] = c.name;
    classMediaById[c.classId] = {
      imageUrl: resolveMediaUrl(c.imageUrl),
      coverUrl: resolveMediaUrl(c.coverUrl)
    };
  });

  return {
    disciplineIds,
    classIds,
    scopeKey: `${disciplineIds.join("|")}::${classIds.join("|")}`,
    disciplineNameById,
    classNameById,
    disciplineMediaById,
    classMediaById
  };
};

export const getLibraryResourceLabel = (
  resource: LibraryResource,
  labels: { disciplineNameById: Record<string, string>; classNameById: Record<string, string> }
) => {
  if (resource.source === "class") {
    return labels.classNameById[resource.classId] ?? "Clase";
  }
  return labels.disciplineNameById[resource.disciplineId] ?? "Disciplina";
};

export const getResourceVisuals = (
  resource: LibraryResource,
  scope: {
    classMediaById: Record<string, ContextMedia>;
    disciplineMediaById: Record<string, ContextMedia>;
  }
): ResourceVisuals => {
  const context =
    resource.source === "class"
      ? scope.classMediaById[resource.classId]
      : scope.disciplineMediaById[resource.disciplineId];
  const youtubeId = extractYouTubeId(resource.resourceUrl);

  const resourceImage =
    (resource.thumbnailUrl && isDisplayableImageUrl(resource.thumbnailUrl) ? resource.thumbnailUrl : null) ||
    (resource.resourceUrl && isDisplayableImageUrl(resource.resourceUrl) ? resource.resourceUrl : null) ||
    (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null);

  const coverUrl = context?.coverUrl || resourceImage;
  const imageUrl = context?.imageUrl || null;
  const previewUrl = coverUrl || imageUrl;

  const kind =
    youtubeId ||
    resource.type === "EXERCISE_VIDEO" ||
    (resource.resourceUrl && isDisplayableVideoUrl(resource.resourceUrl))
      ? "video"
      : previewUrl
        ? "image"
        : "file";

  return { coverUrl, imageUrl, previewUrl, kind };
};
