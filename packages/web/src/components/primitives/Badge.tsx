import type { ReactNode } from "react";
import "./Badge.css";

interface BadgeProps {
  children: ReactNode;
}

/** A small inline label, styled purely from tokens.css. */
export function Badge({ children }: BadgeProps) {
  return <span className="badge">{children}</span>;
}
