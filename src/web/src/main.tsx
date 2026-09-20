import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/global.css';
import './styles/layout.css';
import './styles/sidebar.css';
import './styles/form.css';
import './styles/password.css';
import './styles/overlay.css';
import './styles/filter.css';
import './styles/markdown.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

createRoot(root).render(<App />);