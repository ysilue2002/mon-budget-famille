import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
import i18n from '@/i18n';
/** Capture les erreurs de rendu pour éviter un écran blanc. */
export class ErrorBoundary extends Component {
    constructor() {
        super(...arguments);
        Object.defineProperty(this, "state", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { error: null }
        });
    }
    static getDerivedStateFromError(error) {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }
    componentDidCatch(error) {
        // Message Dexie interne inclus le cas échéant (champ `inner`).
        const err = error;
        console.error('[error-boundary]', err?.name, err instanceof Error ? err.message : err, err?.inner);
    }
    render() {
        if (this.state.error) {
            return (_jsxs("div", { className: "flex min-h-screen flex-col items-center justify-center gap-4 bg-forest-50 p-6 text-center", children: [_jsx("span", { "aria-hidden": true, className: "text-4xl", children: "\uD83C\uDF31" }), _jsx("h1", { className: "text-xl font-bold text-forest-900", children: i18n.t('errorBoundary.title') }), _jsx("p", { className: "max-w-md text-sm text-sage-700", children: i18n.t('errorBoundary.message') }), _jsxs("details", { className: "max-w-md text-left text-xs text-sage-600", children: [_jsx("summary", { className: "cursor-pointer font-semibold", children: i18n.t('errorBoundary.details') }), _jsx("pre", { className: "mt-2 overflow-x-auto whitespace-pre-wrap", children: this.state.error.message })] }), _jsx("button", { type: "button", onClick: () => window.location.reload(), className: "rounded-lg bg-forest-600 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700", children: i18n.t('errorBoundary.reload') })] }));
        }
        return this.props.children;
    }
}
