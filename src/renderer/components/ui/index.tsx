import { useId, type ComponentProps, type ReactNode } from 'react';
export function Spinner() {
  return <span className="ui-spinner" aria-hidden="true"/>;
}
export function Button({ variant = 'primary', className = '', type = 'button', children, ...props }: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'danger-button' }) {
  return <button {...props} type={type} className={`ui-button ${variant} ${className}`}>{children}{props['aria-busy'] === true || props['aria-busy'] === 'true' ? <Spinner/> : null}</button>;
}
export function TextField({ label, hint, error, id, className = '', ...props }: ComponentProps<'input'> & { label: string; hint?: string; error?: string }) {
  const generated = useId(); const inputId = id ?? generated; const messageId = `${inputId}-message`;
  return <div className={`ui-field ${className}`}><label htmlFor={inputId}>{label}</label>
    <input {...props} id={inputId} className="ui-field-control" aria-invalid={error ? true : undefined}
      aria-describedby={error || hint ? messageId : props['aria-describedby']}/>
    {(error || hint) && <p id={messageId} className={error ? 'field-error' : 'page-note'} role={error ? 'alert' : undefined}>{error || hint}</p>}
  </div>;
}
export function Card({ children, className = '', ...props }: ComponentProps<'section'> & { children: ReactNode }) {
  return <section {...props} className={`ui-card ${className}`}>{children}</section>;
}
