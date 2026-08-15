import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles/global.css';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('El elemento #root no existe en index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
