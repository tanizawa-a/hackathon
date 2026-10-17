import type { CSSProperties, ReactNode } from "react";
import type { GridLayout } from "../types";

export function Grid({ layout, children }: { layout: GridLayout; children: ReactNode }) {
  const style = { "--cols": layout.cols, "--rows": layout.rows } as CSSProperties;
  return (
    <div className="grid" style={style}>
      {children}
    </div>
  );
}
