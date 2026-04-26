import React from 'react';
import { createRoot } from 'react-dom/client';

import { Panel } from './panel';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root container');
}

const root = createRoot(rootEl);
root.render(<Panel />);
