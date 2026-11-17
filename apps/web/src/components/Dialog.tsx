import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useI18n } from "../lib/i18n.tsx";
import { IconClose } from "./Icons.tsx";

interface Props {
  title: string;
  onClose: () => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Native <dialog> as a modal: focus trap, Esc to close and backdrop come for free.
 * The panel is a <form> only when onSubmit is given: content with its own form
 * must not end up nested inside another one (invalid HTML, and the outer form
 * can submit natively and reload the page).
 */
export function Dialog({ title, onClose, onSubmit, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) {
      el.showModal();
      // showModal focuses the first control (the close button): start on the first field instead.
      el.querySelector<HTMLElement>("input:not([readonly]):not([type=file]):not([type=hidden]), textarea")?.focus();
    }
    return () => el?.close();
  }, []);

  const panel = (
    <>
      <header className="dialog__header">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("common.close")}>
          <IconClose s={18} />
        </button>
      </header>
      <div className="dialog__body">{children}</div>
      {footer && <footer className="dialog__footer">{footer}</footer>}
    </>
  );

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      {onSubmit ? (
        <form
          className="dialog__panel"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e);
          }}
        >
          {panel}
        </form>
      ) : (
        <div className="dialog__panel">{panel}</div>
      )}
    </dialog>
  );
}
