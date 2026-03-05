import * as React from "react";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, string> = {
    primary:
        "border-[rgba(var(--accent),0.35)] bg-[rgba(var(--accent),0.12)] text-[var(--text)] hover:bg-[rgba(var(--accent),0.18)]",
    secondary:
        "border-[var(--border)] bg-[var(--panel2)] text-[var(--muted)] hover:bg-[var(--hover)]",
    ghost:
        "border-transparent bg-transparent text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
};

export function Button({
    variant = "secondary",
    className = "",
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
    return (
        <button
            className={[
                "inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm",
                "transition",
                styles[variant],
                className,
            ].join(" ")}
            {...props}
        />
    );
}
