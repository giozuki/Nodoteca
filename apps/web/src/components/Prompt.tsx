import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../lib/i18n.tsx";
import { Dialog } from "./Dialog.tsx";

/**
 * The app's own replacements for window.confirm() and window.alert():
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete?", message: "…", confirmLabel: "Delete", danger: true })) …
 *
 *   const notice = useNotice();
 *   await notice({ title: "You're offline", message: "…" });
 *
 * Requests queue up, so two at once are shown one after the other.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** A destructive action: the confirm button is red. */
  danger?: boolean;
}

export interface NoticeOptions {
  title: string;
  message?: string;
}

type Request =
  | { id: number; kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { id: number; kind: "notice"; opts: NoticeOptions; resolve: (ok: boolean) => void };

interface Api {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  notice: (opts: NoticeOptions) => Promise<void>;
}

const PromptContext = createContext<Api | null>(null);

export function PromptProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setQueue((q) => [...q, { id: nextId.current++, kind: "confirm", opts, resolve }])),
    [],
  );
  const notice = useCallback(
    (opts: NoticeOptions) =>
      new Promise<void>((resolve) => setQueue((q) => [...q, { id: nextId.current++, kind: "notice", opts, resolve: () => resolve() }])),
    [],
  );
  const api = useMemo(() => ({ confirm, notice }), [confirm, notice]);

  const current = queue[0];
  const finish = (ok: boolean) => {
    current?.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  return (
    <PromptContext.Provider value={api}>
      {children}
      {current && <PromptDialog key={current.id} request={current} onDone={finish} />}
    </PromptContext.Provider>
  );
}

function PromptDialog({ request, onDone }: { request: Request; onDone: (ok: boolean) => void }) {
  const { t } = useI18n();
  const { opts } = request;
  const danger = request.kind === "confirm" && request.opts.danger;
  return (
    <Dialog
      size="sm"
      title={opts.title}
      onClose={() => onDone(false)}
      onSubmit={() => onDone(true)}
      footer={
        <>
          {request.kind === "confirm" && (
            <button type="button" className="btn btn--ghost" onClick={() => onDone(false)}>
              {t("common.cancel")}
            </button>
          )}
          <button className={`btn ${danger ? "btn--danger-fill" : "btn--primary"}`} data-autofocus>
            {request.kind === "confirm" ? (request.opts.confirmLabel ?? t("common.ok")) : t("common.ok")}
          </button>
        </>
      }
    >
      {opts.message && <p className="prompt__message">{opts.message}</p>}
    </Dialog>
  );
}

function useApi(): Api {
  const api = useContext(PromptContext);
  if (!api) throw new Error("PromptProvider is missing");
  return api;
}

export const useConfirm = () => useApi().confirm;
export const useNotice = () => useApi().notice;
