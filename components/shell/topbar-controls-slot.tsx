"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export default function TopbarControlsSlot({ children }: { children: React.ReactNode }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const el = document.getElementById("topbar-slot");
    if (!el) return null;

    return createPortal(children, el);
}