import { useState } from "react";
import type { StudentSummary } from "../types";
import { resolveMediaUrl } from "../lib/media";

const getInitials = (student: Pick<StudentSummary, "firstName" | "lastName">) =>
  `${student.firstName.charAt(0)}${student.lastName.charAt(0)}`.toUpperCase();

type StudentAvatarVariant = "default" | "active" | "hero" | "found";

interface StudentAvatarProps {
  student: Pick<StudentSummary, "firstName" | "lastName" | "imageUrl">;
  size?: string;
  shape?: "circle" | "rounded";
  variant?: StudentAvatarVariant;
  className?: string;
}

const variantClasses: Record<StudentAvatarVariant, string> = {
  default: "bg-slate-100 text-slate-600",
  active: "bg-[var(--primary)] text-white",
  hero: "bg-white/20 text-lg text-white",
  found: "bg-[var(--primary-soft)] text-[var(--primary)]"
};

export const StudentAvatar = ({
  student,
  size = "h-12 w-12",
  shape = "circle",
  variant = "default",
  className = ""
}: StudentAvatarProps) => {
  const [imgFailed, setImgFailed] = useState(false);
  const rounded = shape === "circle" ? "rounded-full" : "rounded-2xl";
  const initials = getInitials(student);
  const imageSrc = resolveMediaUrl(student.imageUrl);
  const showImage = Boolean(imageSrc) && !imgFailed;

  if (showImage) {
    return (
      <img
        alt={`${student.firstName} ${student.lastName}`}
        className={`${size} ${rounded} shrink-0 object-cover ${className}`}
        onError={() => setImgFailed(true)}
        src={imageSrc!}
      />
    );
  }

  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center ${rounded} text-sm font-bold ${variantClasses[variant]} ${className}`}
    >
      {initials || "?"}
    </span>
  );
};
