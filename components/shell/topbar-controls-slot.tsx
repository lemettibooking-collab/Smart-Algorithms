"use client";

import { createPortal } from "react-dom";
import { useSyncExternalStore } from "react";

function subscribe() {
    return () => { };
}

function getServerSnapshot() {
    return false;
}

function getClientSnapshot() {
    return true;
}

export default function TopbarControlsSlot({ children }: { children: React.ReactNode }) {
    const isClient = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
    if (!isClient) return null;

    const el = document.getElementById("topbar-slot");
    if (!el) return null;

    return createPortal(children, el);
}
