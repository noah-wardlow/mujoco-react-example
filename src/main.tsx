import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { EngineDemo } from './EngineDemo';

createRoot(document.getElementById('root')!).render(new URLSearchParams(window.location.search).get('demo') === 'engine' ? <EngineDemo /> : <App />);
