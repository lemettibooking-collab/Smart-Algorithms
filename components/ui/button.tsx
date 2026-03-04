import * as React from "react";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, string> = {
    primary:
        "border-[rgba(var(--accent),0.35)] bg-[rgba(var(--accent),0.12)] text-white/90 hover:bg-[rgba(var(--accent),0.18)]",
    secondary:
        "border-white/10 bg-white/5 text-white/80 hover:bg-white/8",
    ghost:
        "border-transparent bg-transparent text-white/70 hover:bg-white/5 hover:text-white/90",
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