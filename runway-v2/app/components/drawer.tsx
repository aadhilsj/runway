import { useEffect, useId, useRef, type ReactNode } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  className?: string;
};

export function Drawer({ open, onClose, eyebrow, title, children, className = "" }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      className={`drawer${className ? ` ${className}` : ""}`}
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="drawer-header">
        <div>
          {eyebrow ? <p className="section-kicker">{eyebrow}</p> : null}
          <h2 id={titleId}>{title}</h2>
        </div>
        <button className="drawer-close" type="button" onClick={onClose} aria-label="Close panel">×</button>
      </div>
      <div className="drawer-body">{children}</div>
    </dialog>
  );
}
