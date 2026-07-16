import { useEffect, useRef } from 'react';

/**
 * True when the key event originates from a text-editing control, where app
 * shortcuts must not fire (Ctrl+Z should undo the text, Delete edits text, …).
 */
function isTextEditingTarget(e: KeyboardEvent): boolean {
  const target = e.target;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) {
    // Checkboxes / radios / buttons don't consume typing shortcuts
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(target.type);
  }
  return false;
}

export const useKeyboardShortcuts = (handlers: {
  onUndo?: () => void;
  onRedo?: () => void;
  onEscape?: () => void;
  onChainMode?: () => void;
  onContourMode?: () => void;
  onToggleStats?: () => void;
  onFitView?: () => void;
  onDeleteSelected?: () => void;
}) => {
  // Use a ref to always have access to latest handlers without causing effect re-runs
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const h = handlersRef.current;

      // Let text fields keep their native editing shortcuts
      if (isTextEditingTarget(e)) return;

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

      // Ctrl+I - Toggle stats display
      if (e.ctrlKey && e.code === 'KeyI' && !e.shiftKey && h.onToggleStats) {
        e.preventDefault();
        h.onToggleStats();
      }

      // Home - Fit view to shapes
      if (e.code === 'Home' && !e.ctrlKey && !e.altKey && !e.shiftKey && h.onFitView) {
        e.preventDefault();
        h.onFitView();
      }

      // Delete - Remove selected shapes
      if (e.code === 'Delete' && !e.ctrlKey && !e.altKey && !e.shiftKey && h.onDeleteSelected) {
        e.preventDefault();
        h.onDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps - handlers accessed via ref
};
