import { useLocation } from "react-router";
import { RailSlotOutlet } from "@/components/layout/RailSlot";

/** The current path and search of the memory router, for tests of mode switches. */
export function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

/** The session rail's slot: a page's `RailSection` renders in here. */
export function Rail() {
  return (
    <aside aria-label="Session panel">
      <RailSlotOutlet />
    </aside>
  );
}
