import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, NowProvider } from '../store.jsx';
import { LiveProvider } from '../live.jsx';
import BriefsApp from './App.jsx';
import '../index.css';
createRoot(document.getElementById('root')).render(<AppProvider><NowProvider><LiveProvider><BriefsApp /></LiveProvider></NowProvider></AppProvider>);
