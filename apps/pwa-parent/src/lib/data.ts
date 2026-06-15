// Adapter layer: maps the Sinapsis API (/api/*) responses into the shapes the
// PWA pages already expect. This isolates all API-surface differences here so the
// page components stay (almost) untouched.
import { api } from "./api";
import type {
  AuthUser,
  Community,
  CommunityDetail,
  DisciplineResource,
  GlobalSettings,
  Role,
  StudentConversation,
  StudentNotebookDetail,
  StudentReport,
  StudentSummary
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
    role: ROLE_MAP[roleName] || "TUTOR"
  };
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

const mapStudentSummary = (raw: any, catalog: CatalogDiscipline[]): StudentSummary => ({
  id: String(raw.id),
  firstName: raw.firstName || "",
  lastName: raw.lastName || "",
  status: raw.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
  sede: raw.companyId ? { id: String(raw.companyId), name: raw.companyName || "Sede" } : null,
  disciplines: Array.isArray(raw.disciplines)
    ? raw.disciplines.map((d: any) => {
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
    author: { id: String(r.authorId || ""), ...splitName(r.authorName) },
    recipients: []
  }));
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
  return results.flatMap((r) => (r.status === "fulfilled" && Array.isArray(r.value.data) ? r.value.data : []));
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
    coverUrl: p.coverUrl ?? null,
    status: p.status || "PUBLISHED",
    membersOnly: Boolean(p.membersOnly),
    publishedAt: p.publishedAt ?? null,
    createdAt: p.createdAt,
    author: { id: String(p.authorId || ""), ...splitName(p.authorName) },
    attachments: []
  }))
});

/** All communities (with members + posts) the tutor can read. */
export const fetchCommunities = async (): Promise<CommunityDetail[]> => {
  const { data: list } = await api.get<any[]>("/communities");
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

export const fetchPublicBranding = async (): Promise<GlobalSettings | null> => {
  try {
    const { data } = await api.get<any>("/public/core");
    if (!data) return null;
    return {
      id: 1,
      appName: data.appName || "Natación",
      logoUrl: data.logoUrl ?? data.sidebarLogoUrl ?? null,
      primaryColor: data.primaryColor || "#00666d",
      secondaryColor: data.secondaryColor || "#874e00",
      accentColor: data.accentColor || data.secondaryColor || "#006b1b"
    };
  } catch {
    return null;
  }
};
