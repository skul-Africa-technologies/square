import { ButtonHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = "primary", size = "md", ...props }, ref
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center font-medium transition disabled:opacity-50 disabled:cursor-not-allowed",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "sm" && "px-3 py-1.5 text-xs",
        variant === "primary" && "bg-lime text-bg",
        variant === "secondary" && "bg-[var(--blue-deep)] text-[var(--blue)] border border-[var(--blue-border-line)]",
        variant === "ghost" && "bg-transparent text-muted hover:text-text hover:bg-surface",
        className
      )}
      style={variant === "primary" ? { clipPath: "polygon(10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px), 0 10px)" } : undefined}
      {...props}
    />
  );
});
