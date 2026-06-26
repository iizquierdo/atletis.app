export type Role = "SUPER_ADMIN" | "ADMIN_SEDE" | "PROFESOR" | "TUTOR";

export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  phone?: string | null;
  sedeId?: string | null;
  sedeName?: string | null;
  status?: "ACTIVE" | "INACTIVE";
  avatarUrl?: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DisciplineLevel {
  id: string;
  name: string;
  description?: string | null;
  levelOrder: number;
  color?: string | null;
  active: boolean;
}

export interface Discipline {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  coverUrl?: string | null;
  active: boolean;
}

export interface StudentDiscipline {
  id: string;
  status: "ACTIVE" | "INACTIVE";
  discipline: Discipline;
  level?: DisciplineLevel | null;
}

export interface SedeRef {
  id: string;
  name: string;
}

export interface ClassScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime?: string;
}

export interface ClassTeacherRef {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

export interface StudentClass {
  id: string;
  classId: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  description?: string | null;
  imageUrl?: string | null;
  coverUrl?: string | null;
  disciplineId?: string | null;
  disciplineName?: string | null;
  levelName?: string | null;
  levelDescription?: string | null;
  levelOrder?: number | null;
  schedules?: ClassScheduleSlot[];
  teachers?: ClassTeacherRef[];
}

export interface StudentSummary {
  id: string;
  firstName: string;
  lastName: string;
  status: "ACTIVE" | "INACTIVE";
  imageUrl?: string | null;
  sede?: SedeRef | null;
  disciplines?: StudentDiscipline[];
  classes?: StudentClass[];
  teachers?: ClassTeacherRef[];
}

export interface StudentObjectiveProgress {
  id: string;
  levelId: string;
  title: string;
  sortOrder: number;
  progress: number;
  levelName?: string | null;
  className?: string | null;
}

export type CommunityPostStatus = "DRAFT" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED";

export interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  role?: Role;
  avatarUrl?: string | null;
}

export interface Community {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    members: number;
    posts: number;
  };
}

export interface CommunityMember {
  id: string;
  active: boolean;
  student: {
    id: string;
    firstName: string;
    lastName: string;
    status?: "ACTIVE" | "INACTIVE";
  };
}

export interface CommunityPostComment {
  id: string;
  postId: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
}

export interface CommunityPostAttachment {
  id?: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

export interface CommunityPost {
  id: string;
  communityId: string;
  title: string;
  content: string;
  coverUrl?: string | null;
  status: CommunityPostStatus;
  membersOnly: boolean;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  author: UserRef;
  attachments: CommunityPostAttachment[];
  likesCount?: number;
  commentsCount?: number;
  likedByMe?: boolean;
}

export interface CommunityDetail extends Community {
  members: CommunityMember[];
  posts: CommunityPost[];
}

export type DisciplineResourceType =
  | "PEDAGOGICAL_MATERIAL"
  | "EXERCISE_VIDEO"
  | "TOOLS"
  | "WORK_GUIDELINES"
  | "GENERAL_FILE";

export type DisciplineResourceVisibility = "ADMIN_ONLY" | "STAFF_ONLY" | "MEMBERS_ONLY" | "PUBLIC";

export interface DisciplineResource {
  id: string;
  disciplineId: string;
  title: string;
  description?: string | null;
  type: DisciplineResourceType;
  resourceUrl?: string | null;
  storageKey?: string | null;
  thumbnailUrl?: string | null;
  visibility: DisciplineResourceVisibility;
  publishedAt?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClassResource {
  id: string;
  classId: string;
  title: string;
  description?: string | null;
  type: DisciplineResourceType;
  resourceUrl?: string | null;
  storageKey?: string | null;
  thumbnailUrl?: string | null;
  visibility: DisciplineResourceVisibility;
  publishedAt?: string | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type LibraryResource =
  | (DisciplineResource & { source: "discipline" })
  | (ClassResource & { source: "class" });

export type ConversationStatus = "OPEN" | "CLOSED" | "ARCHIVED";

export interface MessageAttachment {
  id?: string;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: UserRef;
  attachments: MessageAttachment[];
}

export interface ConversationParticipant {
  id: string;
  conversationId: string;
  userId: string;
  active: boolean;
  user: UserRef;
}

export interface StudentConversation {
  id: string;
  studentId: string;
  subject?: string | null;
  status: ConversationStatus;
  createdAt?: string;
  updatedAt?: string;
  participants: ConversationParticipant[];
  messages: ConversationMessage[];
}

export interface StudentNotebookDetail {
  id: string;
  firstName: string;
  lastName: string;
  teacherAssignments: Array<{
    teacher: UserRef;
  }>;
  tutorAssignments: Array<{
    tutor: UserRef;
  }>;
}

export type ReportStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface StudentReport {
  id: string;
  studentId: string;
  authorId: string;
  type: string;
  title: string;
  content: string;
  summary?: string | null;
  status: ReportStatus;
  visibility: string;
  publishedAt?: string | null;
  createdAt: string;
  rating?: number | null;
  ratingTheme?: string | null;
  author: UserRef;
  recipients?: Array<{ user: UserRef }>;
}

export interface GlobalSettings {
  id: number;
  appName: string;
  logoUrl?: string | null;
  isologoUrl?: string | null;
  loginBackgroundUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  updatedAt?: string;
}
