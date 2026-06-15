import type { HTMLAttributes } from "react";

interface MaterialIconProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  filled?: boolean;
}

export const MaterialIcon = ({ name, filled = false, className, ...props }: MaterialIconProps) => {
  const classes = ["material-symbols-rounded", filled ? "icon-filled" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <span aria-hidden="true" className={classes} {...props}>
      {name}
    </span>
  );
};
