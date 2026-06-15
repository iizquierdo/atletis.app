import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useStudents } from "../context/StudentContext";
import { extractErrorMessage } from "../lib/api";
import { fetchCommunities } from "../lib/data";
import type { CommunityDetail, CommunityPost } from "../types";

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

const truncate = (value: string, max = 170) => {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}...`;
};

export const SocialPage = () => {
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

  const visiblePosts = useMemo(() => {
    const allPosts = communities.flatMap((community) => community.posts);
    const nonArchived = allPosts.filter((post) => post.status !== "ARCHIVED");
    const published = nonArchived.filter((post) => post.status === "PUBLISHED");
    const base = published.length > 0 ? published : nonArchived;

    return [...base].sort(
      (a, b) => getDateValue(b.publishedAt ?? b.createdAt) - getDateValue(a.publishedAt ?? a.createdAt)
    );
  }, [communities]);

  const featuredPost = visiblePosts[0] ?? null;

  const communityNames = useMemo(
    () => Array.from(new Set(communities.map((community) => community.name))),
    [communities]
  );

  const communityLabel =
    communityNames.length === 0
      ? "Sin comunidad asignada"
      : communityNames.length === 1
        ? communityNames[0]
        : `${communityNames[0]} +${communityNames.length - 1}`;

  return (
    <div className="screen-stack social-screen">
      {error && (
        <div className="error-banner">
          <MaterialIcon className="error-banner-icon" name="warning" />
          <span>{error}</span>
        </div>
      )}

      <section className="social-context">
        <h2>{selectedStudent ? `${selectedStudent.firstName} en comunidad` : "Comunidad del atleta"}</h2>
        <p>{communityLabel}</p>
      </section>

      <section className="social-featured-section">
        {loading && (
          <article className="empty-state-card">
            <p>Cargando publicaciones de comunidad...</p>
          </article>
        )}

        {!loading && !featuredPost && (
          <article className="empty-state-card">
            <p>
              No hay publicaciones disponibles para este alumno. Carga eventos y publicaciones en Admin y
              asignalo a la comunidad.
            </p>
          </article>
        )}

        {!loading && featuredPost && (
          <article className="social-featured-card">
            <div className="social-featured-media">
              {getMediaFromPost(featuredPost)?.url ? (
                <img alt={featuredPost.title} src={getMediaFromPost(featuredPost)!.url} />
              ) : (
                <div className="social-featured-placeholder">
                  <MaterialIcon name="imagesmode" />
                </div>
              )}
            </div>
            <div className="social-featured-content">
              <span>Featured Story</span>
              <h3>{featuredPost.title}</h3>
              <p>{truncate(featuredPost.content, 160)}</p>
              <Link to={`/social/${featuredPost.id}`}>
                Leer mas
                <MaterialIcon name="arrow_forward" />
              </Link>
            </div>
          </article>
        )}
      </section>
    </div>
  );
};
