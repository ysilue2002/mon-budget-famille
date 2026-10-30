import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './i18n';
import './index.css';
import App from './App';
import { bootstrapApp } from './db/seed';
async function mount() {
    // Amorçage idempotent (foyer, catégories, compte espèces) avant le rendu.
    await bootstrapApp().catch((error) => {
        const err = error;
        console.error('bootstrap Application error', err.name, err.message, 'inner:', `${err.inner?.name}: ${err.inner?.message}`, err.inner?.stack);
    });
    const container = document.getElementById('root');
    if (!container)
        throw new Error('root introuvable');
    createRoot(container).render(_jsx(StrictMode, { children: _jsx(BrowserRouter, { children: _jsx(App, {}) }) }));
}
void mount();
