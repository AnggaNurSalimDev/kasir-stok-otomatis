import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/space-grotesk';
import { PenyediaProfil, profilAwal, terapkanProfil } from './merek/ProfilContext.jsx';
import { SesiProvider } from './sesi/SesiContext.jsx';
import App from './App.jsx';
import './styles.css';

// Profil diterapkan sebelum render pertama, supaya tidak ada kedipan warna bawaan.
const profil = profilAwal();
terapkanProfil(profil);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PenyediaProfil profil={profil}>
      <BrowserRouter>
        <SesiProvider profil={profil}>
          <App />
        </SesiProvider>
      </BrowserRouter>
    </PenyediaProfil>
  </StrictMode>,
);
