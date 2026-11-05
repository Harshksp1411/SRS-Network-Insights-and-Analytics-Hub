import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, NowProvider } from '../store.jsx';
import { LiveProvider } from '../live.jsx';
import OpsApp from './app.jsx';
import '../index.css';
createRoot(document.getElementById('root')).render(<AppProvider><NowProvider><LiveProvider><OpsApp /></LiveProvider></NowProvider></AppProvider>);
