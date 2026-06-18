import type { StudentSummary } from "../types";

const getInitials = (s: Pick<StudentSummary, "firstName" | "lastName">) =>
  `${s.firstName.charAt(0)}${s.lastName.charAt(0)}`.toUpperCase();

interface StudentAvatarProps {
  student: Pick<StudentSummary, "firstName" | "lastName" | "imageUrl">;
  className?: string;
}

export const StudentAvatar = ({ student, className = "h-10 w-10" }: StudentAvatarProps) => {
  const label = `${student.firstName} ${student.lastName}`.trim();

  if (student.imageUrl) {
    return (
      <img
        src={student.imageUrl}
        alt={label}
        className={`shrink-0 rounded-xl object-cover ${className}`}
      />
    );
  }

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-xl bg-[var(--primary)] text-sm font-bold text-white ${className}`}
    >
      {getInitials(student)}
    </span>
  );
};
