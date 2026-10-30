import { Component, type ReactNode } from 'react';
import i18n from '@/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Capture les erreurs de rendu pour éviter un écran blanc. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown): void {
    // Message Dexie interne inclus le cas échéant (champ `inner`).
    const err = error as { name?: string; inner?: { name?: string; message?: string } } | undefined;
    console.error('[error-boundary]', err?.name, err instanceof Error ? err.message : err, err?.inner);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-forest-50 p-6 text-center">
          <span aria-hidden className="text-4xl">🌱</span>
          <h1 className="text-xl font-bold text-forest-900">{i18n.t('errorBoundary.title')}</h1>
          <p className="max-w-md text-sm text-sage-700">{i18n.t('errorBoundary.message')}</p>
          <details className="max-w-md text-left text-xs text-sage-600">
            <summary className="cursor-pointer font-semibold">{i18n.t('errorBoundary.details')}</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{this.state.error.message}</pre>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700"
          >
            {i18n.t('errorBoundary.reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
