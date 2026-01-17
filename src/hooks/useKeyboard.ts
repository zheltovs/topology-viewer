import { useEffect, useRef } from 'react';

export const useKeyboardShortcuts = (handlers: {
  onUndo?: () => void;
  onRedo?: () => void;
  onEscape?: () => void;
  onChainMode?: () => void;
  onContourMode?: () => void;
}) => {
  // Use refs to always have access to latest handlers without causing effect re-runs
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const h = handlersRef.current;

      // Ctrl+Z - Undo (use code instead of key for layout independence)
      if (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey && h.onUndo) {
        e.preventDefault();
        h.onUndo();
      }

      // Ctrl+Y or Ctrl+Shift+Z - Redo
      if ((e.ctrlKey && e.code === 'KeyY') || (e.ctrlKey && e.shiftKey && e.code === 'KeyZ')) {
        if (h.onRedo) {
          e.preventDefault();
          h.onRedo();
        }
      }

      // Escape - Cancel current action
      if (e.key === 'Escape' && h.onEscape) {
        e.preventDefault();
        h.onEscape();
      }

      // Ctrl+1 - Chain mode
      if (e.ctrlKey && e.code === 'Digit1' && h.onChainMode) {
        e.preventDefault();
        h.onChainMode();
      }

      // Ctrl+2 - Contour mode
      if (e.ctrlKey && e.code === 'Digit2' && h.onContourMode) {
        e.preventDefault();
        h.onContourMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps - handlers accessed via ref
};