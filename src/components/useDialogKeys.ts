import { useEffect, useRef } from 'react';

/**
 * Standard modal keyboard behavior: Escape cancels, Enter confirms.
 * Enter is ignored while a button has focus (its own click wins) and when no
 * confirm action is provided (e.g. nothing selected yet).
 */
export function useDialogKeys(onCancel: () => void, onConfirm?: () => void) {
  const handlersRef = useRef({ onCancel, onConfirm });
  useEffect(() => {
    handlersRef.current = { onCancel, onConfirm };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handlersRef.current.onCancel();
      } else if (e.key === 'Enter') {
        if (e.target instanceof HTMLButtonElement) return;
        const confirm = handlersRef.current.onConfirm;
        if (confirm) {
          e.preventDefault();
          e.stopPropagation();
          confirm();
        }
      }
    };

    // Capture phase so the dialog wins over app-level shortcuts (e.g. Esc
    // finishing a drawing) while it is open
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
