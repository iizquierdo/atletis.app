import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MaterialIcon } from "../components/MaterialIcon";
import { useAuth } from "../context/AuthContext";
import { uploadUserAvatar } from "../lib/data";
import { extractErrorMessage } from "../lib/api";
import { resolveMediaUrl } from "../lib/media";

export const PerfilPage = () => {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const avatarUrl = user?.avatarUrl ? resolveMediaUrl(user.avatarUrl) : null;
  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : "?";

  const handlePick = () => inputRef.current?.click();

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    setUploading(true);
    setError(null);
    setAvatarFailed(false);

    try {
      await uploadUserAvatar(user.id, file);
      await refreshProfile();
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  if (!user) return null;

  return (
    <div className="px-4 pb-6 pt-5">
      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          aria-label="Volver"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mi perfil</h1>
          <p className="text-sm text-slate-500">Tu foto se muestra en el encabezado de la app</p>
        </div>
      </header>

      <div className="rounded-3xl bg-white p-6 shadow-[0_4px_20px_rgb(0,0,0,0.04)]">
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handlePick}
            disabled={uploading}
            className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl bg-[var(--primary)] text-2xl font-bold text-white shadow-md disabled:opacity-60"
          >
            {avatarUrl && !avatarFailed ? (
              <img
                src={avatarUrl}
                alt={initials}
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              initials
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/20">
              <MaterialIcon name="photo_camera" className="text-2xl text-white opacity-0 transition-opacity hover:opacity-100" />
            </span>
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFile(e)}
          />

          <button
            type="button"
            onClick={handlePick}
            disabled={uploading}
            className="flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <MaterialIcon name="upload" className="text-sm" />
            {uploading ? "Subiendo..." : "Cambiar foto"}
          </button>

          <div className="w-full border-t border-slate-100 pt-4 text-center">
            <p className="font-bold text-slate-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <MaterialIcon name="error" className="mt-0.5 shrink-0 text-sm" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
