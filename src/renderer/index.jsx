import { createRoot } from 'react-dom/client';
import { Terminal } from './components/Terminal';
import '@xterm/xterm/css/xterm.css';

function App() {
  return <Terminal />;
}

createRoot(document.getElementById('root')).render(<App />);
