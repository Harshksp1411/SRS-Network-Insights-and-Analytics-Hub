// In the console, the drill-down can hand over to the console's own screens (Branch 360, the incident record, a screen)
// and act on a ticket; on the dashboards page there is no console, so this is empty and the drill-down is read-only.
import React from 'react';
export const DrillLinks = React.createContext(null);
