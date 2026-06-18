import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CustomSelect, type SelectOption } from "../components/CustomSelect";
import { MaterialIcon } from "../components/MaterialIcon";
import { useAuth } from "../context/AuthContext";
import {
  createCommunityPost,
  createPostComment,
  deleteCommunityPost,
  deletePostComment,
  fetchCommunities,
  fetchPostComments,
  togglePostLike,
  uploadFile
} from "../lib/data";
import { resolveMediaUrl } from "../lib/media";
import type {
  CommunityDetail,
  CommunityPost,
  CommunityPostComment,
  UserRef
} from "../types";

// ─── helpers ──────────────────────────────────────────────────────────────────

const isImageUrl = (v: string) =>
  [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].some((e) =>
    v.split("?")[0].toLowerCase().endsWith(e)
  );

const isVideoUrl = (v: string) =>
  [".mp4", ".webm", ".mov", ".m3u8"].some((e) =>
    v.split("?")[0].toLowerCase().endsWith(e)
  );

const getMediaAttachment = (post: CommunityPost) => {
  if (post.coverUrl) {
    if (isImageUrl(post.coverUrl)) return { url: post.coverUrl, kind: "image" as const };
    if (isVideoUrl(post.coverUrl)) return { url: post.coverUrl, kind: "video" as const };
  }
  const att = post.attachments.find(
    (a) =>
      a.mimeType?.startsWith("image/") ||
      a.mimeType?.startsWith("video/") ||
      isImageUrl(a.fileUrl) ||
      isVideoUrl(a.fileUrl)
  );
  if (!att) return null;
  return {
    url: att.fileUrl,
    kind: (att.mimeType?.startsWith("video/") || isVideoUrl(att.fileUrl)
      ? "video"
      : "image") as "image" | "video"
  };
};

const getDocAttachments = (post: CommunityPost) =>
  post.attachments.filter(
    (a) =>
      !a.mimeType?.startsWith("image/") &&
      !a.mimeType?.startsWith("video/") &&
      !isImageUrl(a.fileUrl) &&
      !isVideoUrl(a.fileUrl)
  );

const relativeTime = (iso?: string | null): string => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return `hace ${Math.floor(d / 7)} sem`;
};

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(d);
    const time = new Intl.DateTimeFormat("es-ES", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
    return `${date}, ${time} (${relativeTime(iso)})`;
  } catch {
    return "";
  }
};

const initials = (first: string, last: string) =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

/** Usa la foto del usuario logueado en sus propios posts (prioriza imageUrl del perfil). */
const mergeAuthorAvatar = (
  author: Pick<UserRef, "id" | "firstName" | "lastName" | "avatarUrl">,
  currentUser: { id?: string; avatarUrl?: string | null }
) => {
  if (
    currentUser.id &&
    currentUser.avatarUrl &&
    author.id &&
    String(author.id) === String(currentUser.id)
  ) {
    return { ...author, avatarUrl: currentUser.avatarUrl };
  }
  return author;
};

// ─── video embed detection ────────────────────────────────────────────────────

const YT_REGEX =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
const VIMEO_REGEX = /vimeo\.com\/(?:video\/)?(\d+)/;

interface VideoEmbed {
  iframeUrl: string;
  type: "youtube" | "vimeo";
}

const getVideoEmbed = (rawUrl?: string | null): VideoEmbed | null => {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  const yt = url.match(YT_REGEX);
  if (yt) return { iframeUrl: `https://www.youtube.com/embed/${yt[1]}?rel=0`, type: "youtube" };
  const vm = url.match(VIMEO_REGEX);
  if (vm) return { iframeUrl: `https://player.vimeo.com/video/${vm[1]}`, type: "vimeo" };
  return null;
};

// ─── extended post type ──────────────────────────────────────────────────────

interface LocalMedia {
  url: string;       // object URL for preview, replaced with remote URL after upload
  file?: File;       // actual File object — only present before upload
  kind: "image" | "video" | "doc";
  name?: string;
}

interface LocalPost extends CommunityPost {
  localMedia?: LocalMedia[];
  localLink?: string;
  localLikes?: number;
}

// ─── demo data ───────────────────────────────────────────────────────────────

const demoPosts: LocalPost[] = [
  {
    id: "p1",
    communityId: "c1",
    title: "Resultados del Torneo Interescolar",
    content:
      "¡Felicitamos a todos los alumnos que participaron en el torneo interescolar! Nuestros chicos demostraron un gran nivel técnico y deportivo.\n\nEl equipo de Natación Infantil obtuvo el segundo lugar en la categoría 8-10 años, y varios alumnos del grupo Avanzado clasificaron para la siguiente fase regional.\n\n¡Sigamos entrenando fuerte!",
    coverUrl: null,
    status: "PUBLISHED",
    membersOnly: false,
    publishedAt: new Date(Date.now() - 3_600_000 * 2).toISOString(),
    author: { id: "a1", firstName: "Coach", lastName: "Marcos", avatarUrl: null },
    attachments: [],
    localLikes: 8
  },
  {
    id: "p2",
    communityId: "c1",
    title: "Cambio de horario — Pileta A",
    content:
      "Les informamos que la clase del lunes en Pileta A se traslada a las 17:00 hs. por trabajos de mantenimiento. Los cambios son temporales y durarán aproximadamente dos semanas. Disculpen las molestias.",
    coverUrl: null,
    status: "PUBLISHED",
    membersOnly: true,
    publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
    author: { id: "a2", firstName: "Prof.", lastName: "Gómez", avatarUrl: null },
    attachments: [],
    localLikes: 3
  },
  {
    id: "p3",
    communityId: "c2",
    title: "Tips para mejorar el estilo crol",
    content:
      "Esta semana trabajamos en la posición de la cabeza durante el crol. Recordá mantenerla alineada con la columna para reducir la resistencia en el agua.\n\n• La cabeza debe mirar hacia abajo.\n• La oreja debe quedar sumergida al rotar.\n• Codos altos en la entrada mejoran la tracción.",
    coverUrl: null,
    status: "PUBLISHED",
    membersOnly: false,
    publishedAt: new Date(Date.now() - 259_200_000).toISOString(),
    author: { id: "a2", firstName: "Prof.", lastName: "Gómez", avatarUrl: null },
    attachments: [],
    localLikes: 5
  }
];

// ─── Avatar ──────────────────────────────────────────────────────────────────

interface AvatarProps {
  user: Pick<UserRef, "firstName" | "lastName" | "avatarUrl">;
  size?: "sm" | "md";
}

const Avatar = ({ user, size = "md" }: AvatarProps) => {
  const [imgFailed, setImgFailed] = useState(false);
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]";
  const src = resolveMediaUrl(user.avatarUrl);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        alt={`${user.firstName} ${user.lastName}`}
        onError={() => setImgFailed(true)}
        className={`${dim} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-[var(--primary-softer)] font-bold text-[var(--primary)]`}
    >
      {initials(user.firstName, user.lastName)}
    </div>
  );
};

// ─── CommentAuthor helper ─────────────────────────────────────────────────────

const commentDisplayName = (c: CommunityPostComment) => {
  if (c.firstName || c.lastName) return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
  return c.authorName ?? "Usuario";
};

// ─── PostCard ────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: LocalPost;
  onToggleLike: (postId: string, communityId: string) => Promise<void>;
  onDelete?: (postId: string, communityId: string) => Promise<void>;
  currentUser: { id?: string; firstName: string; lastName: string; avatarUrl?: string | null };
}

const CONTENT_THRESHOLD = 240;

const PostCard = ({ post, onToggleLike, onDelete, currentUser }: PostCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommunityPostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const media = getMediaAttachment(post);
  const docs = getDocAttachments(post);
  const isLong = post.content.length > CONTENT_THRESHOLD;
  const liked = post.likedByMe ?? false;
  const likeCount = post.likesCount ?? post.localLikes ?? 0;
  const localImages = post.localMedia?.filter((m) => m.kind === "image" || m.kind === "video") ?? [];
  const localDocs = post.localMedia?.filter((m) => m.kind === "doc") ?? [];
  const body = post.content.trim();
  const title = post.title.trim();
  const firstLine = body.split("\n")[0]?.trim() ?? "";
  /** Título aparte solo si es distinto del cuerpo (evita duplicar en posts de una línea). */
  const distinctTitle = Boolean(title && title !== body && title !== firstLine);
  const isAuthor = Boolean(
    currentUser.id && post.author.id && String(post.author.id) === String(currentUser.id)
  );
  const displayAuthor = mergeAuthorAvatar(post.author, currentUser);

  const toggleComments = async () => {
    const next = !showComments;
    setShowComments(next);
    if (next && comments.length === 0) {
      setCommentsLoading(true);
      try {
        const data = await fetchPostComments(post.communityId, post.id);
        setComments(data);
      } catch {
        // leave empty, user can still write
      } finally {
        setCommentsLoading(false);
        setTimeout(() => commentInputRef.current?.focus(), 100);
      }
    } else if (next) {
      setTimeout(() => commentInputRef.current?.focus(), 100);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await deletePostComment(post.communityId, post.id, commentId);
    } catch {
      // silently ignore — comment already removed optimistically
    }
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || sending) return;
    setSending(true);
    const optimistic: CommunityPostComment = {
      id: `opt-${Date.now()}`,
      postId: post.id,
      content: commentText.trim(),
      createdAt: new Date().toISOString(),
      authorId: "me",
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      avatarUrl: currentUser.avatarUrl ?? null
    };
    setComments((prev) => [...prev, optimistic]);
    setCommentText("");
    try {
      const created = await createPostComment(post.communityId, post.id, optimistic.content);
      setComments((prev) => prev.map((c) => (c.id === optimistic.id ? created : c)));
    } catch {
      // keep optimistic comment visible
    } finally {
      setSending(false);
    }
  };

  const handleDeletePost = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete(post.id, post.communityId);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgb(0,0,0,0.06)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3.5 pb-2 pt-3.5">
        <Avatar user={displayAuthor} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-none text-slate-900">
            {post.author.firstName} {post.author.lastName}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400">
            {formatDateTime(post.publishedAt ?? post.createdAt)}
            {post.membersOnly && (
              <span className="inline-flex items-center gap-0.5 text-violet-500">
                <MaterialIcon name="lock" className="text-[10px]" />
                Solo miembros
              </span>
            )}
          </p>
        </div>
        {isAuthor && onDelete && (
          <button
            type="button"
            onClick={() => void handleDeletePost()}
            disabled={deleting}
            title="Eliminar publicación"
            className="shrink-0 rounded-full p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
          >
            <MaterialIcon name="delete" className="text-[16px]" />
          </button>
        )}
      </div>

      {/* Texto */}
      {distinctTitle && (
        <p className="px-3.5 pb-1 text-[13px] font-bold leading-snug text-slate-900">
          {title}
        </p>
      )}

      <div className="px-3.5 pb-2.5">
        {body && (
          expanded || !isLong ? (
            <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-600">
              {body}
            </p>
          ) : (
            <p className="line-clamp-3 text-[13px] leading-relaxed text-slate-600">
              {body.replace(/\n/g, " ")}
            </p>
          )
        )}
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 text-[11px] font-semibold text-[var(--primary)]"
          >
            {expanded ? "Ver menos" : "Ver más"}
          </button>
        )}
      </div>

      {/* Local media */}
      {localImages.length > 0 && (
        <div className={`mx-3 mb-2.5 overflow-hidden rounded-xl ${localImages.length > 1 ? "grid grid-cols-2 gap-0.5" : ""}`}>
          {localImages.map((m, i) =>
            m.kind === "image" ? (
              <img key={i} src={m.url} alt={m.name ?? "Imagen"} loading="lazy" decoding="async"
                className={`w-full object-cover ${localImages.length === 1 ? "max-h-64 rounded-xl" : "aspect-square"}`} />
            ) : (
              <video key={i} src={m.url} controls
                className={`w-full bg-black ${localImages.length === 1 ? "max-h-64 rounded-xl" : "aspect-square object-cover"}`} />
            )
          )}
        </div>
      )}

      {/* API media */}
      {!localImages.length && media && (
        <div className="mx-3 mb-2.5 overflow-hidden rounded-xl bg-slate-100">
          {media.kind === "image" ? (
            <img src={media.url} alt={post.title} loading="lazy" decoding="async" className="w-full max-h-64 object-cover" />
          ) : (
            <video src={media.url} controls className="w-full max-h-64 bg-black" />
          )}
        </div>
      )}

      {/* Link — embed if YouTube/Vimeo, chip otherwise */}
      {post.localLink && (() => {
        const embed = getVideoEmbed(post.localLink);
        if (embed) {
          return (
            <div className="mx-3 mb-2.5 overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16/9" }}>
              <iframe
                src={embed.iframeUrl}
                title="Video"
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          );
        }
        return (
          <a href={post.localLink} target="_blank" rel="noopener noreferrer"
            className="mx-3 mb-2.5 flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-slate-100">
            <MaterialIcon name="link" className="shrink-0 text-sm text-[var(--primary)]" />
            <span className="truncate text-[11px] font-medium text-[var(--primary)]">{post.localLink}</span>
            <MaterialIcon name="open_in_new" className="ml-auto shrink-0 text-[10px] text-slate-400" />
          </a>
        );
      })()}

      {/* Docs */}
      {(docs.length > 0 || localDocs.length > 0) && (
        <div className="mx-3 mb-2.5 space-y-1.5">
          {docs.map((att, i) => (
            <a key={i} href={att.fileUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-100">
              <MaterialIcon name="description" className="text-sm text-slate-400" />
              <span className="truncate">{att.fileName}</span>
              <MaterialIcon name="download" className="ml-auto shrink-0 text-sm text-slate-400" />
            </a>
          ))}
          {localDocs.map((m, i) => (
            <a key={`ld-${i}`} href={m.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-100">
              <MaterialIcon name="description" className="text-sm text-slate-400" />
              <span className="truncate">{m.name ?? "Documento"}</span>
              <MaterialIcon name="download" className="ml-auto shrink-0 text-sm text-slate-400" />
            </a>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center border-t border-slate-50 px-2 py-1">
        <button type="button" onClick={() => void onToggleLike(post.id, post.communityId)}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
            liked ? "bg-red-50 text-red-500" : "text-slate-400 hover:bg-slate-50 hover:text-red-400"
          }`}>
          <MaterialIcon name="favorite" filled={liked} className="text-sm" />
          <span>{likeCount}</span>
        </button>
        <button type="button" onClick={toggleComments}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
            showComments ? "bg-[var(--primary-softer)] text-[var(--primary)]" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          }`}>
          <MaterialIcon name={showComments ? "chat_bubble" : "chat_bubble_outline"} filled={showComments} className="text-sm" />
          <span>
            {comments.length > 0
              ? comments.length
              : (post.commentsCount ?? 0) > 0
                ? post.commentsCount
                : "Comentar"}
          </span>
        </button>
      </div>

      {/* Comments panel */}
      {showComments && (
        <div className="border-t border-slate-50 bg-slate-50/60 px-3.5 pb-3 pt-2.5">
          {/* List */}
          {commentsLoading ? (
            <p className="py-2 text-center text-[11px] text-slate-400">Cargando comentarios...</p>
          ) : comments.length === 0 ? (
            <p className="pb-2 text-[11px] text-slate-400">Sé el primero en comentar.</p>
          ) : (
            <div className="mb-2.5 space-y-2.5">
              {comments.map((c) => {
                const name = commentDisplayName(c);
                const avatarUser = { firstName: c.firstName ?? name.split(" ")[0] ?? "", lastName: c.lastName ?? name.split(" ")[1] ?? "", avatarUrl: c.avatarUrl };
                return (
                  <div key={c.id} className="flex gap-2 group">
                    <Avatar user={avatarUser} size="sm" />
                    <div className="flex-1 rounded-2xl rounded-tl-none bg-white px-3 py-2 shadow-[0_1px_4px_rgb(0,0,0,0.05)]">
                      <p className="text-[11px] font-semibold text-slate-800">{name}</p>
                      <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-slate-600">{c.content}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{relativeTime(c.createdAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteComment(c.id)}
                      className="self-start mt-1 opacity-0 group-hover:opacity-100 rounded-full p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 transition-all"
                    >
                      <MaterialIcon name="delete" className="text-sm" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Input */}
          <div className="flex items-center gap-2">
            <Avatar user={currentUser} size="sm" />
            <div className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
              <input
                ref={commentInputRef}
                type="text"
                placeholder="Escribí un comentario..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSendComment(); } }}
                className="flex-1 bg-transparent text-[12px] text-slate-800 placeholder-slate-400 outline-none"
              />
              <button
                type="button"
                onClick={handleSendComment}
                disabled={!commentText.trim() || sending}
                className="text-[var(--primary)] transition-opacity disabled:opacity-30"
              >
                <MaterialIcon name="send" filled className="text-[16px]" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PostComposer ────────────────────────────────────────────────────────────

interface PostComposerProps {
  communities: CommunityDetail[];
  currentUser: { id?: string; firstName: string; lastName: string; avatarUrl?: string | null };
  defaultCommunityId: string;
  onPost: (post: LocalPost) => void;
}

const PostComposer = ({
  communities,
  currentUser,
  defaultCommunityId,
  onPost
}: PostComposerProps) => {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState("");
  const [link, setLink] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [membersOnly, setMembersOnly] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState(defaultCommunityId);
  const [attachments, setAttachments] = useState<LocalMedia[]>([]);
  const [posting, setPosting] = useState(false);

  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (defaultCommunityId) setSelectedCommunityId(defaultCommunityId);
  }, [defaultCommunityId]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, kind: "image" | "video" | "doc") => {
    const files = Array.from(e.target.files ?? []);
    setAttachments((prev) => [
      ...prev,
      ...files.map((f) => ({ url: URL.createObjectURL(f), file: f, kind, name: f.name }))
    ]);
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index]?.url ?? "");
      copy.splice(index, 1);
      return copy;
    });
  };

  const handlePost = async () => {
    if (!content.trim()) return;
    setPosting(true);

    const title = content.split("\n")[0].slice(0, 80) || "Publicación";
    const communityId = selectedCommunityId || communities[0]?.id || "c1";

    // 1. Upload files and collect persistent URLs
    let coverUrl: string | undefined;
    const resolvedMedia: LocalMedia[] = [];

    for (const att of attachments) {
      if (!att.file) {
        resolvedMedia.push(att);
        continue;
      }
      try {
        const remoteUrl = await uploadFile(att.file, "COMMUNITIES", communityId);
        // Revoke local object URL to free memory
        URL.revokeObjectURL(att.url);
        const resolved: LocalMedia = { url: remoteUrl, kind: att.kind, name: att.name };
        resolvedMedia.push(resolved);
        // First image/video becomes coverUrl
        if (!coverUrl && (att.kind === "image" || att.kind === "video")) {
          coverUrl = remoteUrl;
        }
      } catch {
        // Upload failed — keep local URL for current session
        resolvedMedia.push({ url: att.url, kind: att.kind, name: att.name });
      }
    }

    // 2. Create post in API
    let createdId = `local-${Date.now()}`;
    try {
      if (communityId) {
        const created = await createCommunityPost(communityId, {
          title,
          content: content.trim(),
          status: "PUBLISHED",
          coverUrl,
          membersOnly
        });
        if (created.id) createdId = created.id;
      }
    } catch {
      /* publish locally even if API fails */
    }

    // 3. Add to local feed
    onPost({
      id: createdId,
      communityId,
      title,
      content: content.trim(),
      coverUrl: coverUrl ?? null,
      status: "PUBLISHED",
      membersOnly,
      publishedAt: new Date().toISOString(),
      author: {
        id: currentUser.id || "me",
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        avatarUrl: currentUser.avatarUrl ?? null
      },
      attachments: [],
      localMedia: resolvedMedia.length > 0 ? resolvedMedia : undefined,
      localLink: link.trim() || undefined,
      localLikes: 0
    });

    setContent("");
    setLink("");
    setAttachments([]);
    setMembersOnly(false);
    setShowLinkInput(false);
    setExpanded(false);
    setPosting(false);
  };

  const cancel = () => {
    setExpanded(false);
    setContent("");
    setLink("");
    setAttachments([]);
    setShowLinkInput(false);
  };

  const communityOptions: SelectOption[] = communities.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="mb-4 overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_rgb(0,0,0,0.06)]">
      <input ref={photoRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => handleFileInput(e, "image")} />
      <input ref={videoRef} type="file" accept="video/*" multiple className="hidden"
        onChange={(e) => handleFileInput(e, "video")} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" multiple className="hidden"
        onChange={(e) => handleFileInput(e, "doc")} />

      {/* Collapsed */}
      {!expanded && (
        <button
          type="button"
          onClick={() => { setExpanded(true); setTimeout(() => textareaRef.current?.focus(), 60); }}
          className="flex w-full items-center gap-2.5 p-3"
        >
          <Avatar user={currentUser} />
          <span className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[13px] text-slate-400 text-left">
            ¿Qué querés compartir con la comunidad?
          </span>
        </button>
      )}

      {/* Expanded */}
      {expanded && (
        <div className="p-3">
          {/* Author + audience */}
          <div className="mb-2.5 flex items-center gap-2.5">
            <Avatar user={currentUser} />
            <p className="flex-1 text-[13px] font-semibold text-slate-900">
              {currentUser.firstName} {currentUser.lastName}
            </p>
            <button
              type="button"
              onClick={() => setMembersOnly((v) => !v)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                membersOnly
                  ? "bg-violet-100 text-violet-600"
                  : "bg-[var(--primary-softer)] text-[var(--primary)]"
              }`}
            >
              <MaterialIcon name={membersOnly ? "lock" : "public"} className="text-[10px]" />
              {membersOnly ? "Solo miembros" : "Público"}
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="¿Qué querés compartir con la comunidad?"
            rows={3}
            className="w-full resize-none border-0 bg-transparent text-[13px] leading-relaxed text-slate-800 placeholder-slate-400 outline-none"
          />

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attachments.map((att, i) => (
                <div key={i} className="relative">
                  {att.kind === "image" ? (
                    <img src={att.url} alt={att.name} decoding="async" className="h-16 w-16 rounded-xl object-cover" />
                  ) : att.kind === "video" ? (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
                      <MaterialIcon name="videocam" className="text-xl text-slate-400" />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                      <MaterialIcon name="description" className="text-lg text-slate-400" />
                      <span className="mt-0.5 line-clamp-2 text-center text-[8px] text-slate-500">{att.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-700 text-white"
                  >
                    <MaterialIcon name="close" className="text-[9px]" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Link input */}
          {showLinkInput && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <MaterialIcon name="link" className="shrink-0 text-sm text-slate-400" />
                <input
                  type="url"
                  placeholder="https://..."
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[13px] placeholder-slate-400 outline-none"
                />
                {link && (
                  <button type="button" onClick={() => setLink("")} className="text-slate-400">
                    <MaterialIcon name="close" className="text-sm" />
                  </button>
                )}
              </div>
              {/* Embed preview */}
              {getVideoEmbed(link) && (
                <div className="overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16/9" }}>
                  <iframe
                    src={getVideoEmbed(link)!.iframeUrl}
                    title="Vista previa"
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div className="mt-2.5 flex items-center gap-0.5 border-t border-slate-100 pt-2.5">
            <button type="button" title="Foto" onClick={() => photoRef.current?.click()}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-green-50 hover:text-green-600">
              <MaterialIcon name="photo_camera" className="text-[18px]" />
            </button>
            <button type="button" title="Video" onClick={() => videoRef.current?.click()}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600">
              <MaterialIcon name="videocam" className="text-[18px]" />
            </button>
            <button type="button" title="Documento" onClick={() => docRef.current?.click()}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-orange-50 hover:text-orange-600">
              <MaterialIcon name="attach_file" className="text-[18px]" />
            </button>
            <button type="button" title="Agregar link" onClick={() => setShowLinkInput((v) => !v)}
              className={`rounded-full p-2 transition-colors ${
                showLinkInput ? "bg-purple-50 text-purple-600" : "text-slate-500 hover:bg-purple-50 hover:text-purple-600"
              }`}>
              <MaterialIcon name="link" className="text-[18px]" />
            </button>
            <button type="button" onClick={cancel}
              className="ml-auto text-[12px] font-semibold text-slate-400 hover:text-slate-600">
              Cancelar
            </button>
            <button type="button" onClick={handlePost}
              disabled={!content.trim() || posting}
              className="ml-2 flex items-center gap-1 rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40">
              {posting ? "Publicando..." : "Publicar"}
              <MaterialIcon name="send" className="text-xs" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SocialPage ──────────────────────────────────────────────────────────────

export const SocialPage = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<LocalPost[]>([]);
  const [communities, setCommunities] = useState<CommunityDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCommunityId, setFilterCommunityId] = useState<string>("");
  const [displayCount, setDisplayCount] = useState(10);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await fetchCommunities();
        setCommunities(result);
        const allPosts = result.flatMap((c) =>
          c.posts.filter((p) => p.status !== "ARCHIVED")
        );
        const sorted = [...allPosts].sort((a, b) => {
          const ta = Date.parse(a.publishedAt ?? a.createdAt ?? "") || 0;
          const tb = Date.parse(b.publishedAt ?? b.createdAt ?? "") || 0;
          return tb - ta;
        });
        setPosts(sorted.length > 0 ? sorted : demoPosts);
      } catch {
        setPosts(demoPosts);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  // Reset displayCount when filter changes
  useEffect(() => { setDisplayCount(10); }, [filterCommunityId]);

  // Infinite scroll sentinel — re-attach when posts first appear in DOM
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setDisplayCount((prev) => prev + 10);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [posts.length]);

  const handlePost = (post: LocalPost) => { setPosts((prev) => [post, ...prev]); setDisplayCount((c) => c + 1); };

  const handleDeletePost = async (postId: string, communityId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    try {
      await deleteCommunityPost(communityId, postId);
    } catch {
      /* already removed optimistically */
    }
  };

  const handleLike = async (postId: string, communityId: string) => {
    // Optimistic update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const nowLiked = !(p.likedByMe ?? false);
        const base = p.likesCount ?? p.localLikes ?? 0;
        return {
          ...p,
          likedByMe: nowLiked,
          likesCount: nowLiked ? base + 1 : Math.max(0, base - 1)
        };
      })
    );
    try {
      const result = await togglePostLike(communityId, postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id !== postId ? p : { ...p, likedByMe: result.liked, likesCount: result.count }
        )
      );
    } catch {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const reverted = !(p.likedByMe ?? false);
          const base = p.likesCount ?? 0;
          return {
            ...p,
            likedByMe: reverted,
            likesCount: reverted ? base + 1 : Math.max(0, base - 1)
          };
        })
      );
    }
  };

  const currentUser = user
    ? { id: user.id, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl ?? null }
    : { firstName: "Prof.", lastName: "Vos", avatarUrl: null };

  const filteredPosts = filterCommunityId
    ? posts.filter((p) => p.communityId === filterCommunityId)
    : posts;

  const communityOptions: SelectOption[] = [
    { value: "", label: "Todas las comunidades" },
    ...communities.map((c) => ({ value: c.id, label: c.name }))
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-20">
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--primary)]" />
        <p className="text-xs text-slate-400">Cargando comunidad...</p>
      </div>
    );
  }

  return (
    <div className="px-3.5 pb-6 pt-4">
      {/* Header */}
      <header className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">Comunidad</h1>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {filteredPosts.length} publicaciones
        </p>
        {communities.length > 0 && (
          <CustomSelect
            options={communityOptions}
            value={filterCommunityId}
            onChange={setFilterCommunityId}
            placeholder="Todas las comunidades"
            className="mt-3"
          />
        )}
      </header>

      {/* Composer */}
      <PostComposer
        communities={communities}
        currentUser={currentUser}
        defaultCommunityId={filterCommunityId || communities[0]?.id || ""}
        onPost={handlePost}
      />

      {/* Feed */}
      {filteredPosts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 py-10 text-center">
          <MaterialIcon name="people" className="text-3xl text-slate-200" />
          <h3 className="text-sm font-semibold text-slate-600">Sin publicaciones aún</h3>
          <p className="text-xs text-slate-400">Sé el primero en publicar algo para tu comunidad.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPosts.slice(0, displayCount).map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onToggleLike={handleLike}
              onDelete={handleDeletePost}
              currentUser={currentUser}
            />
          ))}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
          {displayCount < filteredPosts.length && (
            <p className="py-3 text-center text-[11px] text-slate-400">
              Cargando más...
            </p>
          )}
        </div>
      )}
    </div>
  );
};
