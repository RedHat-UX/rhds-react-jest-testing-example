// RHDS design tokens. Load the base scales first, then the default light/dark
// theme mappings, then the application stylesheet that consumes them.
import '@rhds/tokens/css/global.css';
import '@rhds/tokens/css/default-theme.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DeploymentManager } from './DeploymentManager';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <DeploymentManager />
  </StrictMode>,
);
