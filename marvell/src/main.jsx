import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, NowProvider } from './store.jsx';
import App from './shell.jsx';
import { LiveProvider } from './live.jsx';
import './index.css';
createRoot(document.getElementById('root')).render(<AppProvider><NowProvider><LiveProvider><App /></LiveProvider></NowProvider></AppProvider>);
