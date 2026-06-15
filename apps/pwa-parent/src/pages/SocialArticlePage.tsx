import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import { extractErrorMessage } from "../lib/api";
import { fetchCommunities } from "../lib/data";
import type { CommunityDetail, CommunityPost } from "../types";

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

const isVideoUrl = (value: string) => {
  const normalized = value.split("?")[0].toLowerCase();
  return [".mp4", ".webm", ".mov", ".m3u8"].some((extension) => normalized.endsWith(extension));
};

const getMediaFromPost = (post: CommunityPost) => {
  if (post.coverUrl && (isImageUrl(post.coverUrl) || isVideoUrl(post.coverUrl))) {
    return { url: post.coverUrl, kind: isVideoUrl(post.coverUrl) ? "video" : ("image" as const) };
  }

  const attachment = post.attachments.find((item) => {
    if (item.mimeType?.startsWith("image/") || item.mimeType?.startsWith("video/")) return true;
    return isImageUrl(item.fileUrl) || isVideoUrl(item.fileUrl);
  });

  if (!attachment) return null;

  return {
    url: attachment.fileUrl,
    kind:
      attachment.mimeType?.startsWith("video/") || isVideoUrl(attachment.fileUrl)
        ? "video"
        : ("image" as const)
  };
};

export const SocialArticlePage = () => {
  const { postId } = useParams<{ postId: string }>();
  const { selectedStudent } = useStudents();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [communities, setCommunities] = useState<CommunityDetail[]>([]);

  const selectedStudentId = selectedStudent?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const fullCommunities = await fetchCommunities();

        const scopedCommunities = selectedStudentId
          ? fullCommunities.filter((community) =>
              community.members.some((member) => member.active && member.student.id === selectedStudentId)
            )
          : fullCommunities;

        if (cancelled) return;

        setCommunities(scopedCommunities);
      } catch (requestError) {
        if (cancelled) return;
        setError(extractErrorMessage(requestError));
        setCommunities([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedStudentId]);

  const article = useMemo(() => {
    for (const community of communities) {
      const post = community.posts.find((item) => item.id === postId);
      if (post) {
        return {
          ...post,
          communityName: community.name
        };
      }
    }

    return null;
  }, [communities, postId]);

  const heroMedia = article ? getMediaFromPost(article) : null;
  const publishedLabel = formatDate(article?.publishedAt ?? article?.createdAt);
  const attachments = article?.attachments ?? [];

  return (
    <div className="screen-stack social-screen social-article-page">
      <Link className="social-article-back" to="/social">
        <MaterialIcon name="arrow_back" />
        Volver a Social
      </Link>

      {loading && (
        <article className="empty-state-card">
          <p>Cargando articulo...</p>
        </article>
      )}

      {error && (
        <article className="empty-state-card">
          <p>{error}</p>
        </article>
      )}

      {!loading && !error && !article && (
        <article className="empty-state-card">
          <p>No encontramos este articulo para el alumno seleccionado.</p>
        </article>
      )}

      {!loading && !error && article && (
        <article className="social-featured-card social-article-card">
          <div className="social-featured-media social-article-media">
            {heroMedia?.url ? (
              heroMedia.kind === "video" ? (
                <video controls poster={article.coverUrl ?? undefined} src={heroMedia.url} />
              ) : (
                <img alt={article.title} src={heroMedia.url} />
              )
            ) : (
              <div className="social-featured-placeholder">
                <MaterialIcon name="article" />
              </div>
            )}
          </div>

          <div className="social-featured-content social-article-content">
            <span>Articulo completo</span>
            <h1>{article.title}</h1>

            <div className="social-article-meta">
              <small>{article.communityName}</small>
              <small>{publishedLabel}</small>
            </div>

            <div className="social-article-body">
              {article.content.split(/\r?\n/).map((paragraph, index) => (
                <p key={`${article.id}-${index}`}>{paragraph || "\u00A0"}</p>
              ))}
            </div>

            {attachments.length > 0 && (
              <div className="social-article-attachments">
                <h2>Archivos adjuntos</h2>
                <div className="social-article-links">
                  {attachments.map((attachment) => (
                    <a href={attachment.fileUrl} key={attachment.fileUrl} rel="noreferrer" target="_blank">
                      {attachment.fileName}
                      <MaterialIcon name="open_in_new" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>
      )}
    </div>
  );
};
