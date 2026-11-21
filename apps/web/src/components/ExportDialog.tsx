import { useState } from "react";
import type { LibrarySnapshot } from "@nodoteca/core";
import { exportBookmarksHtml, exportJson } from "../lib/exporter.ts";
import { useI18n } from "../lib/i18n.tsx";
import { Dialog } from "./Dialog.tsx";

type State = { kind: "idle" } | { kind: "working" } | { kind: "done"; snapshot: LibrarySnapshot } | { kind: "failed" };

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [state, setState] = useState<State>({ kind: "idle" });

  function run(fn: () => Promise<LibrarySnapshot>) {
    setState({ kind: "working" });
    fn()
      .then((snapshot) => setState({ kind: "done", snapshot }))
      .catch((err: unknown) => {
        console.error("Export failed", err);
        setState({ kind: "failed" });
      });
  }

  const busy = state.kind === "working";

  return (
    <Dialog title={t("export.title")} onClose={onClose}>
      <div className="import">
        <p>{t("export.intro")}</p>

        <div className="export__options">
          <button type="button" className="export__option" disabled={busy} onClick={() => run(exportJson)}>
            <strong>{t("export.json")}</strong>
            <span className="muted small">{t("export.jsonHint")}</span>
          </button>
          <button type="button" className="export__option" disabled={busy} onClick={() => run(exportBookmarksHtml)}>
            <strong>{t("export.html")}</strong>
            <span className="muted small">{t("export.htmlHint")}</span>
          </button>
        </div>
        <p className="muted small">{t("export.filesNote")}</p>

        {busy && <p className="muted">{t("export.working")}</p>}
        {state.kind === "done" && (
          <p className="import__done">
            ✓ {t("export.done", { items: state.snapshot.items.length, collections: state.snapshot.collections.length })}
          </p>
        )}
        {state.kind === "failed" && <p className="error">{t("common.error")}</p>}
      </div>
    </Dialog>
  );
}
