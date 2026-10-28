import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, NowProvider } from '../store.jsx';
import { LiveProvider } from '../live.jsx';
import DashboardsApp from './Dashboard.jsx';
import '../index.css';
createRoot(document.getElementById('root')).render(<AppProvider><NowProvider><LiveProvider><DashboardsApp /></LiveProvider></NowProvider></AppProvider>);
