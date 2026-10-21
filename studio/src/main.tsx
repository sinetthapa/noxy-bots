// Studio entry: self-hosted fonts, the DESIGN.md styles, then the app.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/nunito-sans';
import '@fontsource-variable/geist-mono';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
