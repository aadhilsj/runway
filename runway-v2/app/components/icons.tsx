import type { ReactNode, SVGProps } from "react";

export function MarkIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" {...props}><path d="M5 23.5 13.2 7l4.1 9.1L27 7.8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 25h22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>;
}

export function SyncIcon(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" {...props}><path d="M16.5 7A7 7 0 0 0 4 5.2L2.5 7M3.5 13A7 7 0 0 0 16 14.8l1.5-1.8M2.5 3v4h4M17.5 17v-4h-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export type NavigationIconName = "overview" | "forecast" | "funds" | "activity" | "more";

export function NavigationIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: NavigationIconName }) {
  const paths: Record<NavigationIconName, ReactNode> = {
    overview: <><path d="M4 10.5 10 5l6 5.5V17H4Z"/><path d="M8 17v-4h4v4"/></>,
    forecast: <><path d="M3.5 15.5 7.5 11l3 2.5 5.5-7"/><path d="M3.5 4v12h13"/></>,
    funds: <><path d="M4 7.5h12v8H4z"/><path d="M6 7.5V5h8v2.5M10 10v3"/></>,
    activity: <><path d="M4 5.5h12M4 10h12M4 14.5h8"/><circle cx="3" cy="5.5" r=".4"/><circle cx="3" cy="10" r=".4"/><circle cx="3" cy="14.5" r=".4"/></>,
    more: <><circle cx="4" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="16" cy="10" r="1"/></>,
  };
  return <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}
