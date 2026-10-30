import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiFetch, clearAuth, setAuth } from '@/lib/api';
import { Card, Field, Page, TextInput, btnPrimary } from '@/components/common';
/**
 * Connexion / inscription au foyer.
 * Le jeton est conservé dans localStorage (mbf.auth) et utilisé par apiFetch.
 */
export default function Login() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [familyName, setFamilyName] = useState('');
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            const path = mode === 'login' ? '/api/v1/auth/login' : '/api/v1/auth/register';
            const body = mode === 'login'
                ? { email: email.trim(), password }
                : { email: email.trim(), password, name: name.trim(), familyName: familyName.trim() };
            const session = await apiFetch(path, { method: 'POST', body });
            setAuth(session);
            void navigate('/');
        }
        catch {
            setError(t('login.error'));
        }
        finally {
            setBusy(false);
        }
    };
    const logout = () => {
        clearAuth();
        setMode('login');
        setEmail('');
        setPassword('');
        void navigate('/');
    };
    return (_jsx(Page, { title: t('login.title'), children: _jsxs(Card, { className: "mx-auto max-w-md", children: [_jsx("div", { className: "mb-4 flex rounded-lg border border-forest-200 bg-white text-sm font-semibold", children: [['login', t('login.tabLogin')], ['register', t('login.tabRegister')]].map(([m, label]) => (_jsx("button", { type: "button", onClick: () => setMode(m), className: `flex-1 px-3 py-2 ${mode === m ? 'bg-forest-600 text-white' : 'text-forest-700 hover:bg-forest-50'}`, "aria-pressed": mode === m, children: label }, m))) }), _jsxs("form", { className: "flex flex-col gap-3", onSubmit: submit, children: [mode === 'register' && (_jsxs(_Fragment, { children: [_jsx(Field, { label: t('login.name'), children: _jsx(TextInput, { value: name, onChange: (e) => setName(e.target.value), required: true, minLength: 2 }) }), _jsx(Field, { label: t('login.familyName'), children: _jsx(TextInput, { value: familyName, onChange: (e) => setFamilyName(e.target.value), required: true, minLength: 2 }) })] })), _jsx(Field, { label: t('login.email'), children: _jsx(TextInput, { type: "email", value: email, onChange: (e) => setEmail(e.target.value), required: true }) }), _jsx(Field, { label: t('login.password'), children: _jsx(TextInput, { type: "password", value: password, onChange: (e) => setPassword(e.target.value), required: true, minLength: 8 }) }), error && _jsx("p", { className: "text-sm font-medium text-red-700", children: error }), _jsx("button", { type: "submit", className: btnPrimary, disabled: busy, children: busy ? '…' : mode === 'login' ? t('login.tabLogin') : t('login.tabRegister') }), _jsx("button", { type: "button", onClick: logout, className: "text-xs text-sage-600 underline hover:text-forest-800", children: t('login.logout') })] })] }) }));
}
