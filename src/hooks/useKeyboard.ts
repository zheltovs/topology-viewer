import { useEffect } from 'react';

export const useKeyboardShortcuts = (handlers: {
  onUndo?: () => void;
  onRedo?: () => void;
  onEscape?: () => void;
  onChainMode?: () => void;
  onContourMode?: () => void;
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z - Undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey && handlers.onUndo) {
        e.preventDefault();
        handlers.onUndo();
      }

      // Ctrl+Y or Ctrl+Shift+Z - Redo
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        if (handlers.onRedo) {
          e.preventDefault();
          handlers.onRedo();
        }
      }

      // Escape - Cancel current action
      if (e.key === 'Escape' && handlers.onEscape) {
        e.preventDefault();
        handlers.onEscape();
      }

      // Ctrl+1 - Chain mode
      if (e.ctrlKey && e.key === '1' && handlers.onChainMode) {
        e.preventDefault();
        handlers.onChainMode();
      }

      // Ctrl+2 - Contour mode
      if (e.ctrlKey && e.key === '2' && handlers.onContourMode) {
        e.preventDefault();
        handlers.onContourMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers.onUndo, handlers.onRedo, handlers.onEscape, handlers.onChainMode, handlers.onContourMode]);
};


