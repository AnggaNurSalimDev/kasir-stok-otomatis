import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SesiProvider } from './sesi/SesiContext.jsx';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SesiProvider>
        <App />
      </SesiProvider>
    </BrowserRouter>
  </StrictMode>,
);
