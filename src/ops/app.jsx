// OpsRamp Platform Capabilities: the second demo for SRS. Integration, event management, ServiceNow and AI, the
// nine-step walk-through of one store outage, and the outcomes. Same data, look and drill-downs as the console.
import React, { useState } from 'react';
import * as I from 'lucide-react';
import { SiteShell, useHashTab } from '../sites/shell.jsx';
import { Overview, Integration, Events, SnowAI, Outcomes } from './pages.jsx';
import { Demo } from './demo.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', icon: I.LayoutGrid },
  { id: 'integration', label: 'Integration', icon: I.Plug },
  { id: 'events', label: 'Event management', icon: I.Filter },
  { id: 'snow', label: 'ServiceNow and AI', icon: I.Ticket },
  { id: 'demo', label: 'Demo walk-through', icon: I.PlayCircle, tag: '9 steps' },
  { id: 'outcomes', label: 'Outcomes', icon: I.Target },
];

export default function OpsApp() {
  const [tab, setTab] = useHashTab(TABS, 'overview');
  const [step, setStep] = useState(0);
  const go = (t, i) => { if (i != null) setStep(i); setTab(t); };
  return (
    <SiteShell site="OpsRamp Platform Capabilities" sub="integration, event management, ServiceNow and AI" tabs={TABS} tab={tab} onTab={setTab}
      foot="Sample data for the SRS demo, built from the same live data as the console. Figures marked as vendor-measured are OpsRamp's; SRS's own figures are baselined during the pilot.">
      {tab === 'overview' && <Overview go={go} />}
      {tab === 'integration' && <Integration />}
      {tab === 'events' && <Events />}
      {tab === 'snow' && <SnowAI />}
      {tab === 'demo' && <Demo step={step} setStep={setStep} />}
      {tab === 'outcomes' && <Outcomes />}
    </SiteShell>
  );
}
