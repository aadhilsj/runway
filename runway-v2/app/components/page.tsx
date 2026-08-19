import type { ReactNode } from "react";

export function Page({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return (
    <section className="page-stack">
      <header className="page-header"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></header>
      {children ?? <EmptyState />}
    </section>
  );
}

export function EmptyState() {
  return <div className="empty-card"><div className="empty-rule" aria-hidden="true"/><h2>Ready for your data</h2><p>This workspace is wired for the normalized model planned in Phase 2. No financial values are being fabricated.</p></div>;
}
