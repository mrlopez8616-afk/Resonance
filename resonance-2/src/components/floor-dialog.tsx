"use client";

import { useEffect, type ReactNode } from "react";

export function FloorDialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="floor-dialog-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="floor-dialog-title"
        className="floor-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="floor-dialog-title" className="floor-dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
