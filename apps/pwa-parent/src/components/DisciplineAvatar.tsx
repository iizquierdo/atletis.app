import { useState } from "react";
import { resolveMediaUrl } from "../lib/media";
import { MaterialIcon } from "./MaterialIcon";

interface DisciplineAvatarProps {
  name: string;
  imageUrl?: string | null;
  iconName: string;
  size?: string;
  className?: string;
}

export const DisciplineAvatar = ({
  name,
  imageUrl,
  iconName,
  size = "h-10 w-10",
  className = ""
}: DisciplineAvatarProps) => {
  const [imgFailed, setImgFailed] = useState(false);
  const imageSrc = resolveMediaUrl(imageUrl);
  const showImage = Boolean(imageSrc) && !imgFailed;

  if (showImage) {
    return (
      <img
        alt={name}
        className={`${size} shrink-0 rounded-xl object-cover ${className}`}
        onError={() => setImgFailed(true)}
        src={imageSrc!}
      />
    );
  }

  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-xl bg-[var(--primary-softer)] text-[var(--primary)] ${className}`}
    >
      <MaterialIcon name={iconName} filled />
    </span>
  );
};
