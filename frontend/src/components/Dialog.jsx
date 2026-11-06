import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

// In-app replacements for the browser's confirm() / prompt() / alert():
//   const { confirm, prompt, toast } = useDialog();
//   if (await confirm({ title: 'Delete Asad?', message: '...', danger: true })) ...
//   const name = await prompt({ title: 'Change name', value: 'Asad' });   // null = cancelled
//   toast('Saved', 'success')
// They look like the rest of the site (bottom sheet on phones) instead of a grey OS box.
const DialogContext = createContext(null);

export function useDialog() {
  return useContext(DialogContext);
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { kind, title, message, ..., resolve }
  const [toasts, setToasts] = useState([]);
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  const open = useCallback((opts) => new Promise((resolve) => {
    setText(opts.value || '');
    setDialog({ ...opts, resolve });
  }), []);
  const confirm = useCallback((opts) => open({ kind: 'confirm', ...(typeof opts === 'string' ? { message: opts } : opts) }), [open]);
  const prompt = useCallback((opts) => open({ kind: 'prompt', ...opts }), [open]);
  const toast = useCallback((message, type = 'info', ms = 3200) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const close = (result) => {
    dialog?.resolve(result);
    setDialog(null);
  };

  useEffect(() => {
    if (!dialog) return undefined;
    if (dialog.kind === 'prompt') setTimeout(() => inputRef.current?.select(), 50);
    const onKey = (e) => { if (e.key === 'Escape') close(dialog.kind === 'prompt' ? null : false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  const icons = { success: CheckCircle2, error: XCircle, info: Info };

  return (
    <DialogContext.Provider value={{ confirm, prompt, toast }}>
      {children}
      {dialog && (
        <div className="modal-backdrop dlg-backdrop" onClick={() => close(dialog.kind === 'prompt' ? null : false)}>
          <div className="modal-card dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-top">
              {dialog.danger ? <span className="dlg-icon danger"><AlertTriangle size={22} aria-hidden="true" /></span> : <span className="dlg-icon"><Info size={22} aria-hidden="true" /></span>}
              <h3 id="dlg-title">{dialog.title || (dialog.kind === 'prompt' ? 'Enter a value' : 'Are you sure?')}</h3>
              <button type="button" className="dlg-x" aria-label="Close" onClick={() => close(dialog.kind === 'prompt' ? null : false)}><X size={18} /></button>
            </div>
            {dialog.message && <p className="dlg-msg">{dialog.message}</p>}
            {dialog.kind === 'prompt' && (
              <form onSubmit={(e) => { e.preventDefault(); close(text.trim()); }}>
                <div className="form-group">
                  {dialog.label && <label>{dialog.label}</label>}
                  <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={dialog.placeholder || ''} />
                </div>
                <div className="dlg-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => close(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={!text.trim()}>{dialog.confirmLabel || 'Save'}</button>
                </div>
              </form>
            )}
            {dialog.kind === 'confirm' && (
              <div className="dlg-actions">
                <button type="button" className="btn btn-secondary" onClick={() => close(false)}>{dialog.cancelLabel || 'Cancel'}</button>
                <button type="button" className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} autoFocus onClick={() => close(true)}>{dialog.confirmLabel || 'Yes'}</button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.type] || Info;
          return <div key={t.id} className={`toast ${t.type}`}><Icon size={18} aria-hidden="true" /><span>{t.message}</span></div>;
        })}
      </div>
    </DialogContext.Provider>
  );
}
