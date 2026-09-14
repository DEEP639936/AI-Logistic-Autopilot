"use client";

import { ShipmentDrawer } from "@/components/views/ShipmentsView";

/**
 * Global host so the shipment drawer can open from any surface
 * (command-center map clicks, risk radar rows) — not just the shipments view.
 */
export function ShipmentDrawerHost() {
  return <ShipmentDrawer />;
}
