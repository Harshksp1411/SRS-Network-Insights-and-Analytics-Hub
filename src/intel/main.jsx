import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, NowProvider } from '../store.jsx';
import { LiveProvider } from '../live.jsx';
import IntelApp from './app.jsx';
import '../index.css';
createRoot(document.getElementById('root')).render(<AppProvider><NowProvider><LiveProvider><IntelApp /></LiveProvider></NowProvider></AppProvider>);
