import type { SVGProps } from "react";

export function MarkIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" {...props}><path d="M5 23.5 13.2 7l4.1 9.1L27 7.8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 25h22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>;
}

export function SyncIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" {...props}><path d="M16.5 7A7 7 0 0 0 4 5.2L2.5 7M3.5 13A7 7 0 0 0 16 14.8l1.5-1.8M2.5 3v4h4M17.5 17v-4h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
