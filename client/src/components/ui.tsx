import { ReactNode, useState } from 'react';
import type { PublicUser } from '../types';

export function Avatar({ user, size = 40 }: { user: Pick<PublicUser, 'username' | 'avatarUrl'>; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 };
  return user.avatarUrl ? (
    <img className="avatar" style={style} src={user.avatarUrl} alt={`Avatar de ${user.username}`} />
  ) : (
    <span className="avatar avatar-ph" style={style} aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
  );
}

export function PasswordInput({
  value, onChange, id = 'password', label = 'Contraseña', autoComplete = 'current-password',
}: { value: string; onChange: (v: string) => void; id?: string; label?: string; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="pw">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button type="button" className="pw-toggle" onClick={() => setVisible(!visible)} aria-pressed={visible}>
          {visible ? 'Ocultar' : 'Ver'}
        </button>
      </span>
    </label>
  );
}

export function Field({
  label, value, onChange, type = 'text', id, autoComplete, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; id: string; autoComplete?: string; placeholder?: string }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} required />
    </label>
  );
}

export const Spinner = ({ text = 'Cargando…' }: { text?: string }) => <p className="muted center">{text}</p>;

export const ErrorBox = ({ children }: { children: ReactNode }) => <p className="error-box" role="alert">{children}</p>;

export function Icon({ name }: { name: 'heart' | 'later' | 'menu' | 'close' | 'rollback' | 'check' | 'link' | 'home' | 'gear' }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (name) {
    case 'heart':
      return <svg {...common}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>;
    case 'later': // flecha con giro ↪
      return <svg {...common}><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5V20" /></svg>;
    case 'menu':
      return <svg {...common}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
    case 'close':
      return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case 'rollback':
      return <svg {...common} width={16} height={16}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5V20" /></svg>;
    case 'home':
      return <svg {...common} width={18} height={18}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>;
    case 'gear':
      return <svg {...common} width={18} height={18}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
    case 'link':
      return <svg {...common} width={14} height={14}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>;
    case 'check':
      return <svg {...common} width={16} height={16}><path d="M5 12l5 5 9-10" /></svg>;
  }
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const formatDay = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
