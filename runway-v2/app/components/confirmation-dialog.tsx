import { useEffect, useId, useRef, type ReactNode } from "react";

type ConfirmationDialogProps = {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
};

export function ConfirmationDialog({ children, open, onClose, eyebrow, title }: ConfirmationDialogProps) {
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
      ref={ref}
      className="confirmation-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={onClose}
    >
      <div className="confirmation-dialog-header">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 id={titleId}>{title}</h2>
      </div>
      <div className="confirmation-dialog-body">{children}</div>
    </dialog>
  );
}
