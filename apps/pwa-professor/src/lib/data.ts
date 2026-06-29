import { api } from "./api";
import { resolveMediaUrl } from "./media";
import type {
  AuthUser,
  CommunityDetail,
  CommunityPost,
  CommunityPostComment,
  Community,
  GlobalSettings,
  Role,
  StudentConversation,
  StudentReport,
  StudentSummary,
  StudentTutorRef,
  ProfessorClass,
  ClassScheduleSlot,
  Discipline,
  DisciplineLevel,
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

const readAvatarFromRecord = (raw: Record<string, unknown>): string | null =>
  resolveMediaUrl(
    (raw.imageUrl as string | null) ??
      (raw.avatar as string | null) ??
      (raw.avatarUrl as string | null) ??
      (raw.photoUrl as string | null)
  );

export const mapAuthUser = (raw: unknown): AuthUser => {
  const r = raw as Record<string, unknown>;
  const roleName = String((r?.roleRef as Record<string, unknown>)?.name || r?.role || "").trim().toLowerCase();
  const fromName = splitName(r?.name as string | null);
  return {
    id: String(r?.id || ""),
    email: String(r?.email || ""),
    firstName: (r?.firstName as string) || fromName.firstName,
    lastName: (r?.lastName as string) || fromName.lastName,
    role: ROLE_MAP[roleName] || "PROFESOR",
    avatarUrl: readAvatarFromRecord(r)
  };
};

const fetchUserPhotoFromFiles = async (userId: string): Promise<string | null> => {
  const modules = ["USERS", "USER", "STAFF"];
  for (const sourceModule of modules) {
    try {
      const { data } = await api.get<Array<{ fileUrl?: string; mimeType?: string | null }>>(
        "/public/files",
        { params: { sourceModule, sourceId: userId } }
      );
      const files = Array.isArray(data) ? data : [];
      const image = files.find((f) => isImageFile(f.fileUrl, f.mimeType));
      const url = resolveMediaUrl(image?.fileUrl);
      if (url) return url;
    } catch {
      // try next module
    }
  }
  return null;
};

const fetchAvatarFromUsersList = async (userId: string): Promise<string | null> => {
  try {
    const { data } = await api.get<Record<string, unknown>[]>("/users");
    const rows = Array.isArray(data) ? data : [];
    const me = rows.find((row) => String(row.id) === userId);
    return me ? readAvatarFromRecord(me) : null;
  } catch {
    return null;
  }
};

/** Fills avatarUrl when the auth payload omits it or stores only a bare storage key. */
export const enrichAuthUser = async (user: AuthUser): Promise<AuthUser> => {
  const resolved = user.avatarUrl ? resolveMediaUrl(user.avatarUrl) : null;
  if (resolved) return { ...user, avatarUrl: resolved };

  const fromUsers = user.role === "PROFESOR" ? null : await fetchAvatarFromUsersList(user.id);
  if (fromUsers) return { ...user, avatarUrl: fromUsers };

  const filePhoto = await fetchUserPhotoFromFiles(user.id);
  return filePhoto ? { ...user, avatarUrl: filePhoto } : user;
};

export const uploadUserAvatar = async (userId: string, file: File): Promise<string> => {
  const form = new FormData();
  form.append("avatar", file);
  const { data } = await api.post<{ avatar?: string; user?: Record<string, unknown> }>(
    `/users/${userId}/avatar`,
    form
  );
  const raw = data.avatar ?? (data.user?.avatar as string | undefined);
  const url = resolveMediaUrl(raw);
  if (!url) throw new Error("No se pudo guardar la foto de perfil.");
  return url;
};

// ---- Discipline/level catalog (cached) ------------------------------------
interface CatalogLevel { id: string; name: string; levelOrder: number }
interface CatalogDiscipline { id: string; name: string; levels: CatalogLevel[] }

let catalogPromise: Promise<CatalogDiscipline[]> | null = null;
const getCatalog = (): Promise<CatalogDiscipline[]> => {
  if (!catalogPromise) {
    catalogPromise = api
      .get<{ disciplines?: CatalogDiscipline[] }>("/students/meta")
      .then((r) => r.data?.disciplines ?? [])
      .catch(() => []);
  }
  return catalogPromise;
};

const resolveStudentImageUrl = (raw: Record<string, unknown>): string | null =>
  readAvatarFromRecord(raw);

const isImageFile = (fileUrl?: string | null, mimeType?: string | null) => {
  if (mimeType?.startsWith("image/")) return true;
  const path = String(fileUrl || "").split("?")[0].toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].some((ext) => path.endsWith(ext));
};

const fetchStudentPhotoFromFiles = async (studentId: string): Promise<string | null> => {
  try {
    const { data } = await api.get<Array<{ fileUrl?: string; mimeType?: string | null }>>(
      "/public/files",
      { params: { sourceModule: "STUDENTS", sourceId: studentId } }
    );
    const files = Array.isArray(data) ? data : [];
    const image = files.find((f) => isImageFile(f.fileUrl, f.mimeType));
    const url = image?.fileUrl?.trim();
    return url || null;
  } catch {
    return null;
  }
};

const mapTutors = (raw: unknown): StudentTutorRef[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => (t as Record<string, unknown>).active !== false)
    .map((t) => {
      const row = t as Record<string, unknown>;
      const name = String(row.tutorName || row.name || "").trim();
      return {
        id: String(row.tutorId || row.id || ""),
        name,
        email: (row.tutorEmail as string) ?? (row.email as string) ?? null
      };
    })
    .filter((t) => t.id && t.name);
};

const mapStudentSummary = (raw: Record<string, unknown>, catalog: CatalogDiscipline[]): StudentSummary => ({
  id: String(raw.studentId || raw.id),
  firstName: (raw.firstName as string) || "",
  lastName: (raw.lastName as string) || "",
  status: (raw.studentStatus ?? raw.status) === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  sede: raw.companyId ? { id: String(raw.companyId), name: (raw.companyName as string) || "Sede" } : null,
  document: (raw.document as string) || null,
  phone: (raw.phone as string) || null,
  email: (raw.email as string) || null,
  imageUrl: resolveStudentImageUrl(raw),
  tutors: mapTutors(raw.tutors),
  disciplines: Array.isArray(raw.disciplines)
    ? (raw.disciplines as Record<string, unknown>[]).map((d) => {
        const disc = catalog.find((c) => c.id === d.disciplineId);
        const lvl = disc?.levels.find((l) => l.id === d.levelId);
        return {
          id: String(d.id),
          status: d.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
          discipline: { id: String(d.disciplineId), name: disc?.name || "Disciplina", active: true },
          level: lvl ? { id: lvl.id, name: lvl.name, levelOrder: lvl.levelOrder, active: true } : null
        };
      })
    : []
});

const sortStudentsByName = (list: StudentSummary[]) =>
  [...list].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "es")
  );

const mergeUniqueStudents = (lists: StudentSummary[]): StudentSummary[] => {
  const seen = new Map<string, StudentSummary>();
  for (const list of lists) {
    for (const st of list) {
      if (st.status === "ACTIVE" && !seen.has(st.id)) seen.set(st.id, st);
    }
  }
  return sortStudentsByName(Array.from(seen.values()));
};

/** Classes assigned to the logged-in professor. */
export const fetchMyClasses = async (): Promise<ProfessorClass[]> => {
  const { data } = await api.get<Record<string, unknown>[]>("/classes");
  const rows = Array.isArray(data) ? data : [];
  return rows.map((c) => {
    const disc = c.discipline as Record<string, unknown> | null;
    const lvl = c.level as Record<string, unknown> | null;
    return {
      id: String(c.id),
      name: (c.name as string) || (disc?.name as string) || "Clase",
      discipline: {
        id: String(disc?.id || c.disciplineId || ""),
        name: (disc?.name as string) || "Disciplina",
        active: true
      } as Discipline,
      level: lvl
        ? ({
            id: String(lvl.id),
            name: (lvl.name as string) || "",
            levelOrder: (lvl.levelOrder as number) || 0,
            active: true
          } as DisciplineLevel)
        : null,
      schedule: (c.schedule as string) || (c.scheduleName as string) || "",
      room: (c.room as string) || null,
      studentCount: (c.studentCount as number) || (c._count as Record<string, unknown>)?.students as number || 0,
      sede: c.companyId
        ? { id: String(c.companyId), name: (c.companyName as string) || "Sede" }
        : null,
      schedules: Array.isArray(c.schedules)
        ? (c.schedules as Record<string, unknown>[]).map((s): ClassScheduleSlot => ({
            dayOfWeek: Number(s.dayOfWeek),
            startTime: String(s.startTime || ""),
            endTime: String(s.endTime || "")
          }))
        : undefined
    };
  });
};

/** Students enrolled in a specific class. */
export const fetchClassStudents = async (classId: string): Promise<StudentSummary[]> => {
  const [{ data }, catalog] = await Promise.all([
    api.get<Record<string, unknown>[]>(`/classes/${classId}/students`),
    getCatalog()
  ]);
  const rows = Array.isArray(data) ? data : [];
  return rows
    .filter((row) => {
      const enrollment = String(row.status ?? "ACTIVE");
      const student = String(row.studentStatus ?? "ACTIVE");
      return enrollment !== "INACTIVE" && student !== "INACTIVE";
    })
    .map((row) => mapStudentSummary(row, catalog));
};

/** Students visible to the logged-in professor (from assigned classes). */
export const fetchStudents = async (): Promise<StudentSummary[]> => {
  try {
    const classes = await fetchMyClasses();
    if (classes.length > 0) {
      const byClass = await Promise.all(
        classes.map((c) => fetchClassStudents(c.id).catch(() => [] as StudentSummary[]))
      );
      const fromClasses = mergeUniqueStudents(byClass);
      if (fromClasses.length > 0) return fromClasses;
    }
  } catch {
    // fall through to /students
  }

  const [{ data: list }, catalog] = await Promise.all([
    api.get<Record<string, unknown>[]>("/students"),
    getCatalog()
  ]);
  const rows = Array.isArray(list) ? list : [];
  const students = await Promise.all(
    rows.map((row) =>
      api
        .get<Record<string, unknown>>(`/students/${String(row.studentId || row.id)}`)
        .then((r) => mapStudentSummary(r.data, catalog))
        .catch(() => mapStudentSummary(row, catalog))
    )
  );
  return sortStudentsByName(students.filter((st) => st.status === "ACTIVE"));
};

/** Full student profile (contact info, tutors, disciplines). */
export const fetchStudentDetail = async (studentId: string): Promise<StudentSummary> => {
  const [{ data }, catalog] = await Promise.all([
    api.get<Record<string, unknown>>(`/students/${studentId}`),
    getCatalog()
  ]);
  const summary = mapStudentSummary(data, catalog);
  if (!summary.imageUrl) {
    const filePhoto = await fetchStudentPhotoFromFiles(studentId);
    if (filePhoto) summary.imageUrl = filePhoto;
  }
  return summary;
};

export const fetchReports = async (studentId: string): Promise<StudentReport[]> => {
  const { data } = await api.get<Record<string, unknown>[]>(`/students/${studentId}/reports`);
  return (Array.isArray(data) ? data : []).map((r) => ({
    ...(r as object),
    author: { id: String(r.authorId || ""), ...splitName(r.authorName as string | null) },
    recipients: []
  } as StudentReport));
};

export const createReport = async (
  studentId: string,
  payload: {
    type: string;
    title: string;
    content: string;
    summary?: string;
    status: string;
    rating?: number;
    ratingTheme?: string;
  }
): Promise<StudentReport> => {
  const body: Record<string, unknown> = { ...payload };
  if (!payload.rating) {
    delete body.rating;
    delete body.ratingTheme;
  }
  const { data } = await api.post<Record<string, unknown>>(`/students/${studentId}/reports`, body);
  return {
    ...(data as object),
    author: { id: String(data.authorId || ""), ...splitName(data.authorName as string | null) },
    recipients: []
  } as StudentReport;
};

const mapConversationDetail = (
  data: Record<string, unknown>,
  studentId: string
): StudentConversation => ({
  id: String(data.id),
  studentId,
  subject: (data.subject as string | null) ?? null,
  status: (data.status || "OPEN") as StudentConversation["status"],
  createdAt: data.createdAt as string | undefined,
  updatedAt: data.updatedAt as string | undefined,
  participants: ((data.participants || []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    conversationId: String(data.id),
    userId: String(p.userId),
    active: Boolean(p.active),
    user: { id: String(p.userId), ...splitName(p.userName as string | null) }
  })),
  messages: ((data.messages || []) as Record<string, unknown>[]).map((m) => ({
    id: String(m.id),
    conversationId: String(data.id),
    senderId: String(m.senderId),
    body: (m.body as string) || "",
    createdAt: m.createdAt as string,
    sender: { id: String(m.senderId), ...splitName(m.senderName as string | null) },
    attachments: []
  }))
});

export const fetchConversationDetail = async (
  conversationId: string,
  studentId: string
): Promise<StudentConversation> => {
  const { data } = await api.get<Record<string, unknown>>(`/students/conversations/${conversationId}`);
  return mapConversationDetail(data, studentId);
};

export const fetchConversations = async (studentId: string): Promise<StudentConversation[]> => {
  const { data: list } = await api.get<Record<string, unknown>[]>(`/students/${studentId}/conversations`);
  const rows = Array.isArray(list) ? list : [];
  return Promise.all(
    rows.map(async (row) => {
      const { data } = await api.get<Record<string, unknown>>(`/students/conversations/${String(row.id)}`);
      return mapConversationDetail({ ...row, ...data }, studentId);
    })
  );
};

export const createConversation = async (
  studentId: string,
  payload: { subject?: string; firstMessage?: string }
): Promise<StudentConversation> => {
  const { data } = await api.post<Record<string, unknown>>(`/students/${studentId}/conversations`, payload);
  const id = String(data.id);
  return fetchConversationDetail(id, studentId);
};

export const sendConversationMessage = async (conversationId: string, body: string): Promise<void> => {
  await api.post(`/students/conversations/${conversationId}/messages`, { body });
};

const mapCommunityDetail = (community: Community, members: Record<string, unknown>[], posts: Record<string, unknown>[]): import("../types").CommunityDetail => ({
  ...community,
  members: (members || []).map((m) => ({
    id: String(m.id),
    active: Boolean(m.active),
    student: { id: String(m.studentId), firstName: (m.firstName as string) || "", lastName: (m.lastName as string) || "" }
  })),
  posts: (posts || []).map((p) => ({
    id: String(p.id),
    communityId: String(community.id),
    title: (p.title as string) || "",
    content: (p.content as string) || "",
    coverUrl: (p.coverUrl as string) ?? null,
    status: (p.status as CommunityPost["status"]) || "PUBLISHED",
    membersOnly: Boolean(p.membersOnly),
    publishedAt: (p.publishedAt as string) ?? null,
    createdAt: p.createdAt as string | undefined,
    author: {
      id: String(p.authorId || ""),
      firstName: String(p.authorFirstName || "") || splitName(p.authorName as string | null).firstName,
      lastName: String(p.authorLastName || "") || splitName(p.authorName as string | null).lastName,
      avatarUrl: readAvatarFromRecord({
        imageUrl: (p.authorImageUrl as string) ?? (p.imageUrl as string),
        avatar: p.authorAvatarUrl as string,
        avatarUrl: p.authorAvatarUrl as string
      })
    },
    likesCount: (p.likesCount as number) ?? 0,
    commentsCount: (p.commentsCount as number) ?? 0,
    likedByMe: Boolean(p.likedByMe),
    attachments: []
  }))
});

export const fetchCommunities = async (): Promise<CommunityDetail[]> => {
  const { data: list } = await api.get<Record<string, unknown>[]>("/communities");
  const rows = Array.isArray(list) ? list : [];
  return Promise.all(
    rows.map(async (c) => {
      const [members, posts] = await Promise.all([
        api.get<Record<string, unknown>[]>(`/communities/${String(c.id)}/members`).then((r) => r.data).catch(() => []),
        api.get<Record<string, unknown>[]>(`/communities/${String(c.id)}/posts`).then((r) => r.data).catch(() => [])
      ]);
      return mapCommunityDetail(c as Community, members, posts);
    })
  );
};

export const fetchPostComments = async (
  communityId: string,
  postId: string
): Promise<CommunityPostComment[]> => {
  const { data } = await api.get<Record<string, unknown>[]>(
    `/communities/${communityId}/posts/${postId}/comments`
  );
  const rows = Array.isArray(data) ? data : [];
  return rows.map((c) => ({
    id: String(c.id),
    postId: String(c.postId),
    content: String(c.content || ""),
    createdAt: String(c.createdAt || ""),
    authorId: String(c.authorId || ""),
    authorName: (c.authorName as string) ?? null,
    firstName: (c.firstName as string) ?? null,
    lastName: (c.lastName as string) ?? null,
    avatarUrl: readAvatarFromRecord({
      imageUrl: (c.authorImageUrl as string) ?? (c.avatarUrl as string),
      avatar: c.authorAvatarUrl as string,
      avatarUrl: c.avatarUrl as string
    })
  }));
};

export const createPostComment = async (
  communityId: string,
  postId: string,
  content: string
): Promise<CommunityPostComment> => {
  const { data } = await api.post<CommunityPostComment>(
    `/communities/${communityId}/posts/${postId}/comments`,
    { content }
  );
  return data;
};

export const deletePostComment = async (
  communityId: string,
  postId: string,
  commentId: string
): Promise<void> => {
  await api.delete(`/communities/${communityId}/posts/${postId}/comments/${commentId}`);
};

export const uploadFile = async (
  file: File,
  sourceModule: string,
  sourceId: string
): Promise<string> => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("sourceModule", sourceModule);
  fd.append("sourceId", sourceId);
  const { data } = await api.post<{ fileUrl: string }>("/public/files/upload", fd);
  return String(data?.fileUrl || "");
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

export const createCommunityPost = async (
  communityId: string,
  payload: {
    title: string;
    content: string;
    status: string;
    coverUrl?: string | null;
    membersOnly?: boolean;
  }
): Promise<{ id: string }> => {
  const { data } = await api.post<{ id: string }>(`/communities/${communityId}/posts`, payload);
  return { id: String(data?.id || "") };
};

export const deleteCommunityPost = async (communityId: string, postId: string): Promise<void> => {
  await api.delete(`/communities/${communityId}/posts/${postId}`);
};

export const fetchWeeklyAttendance = async (
  classIds: string[]
): Promise<{ rate: number | null; present: number; total: number }> => {
  if (!classIds.length) return { rate: null, present: 0, total: 0 };

  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const from = monday.toISOString().split("T")[0];
  const to = now.toISOString().split("T")[0];

  let totalPresent = 0;
  let totalRecords = 0;

  await Promise.all(
    classIds.map(async (id) => {
      try {
        const { data } = await api.get<{ studentId: string; date: string; present: boolean }[]>(
          `/classes/${id}/attendance?from=${from}&to=${to}`
        );
        if (Array.isArray(data)) {
          totalPresent += data.filter((r) => r.present).length;
          totalRecords += data.length;
        }
      } catch {
        // ignore per-class errors
      }
    })
  );

  if (totalRecords === 0) return { rate: null, present: 0, total: 0 };
  return { rate: Math.round((totalPresent / totalRecords) * 100), present: totalPresent, total: totalRecords };
};

export const fetchStudentObjectives = async (studentId: string): Promise<StudentObjectiveProgress[]> => {
  try {
    const { data } = await api.get<Record<string, unknown>[]>(`/students/${studentId}/objectives`);
    return (Array.isArray(data) ? data : []).map((r) => ({
      id: String(r.id),
      levelId: String(r.levelId),
      title: String(r.title || ""),
      sortOrder: Number(r.sortOrder ?? 0),
      progress: Math.min(100, Math.max(0, Number(r.progress ?? 0))),
      levelName: (r.levelName as string) ?? null,
      className: (r.className as string) ?? null
    }));
  } catch {
    return [];
  }
};

export const updateObjectiveProgress = async (
  studentId: string,
  objectiveId: string,
  progress: number
): Promise<void> => {
  await api.put(`/students/${studentId}/objectives/${objectiveId}/progress`, { progress });
};

export const fetchPublicBranding = async (): Promise<GlobalSettings | null> => {
  try {
    const { data } = await api.get<Record<string, unknown>>("/public/core");
    if (!data) return null;
    return {
      id: 1,
      appName: (data.appName as string) || "Natación",
      logoUrl: resolveMediaUrl((data.logoUrl ?? data.sidebarLogoUrl) as string | null),
      isologoUrl: resolveMediaUrl(data.isologoUrl as string | null),
      loginBackgroundUrl: resolveMediaUrl(data.loginBackgroundUrl as string | null),
      primaryColor: (data.primaryColor as string) || "#00666d",
      secondaryColor: (data.secondaryColor as string) || "#874e00",
      accentColor: (data.accentColor ?? data.secondaryColor) as string || "#006b1b"
    };
  } catch {
    return null;
  }
};
