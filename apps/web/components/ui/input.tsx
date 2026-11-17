import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: string }>(function Input(
  { className, error, ...props }, ref
) {
  return (
    <div className="w-full">
      <input
        ref={ref}
        className={clsx(
          "w-full rounded-lg border bg-bg-2 px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-lime focus:outline-none",
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
});
