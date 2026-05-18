import type { PropsWithChildren } from "react";
import clsx from "clsx";

interface Props {
  title?: string;
  className?: string;
}

export function AsciiBox({ title, className, children }: PropsWithChildren<Props>) {
  return (
    <div className={clsx("ascii-box", className)}>
      {title && <div className="ascii-box-title">{title}</div>}
      {children}
    </div>
  );
}
