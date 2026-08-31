import type { ReactNode } from "react";

export function Page({ eyebrow, title, description, children, className = "" }: { eyebrow: string; title: string; description: string; children?: ReactNode; className?: string }) {
  return (
    <section className={`page-stack${className ? ` ${className}` : ""}`}>
      <header className="page-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header>
      {children ?? <EmptyState />}
    </section>
  );
}

export function EmptyState() {
  return <div className="empty-card"><div className="empty-rule" aria-hidden="true"/><h2>Nothing here yet</h2><p>Add your first item to begin.</p></div>;
}
