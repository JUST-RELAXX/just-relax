import React from 'react';
import { createRoot } from 'react-dom/client';
import { APP_NAME } from '../../shared/app-config';
import { App } from './App';
import './styles.css';

document.title = APP_NAME;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
