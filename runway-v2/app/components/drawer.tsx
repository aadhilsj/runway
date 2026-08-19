import { useEffect, useRef, type ReactNode } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  children: ReactNode;
};

export function Drawer({ open, onClose, eyebrow, title, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

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
      className="drawer"
      ref={ref}
      aria-labelledby="drawer-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <div className="drawer-header">
        <div>
          {eyebrow ? <p className="section-kicker">{eyebrow}</p> : null}
          <h2 id="drawer-title">{title}</h2>
        </div>
        <button className="drawer-close" type="button" onClick={onClose} aria-label="Close panel">×</button>
      </div>
      <div className="drawer-body">{children}</div>
    </dialog>
  );
}
