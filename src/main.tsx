import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './index.css';
import App from './App';
import { bootstrapApp } from './db/seed';
import { materializeDueRecurrences } from './core/recurring';

async function mount(): Promise<void> {
  // Amorçage idempotent (foyer, catégories, compte espèces) avant le rendu.
  await bootstrapApp().catch((error) => {
    const err = error as { name?: string; message?: string; inner?: { name?: string; message?: string; stack?: string } };
    console.error(
      'bootstrap Application error',
      err.name,
      err.message,
      'inner:',
      `${err.inner?.name}: ${err.inner?.message}`,
      err.inner?.stack,
    );
  });

  // Échéances récurrentes dues (idempotent : un identifiant déterministe par
  // échéance empêche tout doublon si la génération est rejouée).
  await materializeDueRecurrences().catch((error) => {
    console.error('recurring generation error', error);
  });

  const container = document.getElementById('root');
  if (!container) throw new Error('root introuvable');

  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void mount();
