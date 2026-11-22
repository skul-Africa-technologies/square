import type { ReactNode } from "react";
import { CommunityStrip } from "./CommunityStrip";

export function MobileSheet({ children }: { children: ReactNode }) {
  return (
    <div className="mobile-sheet-layout">
      <div className="mobile-strip">
        <CommunityStrip />
      </div>
      <div className="mobile-sheet" data-testid="mobile-sheet">
        {children}
      </div>
    </div>
  );
}
