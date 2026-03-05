import * as React from "react";

export function Input({
    className = "",
    ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            className={[
                "w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]",
                "placeholder:text-[var(--muted2)] outline-none focus:border-[rgba(var(--accent),0.35)]",
                "focus:shadow-[0_0_0_4px_rgba(var(--accent),0.10)]",
                className,
            ].join(" ")}
            {...props}
        />
    );
}
