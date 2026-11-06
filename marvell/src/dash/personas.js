// The six roles with a dashboard. Each signs in with a demo account and sees only its own dashboard (role-based
// access): its numbers, charts, insights, live activity and scope. Passwords are shown on the sign-in screen: this
// is a static page with sample data, so the sign-in shows how access is split by role; it is not security.
// Each insight is a question put to Ask Mova iO, so the dashboard, its PDF export and the console all agree.
// `feed` is the live activity the role sees; `can` is what the role's access covers.
export const PERSONAS = [
  {
    id: 'cio', user: 'cio', password: 'Dash@CIO1', title: 'Chief Information Officer',
    focus: 'Is the business trading, what is it costing, and what needs my decision?',
    can: ['Branch health', 'Automation value', 'Decisions waiting', 'Service levels', 'Carrier credits', 'Capacity', 'Lifecycle risk'], feed: ['incidents', 'automation', 'changes', 'biab', 'carriers'],
    daily: [['Business impact', 'Which stores are down or degraded right now?'], ['Failover', 'Which stores are running on backup ISP only?'], ['Overnight', 'What failed overnight?'], ['Decisions', 'Which approvals are waiting on a human?'], ['Changes', 'What changed in the last 24 hours']],
    weekly: [['Last 7 days', "Summarize last week's incidents for my leadership report."], ['Self-healing', 'Which incidents were auto-remediated this week, and what was done?'], ['Next 7 days', 'What changes are scheduled next week?'], ['Projects', 'Which onboarding projects are red?']],
    monthly: [['Scorecard', 'What was network uptime and MTTR last month vs. target?'], ['Service levels', 'Show all SLA metrics'], ['Carriers', 'Which ISP circuits are flapping or breaching SLA this month?'], ['Looking ahead', 'Which sites will hit bandwidth or Wi-Fi capacity limits in the next 90 days?'], ['Lifecycle', 'When do the 2530 switches reach end of support?']],
  },
  {
    id: 'networks', user: 'head.networks', password: 'Dash@NET1', title: 'Head of Networks',
    focus: 'What is broken, why, what changed, and what will break next?',
    can: ['Branch and line health', 'Backup lines', 'Root cause', 'Changes and drift', 'Carriers', 'Firmware', 'Predictions and capacity'], feed: ['carriers', 'incidents', 'changes', 'predict', 'inventory', 'automation'],
    daily: [['Right now', 'Which stores are down or degraded right now?'], ['Failover', 'Which stores are running on backup ISP only?'], ['Root cause', 'Why was Store 214 slow this morning: network, ISP, or application?'], ['Changes', 'What changed in the last 24 hours'], ['Drift', 'Where is config drift?'], ['Predictions', 'What predictions are open?']],
    weekly: [['Last 7 days', "Summarize last week's incidents for my leadership report."], ['Self-healing', 'Which incidents were auto-remediated this week, and what was done?'], ['Repeat offenders', 'Which circuits are repeat offenders?'], ['Next 7 days', 'What changes are scheduled next week?'], ['Carrier cases', 'Which carrier cases are open?']],
    monthly: [['Carriers', 'Which ISP circuits are flapping or breaching SLA this month?'], ['Scorecard', 'What was network uptime and MTTR last month vs. target?'], ['Capacity', 'Which sites will hit bandwidth or Wi-Fi capacity limits in the next 90 days?'], ['Firmware', 'Firmware compliance by model'], ['Lifecycle', 'When do the 2530 switches reach end of support?'], ['Problems', 'What problem records are open?']],
  },
  {
    id: 'stores', user: 'head.stores', password: 'Dash@STR1', title: 'Head of Stores & Branches',
    focus: 'Can every branch trade today, and what will my branch managers feel?',
    can: ['Branch health', 'Opening readiness', 'Backup lines', 'Slow branches', 'Technician visits', 'Changes in trading hours', 'New branches'], feed: ['readiness', 'incidents', 'dispatch', 'carriers', 'biab'],
    daily: [['Opening', 'Which branches are not ready to open?'], ['Right now', 'Which stores are down or degraded right now?'], ['Backup lines', 'Which stores are running on backup ISP only?'], ['Slowness', 'where is it slow right now'], ['Visits', 'What work orders are open?'], ['Branch comms', 'What did we tell branches today?']],
    weekly: [['Last 7 days', "Summarize last week's incidents for my leadership report."], ['Self-healing', 'Which incidents were auto-remediated this week, and what was done?'], ['Next 7 days', 'What changes are scheduled next week?'], ['Freezes', 'Are there any freeze windows?'], ['New branches', "Status of this weekend's acquisition cutovers"]],
    monthly: [['Scorecard', 'What was network uptime and MTTR last month vs. target?'], ['Capacity', 'Which sites will hit bandwidth or Wi-Fi capacity limits in the next 90 days?'], ['Unreliable lines', 'Which circuits are repeat offenders?'], ['New branches', 'Which onboarding projects are red?']],
  },
  {
    id: 'itservice', user: 'head.itservice', password: 'Dash@ITS1', title: 'Head of IT Service & NOC',
    focus: 'Is the queue under control, are we inside SLA, and who is waiting on whom?',
    can: ['Incident queue', 'Deadlines (SLA)', 'Decisions waiting', 'Automation', 'Carrier repairs', 'Problems'], feed: ['incidents', 'automation', 'dispatch', 'carriers', 'knowledge'],
    daily: [['Overnight', 'What failed overnight?'], ['SLA risk', 'Which incidents are close to breaching SLA?'], ['Queue', 'How many incidents are open?'], ['Ownership', 'Which incidents are not acknowledged?'], ['Decisions', 'Which approvals are waiting on a human?'], ['Carrier cases', 'Which carrier cases are open?']],
    weekly: [['Last 7 days', "Summarize last week's incidents for my leadership report."], ['Self-healing', 'Which incidents were auto-remediated this week, and what was done?'], ['Problems', 'What problem records are open?'], ['Repeat offenders', 'Which circuits are repeat offenders?']],
    monthly: [['Service levels', 'Show all SLA metrics'], ['Scorecard', 'What was network uptime and MTTR last month vs. target?'], ['Carriers', 'Which ISP circuits are flapping or breaching SLA this month?'], ['Automation', 'Which runbooks do we have?']],
  },
  {
    id: 'security', user: 'head.security', password: 'Dash@SEC1', title: 'Head of Security',
    focus: 'Where are we exposed, what changed without a record, and who approved what?',
    can: ['Critical flaws', 'Firmware policy', 'Config drift', 'End of support', 'Change control', 'Config backups'], feed: ['vuln', 'changes', 'automation', 'inventory'],
    daily: [['Unrecorded change', 'What changed at Store 118 in the last 24 hours?'], ['Drift', 'High-severity config drift'], ['Audit', 'Who approved changes today?'], ['Backups', 'Which config backups failed?']],
    weekly: [['Firmware', 'Firmware compliance by model'], ['Next 7 days', 'What changes are scheduled next week?'], ['PCI', 'Is the PCI segment isolated at the cutover site?'], ['All drift', 'Where is config drift?']],
    monthly: [['Lifecycle', 'When do the 2530 switches reach end of support?'], ['Exposure', 'Which devices have a critical CVE?'], ['Service levels', 'Show all SLA metrics'], ['Problems', 'What problem records are open?']],
  },
  {
    id: 'regional', user: 'regional.se', password: 'Dash@REG1', title: 'Regional Manager, Southeast', region: 'Southeast',
    focus: 'Which of my branches need help today, and who is on the way?',
    can: ['Southeast branches only', 'Branch health', 'Opening readiness', 'Backup lines', 'Technician visits', 'Changes in the region'], feed: null,
    daily: [], weekly: [], monthly: [], // built for the region in compose.js
  },
];
export const personaById = id => PERSONAS.find(p => p.id === id);
