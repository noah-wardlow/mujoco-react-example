import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { RuntimeDemo } from './RuntimeDemo';
import { EngineDemo } from './EngineDemo';
import { EngineFeatures } from './EngineFeatures';

const demo = new URLSearchParams(window.location.search).get('demo');
createRoot(document.getElementById('root')!).render(
  demo === 'runtime' ? <RuntimeDemo /> :
  demo === 'engine' ? <EngineDemo /> :
  demo === 'speculative' || demo === 'plastic' ? <EngineFeatures mode={demo} /> : <App />
);
