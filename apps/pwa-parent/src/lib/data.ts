// Adapter layer: maps the Sinapsis API (/api/*) responses into the shapes the
// PWA pages already expect. This isolates all API-surface differences here so the
// page components stay (almost) untouched.
import { api } from "./api";
import { resolveMediaUrl } from "./media";
import type {
  AuthUser,
  ClassTeacherRef,
  Community,
  CommunityDetail,
  CommunityPost,
  CommunityPostComment,
  DisciplineResource,
  ClassResource,
  LibraryResource,
  GlobalSettings,
  Role,
  StudentConversation,
  StudentNotebookDetail,
  StudentReport,
  StudentClass,
  StudentSummary,
  StudentObjectiveProgress
} from "../types";

const splitName = (full?: string | null): { firstName: string; lastName: string } => {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

const ROLE_MAP: Record<string, Role> = {
  "super admin": "SUPER_ADMIN",
  administrator: "SUPER_ADMIN",
  admin: "SUPER_ADMIN",
  "admin sede": "ADMIN_SEDE",
  profesor: "PROFESOR",
  tutor: "TUTOR"
};

export const mapAuthUser = (raw: any): AuthUser => {
  const roleName = String(raw?.roleRef?.name || raw?.role || "").trim().toLowerCase();
  const fromName = splitName(raw?.name);
  return {
    id: String(raw?.id || ""),
    email: String(raw?.email || ""),
    firstName: raw?.firstName || fromName.firstName,
    lastName: raw?.lastName || fromName.lastName,
    role: ROLE_MAP[roleName] || "TUTOR",
    avatarUrl: resolveMediaUrl(raw?.imageUrl ?? raw?.avatar ?? raw?.avatarUrl ?? null)
  };
};

const readAvatarFromRecord = (raw: Record<string, unknown>): string | null =>
  resolveMediaUrl(
    (raw.imageUrl as string | null) ??
      (raw.avatar as string | null) ??
      (raw.avatarUrl as string | null)
  );

// ---- Discipline/level catalog (cached) ------------------------------------
interface CatalogLevel { id: string; name: string; levelOrder: number; description?: string | null }
interface CatalogDiscipline {
  id: string;
  name: string;
  imageUrl?: string | null;
  coverUrl?: string | null;
  levels: CatalogLevel[];
}

let catalogPromise: Promise<CatalogDiscipline[]> | null = null;
const getCatalog = (): Promise<CatalogDiscipline[]> => {
  if (!catalogPromise) {
    catalogPromise = api
      .get<{ disciplines?: CatalogDiscipline[] }>("/students/meta")
      .then((r) =>
        (r.data?.disciplines ?? []).map((disc) => ({
          ...disc,
          imageUrl: resolveMediaUrl(disc.imageUrl),
          coverUrl: resolveMediaUrl(disc.coverUrl)
        }))
      )
      .catch(() => []);
  }
  return catalogPromise;
};

const mapTeacherRef = (raw: {
  id?: string;
  teacherId?: string;
  name?: string;
  teacherName?: string;
  avatar?: string | null;
  teacherAvatar?: string | null;
}): ClassTeacherRef => {
  const fromName = splitName(raw?.name || raw?.teacherName);
  return {
    id: String(raw?.id || raw?.teacherId || ""),
    firstName: fromName.firstName,
    lastName: fromName.lastName,
    avatarUrl: raw?.avatar ?? raw?.teacherAvatar ?? null
  };
};

const mapStudentClass = (raw: any): StudentClass => ({
  id: String(raw.id),
  classId: String(raw.classId),
  name: String(raw.name || raw.disciplineName || "Clase"),
  status: raw.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  description: raw.classDescription ?? null,
  imageUrl: resolveMediaUrl(raw.classImageUrl ?? raw.disciplineImageUrl ?? null),
  coverUrl: resolveMediaUrl(raw.classCoverUrl ?? raw.disciplineCoverUrl ?? null),
  disciplineId: raw.disciplineId ? String(raw.disciplineId) : null,
  disciplineName: raw.disciplineName ?? null,
  levelName: raw.levelName ?? null,
  levelDescription: raw.levelDescription ?? null,
  levelOrder: raw.levelOrder != null ? Number(raw.levelOrder) : null,
  schedules: Array.isArray(raw.schedules)
    ? raw.schedules.map((s: any) => ({
        dayOfWeek: Number(s.dayOfWeek),
        startTime: String(s.startTime || ""),
        endTime: s.endTime ? String(s.endTime) : undefined
      }))
    : [],
  teachers: Array.isArray(raw.teachers) ? raw.teachers.map(mapTeacherRef) : []
});

const mapStudentSummary = (raw: any, catalog: CatalogDiscipline[]): StudentSummary => ({
  id: String(raw.id),
  firstName: raw.firstName || "",
  lastName: raw.lastName || "",
  imageUrl: raw.imageUrl ?? null,
  status: raw.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  sede: raw.companyId ? { id: String(raw.companyId), name: raw.companyName || "Sede" } : null,
  disciplines: Array.isArray(raw.disciplines)
    ? raw.disciplines.map((d: any) => {
        const disc = catalog.find((c) => c.id === d.disciplineId);
        const lvl = disc?.levels.find((l) => l.id === d.levelId);
        return {
          id: String(d.id),
          status: d.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
          discipline: {
            id: String(d.disciplineId),
            name: disc?.name || "Disciplina",
            imageUrl: resolveMediaUrl(disc?.imageUrl ?? null),
            coverUrl: resolveMediaUrl(disc?.coverUrl ?? null),
            active: true
          },
          level: lvl
            ? {
                id: lvl.id,
                name: lvl.name,
                description: lvl.description ?? null,
                levelOrder: lvl.levelOrder,
                active: true
              }
            : null
        };
      })
    : [],
  classes: Array.isArray(raw.classes)
    ? raw.classes.map(mapStudentClass).filter((c) => c.status === "ACTIVE")
    : [],
  teachers: Array.isArray(raw.teachers)
    ? raw.teachers.filter((t: any) => t.active !== false).map((t: any) => mapTeacherRef(t))
    : []
});

/** Students visible to the logged-in tutor, enriched with disciplines/levels. */
export const fetchStudents = async (): Promise<StudentSummary[]> => {
  const [{ data: list }, catalog] = await Promise.all([
    api.get<any[]>("/students"),
    getCatalog()
  ]);
  const rows = Array.isArray(list) ? list : [];
  return Promise.all(
    rows.map((row) =>
      api
        .get<any>(`/students/${row.id}`)
        .then((r) => mapStudentSummary(r.data, catalog))
        .catch(() => mapStudentSummary(row, catalog))
    )
  );
};

export const fetchStudentNotebook = async (studentId: string): Promise<StudentNotebookDetail> => {
  const { data } = await api.get<any>(`/students/${studentId}`);
  return {
    id: String(data.id),
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    teacherAssignments: (data.teachers || []).map((t: any) => ({
      teacher: { id: String(t.teacherId), ...splitName(t.teacherName), role: "PROFESOR" as Role }
    })),
    tutorAssignments: (data.tutors || []).map((t: any) => ({
      tutor: { id: String(t.tutorId), ...splitName(t.tutorName), role: "TUTOR" as Role }
    }))
  };
};

export const fetchReports = async (studentId: string): Promise<StudentReport[]> => {
  const { data } = await api.get<any[]>(`/students/${studentId}/reports`);
  return (Array.isArray(data) ? data : []).map((r) => ({
    ...r,
    author: {
      id: String(r.authorId || ""),
      ...splitName(r.authorName),
      avatarUrl: resolveMediaUrl(r.authorAvatarUrl ?? null)
    },
    recipients: []
  }));
};

export const updateReport = async (
  studentId: string,
  reportId: string,
  payload: { title?: string; content?: string; summary?: string; status?: string }
): Promise<StudentReport> => {
  const { data } = await api.put<any>(`/students/${studentId}/reports/${reportId}`, payload);
  return {
    ...data,
    author: {
      id: String(data.authorId || ""),
      ...splitName(data.authorName),
      avatarUrl: resolveMediaUrl(data.authorAvatarUrl ?? null)
    },
    recipients: []
  };
};

export const deleteReport = async (studentId: string, reportId: string): Promise<void> => {
  await api.delete(`/students/${studentId}/reports/${reportId}`);
};

export const fetchConversations = async (studentId: string): Promise<StudentConversation[]> => {
  const { data: list } = await api.get<any[]>(`/students/${studentId}/conversations`);
  const rows = Array.isArray(list) ? list : [];
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await api.get<any>(`/students/conversations/${row.id}`);
      return {
        id: String(data.id),
        studentId,
        subject: data.subject ?? row.subject ?? null,
        status: data.status || row.status || "OPEN",
        createdAt: data.createdAt ?? row.createdAt,
        updatedAt: data.updatedAt ?? row.updatedAt,
        participants: (data.participants || []).map((p: any) => ({
          id: String(p.id),
          conversationId: String(data.id),
          userId: String(p.userId),
          active: Boolean(p.active),
          user: { id: String(p.userId), ...splitName(p.userName) }
        })),
        messages: (data.messages || []).map((m: any) => ({
          id: String(m.id),
          conversationId: String(data.id),
          senderId: String(m.senderId),
          body: m.body || "",
          createdAt: m.createdAt,
          sender: { id: String(m.senderId), ...splitName(m.senderName) },
          attachments: []
        }))
      } as StudentConversation;
    })
  );
};

export const createConversation = async (
  studentId: string,
  payload: { subject: string; participantIds: string[]; firstMessage: { body: string } }
): Promise<{ id: string }> => {
  const { data } = await api.post<any>(`/students/${studentId}/conversations`, {
    subject: payload.subject,
    participantIds: payload.participantIds,
    firstMessage: payload.firstMessage.body
  });
  return { id: String(data?.id || "") };
};

export const sendConversationMessage = async (conversationId: string, body: string): Promise<void> => {
  await api.post(`/students/conversations/${conversationId}/messages`, { body });
};

export const fetchResourcesForDisciplines = async (
  disciplineIds: string[]
): Promise<DisciplineResource[]> => {
  const results = await Promise.allSettled(
    disciplineIds.map((id) => api.get<DisciplineResource[]>(`/disciplines/${id}/resources`))
  );
  return results
    .flatMap((r) => (r.status === "fulfilled" && Array.isArray(r.value.data) ? r.value.data : []))
    .map((resource) => ({
      ...resource,
      resourceUrl: resolveMediaUrl(resource.resourceUrl),
      thumbnailUrl: resolveMediaUrl(resource.thumbnailUrl)
    }));
};

export const fetchResourcesForClasses = async (classIds: string[]): Promise<ClassResource[]> => {
  const results = await Promise.allSettled(
    classIds.map((id) => api.get<ClassResource[]>(`/classes/${id}/resources`))
  );
  return results
    .flatMap((r) => (r.status === "fulfilled" && Array.isArray(r.value.data) ? r.value.data : []))
    .map((resource) => ({
      ...resource,
      resourceUrl: resolveMediaUrl(resource.resourceUrl),
      thumbnailUrl: resolveMediaUrl(resource.thumbnailUrl)
    }));
};

export const fetchLibraryResources = async (input: {
  disciplineIds: string[];
  classIds: string[];
}): Promise<LibraryResource[]> => {
  const [disciplineResources, classResources] = await Promise.all([
    input.disciplineIds.length ? fetchResourcesForDisciplines(input.disciplineIds) : Promise.resolve([]),
    input.classIds.length ? fetchResourcesForClasses(input.classIds) : Promise.resolve([])
  ]);
  return [
    ...disciplineResources.map((r) => ({ ...r, source: "discipline" as const })),
    ...classResources.map((r) => ({ ...r, source: "class" as const }))
  ];
};

const mapCommunityDetail = (community: Community, members: any[], posts: any[]): CommunityDetail => ({
  ...community,
  members: (members || []).map((m) => ({
    id: String(m.id),
    active: Boolean(m.active),
    student: { id: String(m.studentId), firstName: m.firstName || "", lastName: m.lastName || "" }
  })),
  posts: (posts || []).map((p) => ({
    id: String(p.id),
    communityId: String(community.id),
    title: p.title || "",
    content: p.content || "",
    coverUrl: resolveMediaUrl(p.coverUrl ?? null),
    status: p.status || "PUBLISHED",
    membersOnly: Boolean(p.membersOnly),
    publishedAt: p.publishedAt ?? null,
    createdAt: p.createdAt,
    author: {
      id: String(p.authorId || ""),
      firstName: String(p.authorFirstName || "") || splitName(p.authorName).firstName,
      lastName: String(p.authorLastName || "") || splitName(p.authorName).lastName,
      avatarUrl: readAvatarFromRecord({
        imageUrl: p.authorImageUrl ?? p.imageUrl,
        avatar: p.authorAvatarUrl,
        avatarUrl: p.authorAvatarUrl
      })
    },
    likesCount: p.likesCount ?? 0,
    commentsCount: p.commentsCount ?? 0,
    likedByMe: Boolean(p.likedByMe),
    attachments: Array.isArray(p.attachments)
      ? p.attachments.map((a: any) => ({
          id: a.id ? String(a.id) : undefined,
          fileName: String(a.fileName || "Archivo"),
          fileUrl: resolveMediaUrl(a.fileUrl) ?? String(a.fileUrl || ""),
          mimeType: a.mimeType ?? null,
          sizeBytes: a.sizeBytes ?? null
        }))
      : []
  }))
});

/** Communities (with members + posts) visible to the tutor, optionally scoped to one student. */
export const fetchCommunities = async (studentId?: string | null): Promise<CommunityDetail[]> => {
  const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : "";
  const { data: list } = await api.get<any[]>(`/communities${qs}`);
  const rows = Array.isArray(list) ? list : [];
  return Promise.all(
    rows.map(async (c) => {
      const [members, posts] = await Promise.all([
        api.get<any[]>(`/communities/${c.id}/members`).then((r) => r.data).catch(() => []),
        api.get<any[]>(`/communities/${c.id}/posts`).then((r) => r.data).catch(() => [])
      ]);
      return mapCommunityDetail(c as Community, members, posts);
    })
  );
};

export const fetchPostComments = async (
  communityId: string,
  postId: string
): Promise<CommunityPostComment[]> => {
  const { data } = await api.get<any[]>(`/communities/${communityId}/posts/${postId}/comments`);
  const rows = Array.isArray(data) ? data : [];
  return rows.map((c) => ({
    id: String(c.id),
    postId: String(c.postId),
    content: String(c.content || ""),
    createdAt: String(c.createdAt || ""),
    authorId: String(c.authorId || ""),
    authorName: c.authorName ?? null,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    avatarUrl: readAvatarFromRecord({
      imageUrl: c.authorImageUrl ?? c.avatarUrl,
      avatar: c.authorAvatarUrl,
      avatarUrl: c.avatarUrl
    })
  }));
};

export const createPostComment = async (
  communityId: string,
  postId: string,
  content: string
): Promise<CommunityPostComment> => {
  const { data } = await api.post<any>(`/communities/${communityId}/posts/${postId}/comments`, {
    content
  });
  return {
    id: String(data.id),
    postId: String(data.postId || postId),
    content: String(data.content || content),
    createdAt: String(data.createdAt || new Date().toISOString()),
    authorId: String(data.authorId || ""),
    authorName: data.authorName ?? null,
    firstName: data.firstName ?? null,
    lastName: data.lastName ?? null,
    avatarUrl: readAvatarFromRecord({
      imageUrl: data.authorImageUrl ?? data.avatarUrl,
      avatar: data.authorAvatarUrl,
      avatarUrl: data.avatarUrl
    })
  };
};

export const deletePostComment = async (
  communityId: string,
  postId: string,
  commentId: string
): Promise<void> => {
  await api.delete(`/communities/${communityId}/posts/${postId}/comments/${commentId}`);
};

export const updatePostComment = async (
  communityId: string,
  postId: string,
  commentId: string,
  content: string
): Promise<CommunityPostComment> => {
  const { data } = await api.put<any>(
    `/communities/${communityId}/posts/${postId}/comments/${commentId}`,
    { content }
  );
  return {
    id: String(data.id),
    postId: String(data.postId || postId),
    content: String(data.content || content),
    createdAt: String(data.createdAt || new Date().toISOString()),
    authorId: String(data.authorId || ""),
    authorName: data.authorName ?? null,
    firstName: data.firstName ?? null,
    lastName: data.lastName ?? null,
    avatarUrl: readAvatarFromRecord({
      imageUrl: data.authorImageUrl ?? data.avatarUrl,
      avatar: data.authorAvatarUrl,
      avatarUrl: data.avatarUrl
    })
  };
};

export const togglePostLike = async (
  communityId: string,
  postId: string
): Promise<{ liked: boolean; count: number }> => {
  const { data } = await api.post<{ liked: boolean; count: number }>(
    `/communities/${communityId}/posts/${postId}/like`
  );
  return data;
};

export const searchStudentByDni = async (dni: string): Promise<StudentSummary> => {
  const catalog = await getCatalog();
  const { data } = await api.get<any>(`/students/lookup?dni=${encodeURIComponent(dni.trim())}`);
  if (!data) throw new Error("No se encontró un alumno con ese DNI.");
  return mapStudentSummary(data, catalog);
};

export interface StudentAttendanceSummary {
  rate: number | null;
  present: number;
  total: number;
}

export const fetchStudentWeeklyAttendance = async (
  studentId: string
): Promise<StudentAttendanceSummary> => {
  const now = new Date();
  const dow = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const from = monday.toISOString().split("T")[0];
  const to = now.toISOString().split("T")[0];

  try {
    const { data } = await api.get<{ present: boolean }[]>(
      `/students/${studentId}/attendance?from=${from}&to=${to}`
    );
    const rows = Array.isArray(data) ? data : [];
    const total = rows.length;
    const present = rows.filter((row) => row.present).length;
    if (total === 0) return { rate: null, present: 0, total: 0 };
    return { rate: Math.round((present / total) * 100), present, total };
  } catch {
    return { rate: null, present: 0, total: 0 };
  }
};

export const fetchStudentObjectives = async (
  studentId: string
): Promise<StudentObjectiveProgress[]> => {
  try {
    const { data } = await api.get<any[]>(`/students/${studentId}/objectives`);
    return (Array.isArray(data) ? data : []).map((r) => ({
      id: String(r.id),
      levelId: String(r.levelId),
      title: String(r.title || ""),
      sortOrder: Number(r.sortOrder ?? 0),
      progress: Math.min(100, Math.max(0, Number(r.progress ?? 0))),
      levelName: r.levelName ?? null,
      className: r.className ?? null
    }));
  } catch {
    return [];
  }
};

export const linkStudentToTutor = async (studentId: string): Promise<void> => {
  await api.post(`/students/${studentId}/link-tutor`);
};

export const fetchPublicBranding = async (): Promise<GlobalSettings | null> => {
  try {
    const { data } = await api.get<any>("/public/core");
    if (!data) return null;
    return {
      id: 1,
      appName: data.appName || "Natación",
      logoUrl: resolveMediaUrl(data.logoUrl ?? data.sidebarLogoUrl ?? null),
      isologoUrl: resolveMediaUrl(data.isologoUrl ?? null),
      faviconUrl: resolveMediaUrl(data.faviconUrl ?? data.isologoUrl ?? data.logoUrl ?? data.sidebarLogoUrl ?? null),
      loginBackgroundUrl: resolveMediaUrl(data.loginBackgroundUrl ?? null),
      primaryColor: data.primaryColor || "#00666d",
      secondaryColor: data.secondaryColor || "#874e00",
      accentColor: data.accentColor || data.secondaryColor || "#006b1b"
    };
  } catch {
    return null;
  }
};
