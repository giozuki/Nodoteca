import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildImportPlan,
  collectionKey,
  normalizeUrl,
  parseImportFileFull,
  sharedFolderNames,
  tagCounts,
  type ImportEntry,
} from "@nodoteca/core";
import { useCollections } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { fetchExistingUrls, runImport, type ImportResult } from "../lib/importer.ts";
import { Dialog } from "./Dialog.tsx";

type Step =
  | { kind: "pick"; error?: string }
  | { kind: "review"; entries: ImportEntry[]; edges: [string, string][]; existingUrls: Set<string>; fileName: string }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; result: ImportResult }
  | { kind: "failed" };

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>({ kind: "pick" });

  async function readFile(file: File) {
    try {
      const { entries, edges } = parseImportFileFull(await file.text());
      if (!entries.length && !edges.length) return setStep({ kind: "pick", error: t("import.badFile") });
      setStep({ kind: "review", entries, edges, existingUrls: await fetchExistingUrls(), fileName: file.name });
    } catch {
      setStep({ kind: "pick", error: t("import.badFile") });
    }
  }

  const busy = step.kind === "running";

  return (
    <Dialog title={t("import.title")} onClose={busy ? () => {} : onClose}>
      {step.kind === "pick" && (
        <div className="import">
          <p>{t("import.intro")}</p>
          <ul className="import__how muted small">
            <li>{t("import.howRaindrop")}</li>
            <li>{t("import.howBrowser")}</li>
            <li>{t("import.howBackup")}</li>
          </ul>
          <label className="btn btn--primary import__file">
            {t("import.choose")}
            <input
              type="file"
              accept=".csv,.html,.htm,.json,text/csv,text/html,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
          </label>
          {step.error && <p className="error">{step.error}</p>}
        </div>
      )}

      {step.kind === "review" && (
        <Review
          entries={step.entries}
          edges={step.edges}
          existingUrls={step.existingUrls}
          fileName={step.fileName}
          onCancel={onClose}
          onStart={(run) => {
            setStep({ kind: "running", done: 0, total: 0 });
            run((done, total) => setStep({ kind: "running", done, total }))
              .then((result) => setStep({ kind: "done", result }))
              .catch((err: unknown) => {
                console.error("Import failed", err);
                setStep({ kind: "failed" });
              });
          }}
        />
      )}

      {step.kind === "running" && (
        <div className="import">
          <p>{t("import.running", { done: step.done, total: step.total })}</p>
          <progress className="import__progress" max={step.total || 1} value={step.done} />
        </div>
      )}

      {step.kind === "done" && (
        <div className="import">
          <p className="import__done">✓ {t("import.done", { count: step.result.items })}</p>
          <button className="btn btn--primary" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      )}

      {step.kind === "failed" && (
        <div className="import">
          <p className="error">{t("import.failed")}</p>
          <button className="btn btn--ghost" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      )}
    </Dialog>
  );
}

interface ReviewProps {
  entries: ImportEntry[];
  edges: [string, string][];
  existingUrls: Set<string>;
  fileName: string;
  onCancel: () => void;
  onStart: (run: (progress: (done: number, total: number) => void) => Promise<ImportResult>) => void;
}

function Review({ entries, edges, existingUrls, fileName, onCancel, onStart }: ReviewProps) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const existingCollections = useCollections().data ?? [];
  const tags = useMemo(() => tagCounts(entries), [entries]);
  const shared = useMemo(() => sharedFolderNames(entries), [entries]);
  const [skipExisting, setSkipExisting] = useState(true);
  const [merge, setMerge] = useState(true);
  const [chosenTags, setChosenTags] = useState<Set<string>>(new Set());

  const plan = useMemo(
    () => buildImportPlan(entries, { tagsAsCollections: chosenTags, existingUrls, skipExisting, mergeSameNames: merge, edges }),
    [entries, edges, chosenTags, existingUrls, skipExisting, merge],
  );
  const existingKeys = new Set(existingCollections.map((c) => collectionKey(c.name)));
  const newCollections = [...plan.collections.keys()].filter((k) => !existingKeys.has(k)).length;
  const alreadyHave = useMemo(
    () => new Set(entries.map((e) => normalizeUrl(e.url)).filter((u) => existingUrls.has(u))).size,
    [entries, existingUrls],
  );

  function toggleTag(key: string) {
    setChosenTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const place = (p: string) => (p === "" ? t("import.topLevel") : p);

  function start() {
    onStart(async (progress) => {
      try {
        return await runImport(plan, progress);
      } finally {
        await qc.invalidateQueries();
      }
    });
  }

  return (
    <div className="import">
      <p className="import__file-name muted small">{fileName}</p>
      <ul className="import__stats">
        <li>
          <strong>{t("import.found", { count: entries.length })}</strong>
        </li>
        {plan.skippedDuplicatesInFile > 0 && <li className="muted">{t("import.dupInFile", { count: plan.skippedDuplicatesInFile })}</li>}
        <li>{t("import.collections", { count: plan.collections.size, new: newCollections })}</li>
      </ul>

      {alreadyHave > 0 && (
        <label className="toggle">
          <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
          {t("import.skipExisting", { count: alreadyHave })}
        </label>
      )}

      {shared.length > 0 && (
        <fieldset className="import__group">
          <legend>{t("import.shared")}</legend>
          <ul className="import__shared small">
            {shared.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong> <span className="muted">· {s.places.map(place).join(" · ")}</span>
              </li>
            ))}
          </ul>
          <label className="toggle">
            <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
            {t("import.merge")}
          </label>
          {!merge && shared[0] && (
            <small className="muted">
              {t("import.mergeHint", { example: `${shared[0].name} (${shared[0].places.find((p) => p)?.split(" / ").pop() ?? ""})` })}
            </small>
          )}
        </fieldset>
      )}

      {tags.length > 0 && (
        <fieldset className="import__group">
          <legend>
            {t("import.tags")}
            <span className="import__bulk">
              <button type="button" className="link-btn" onClick={() => setChosenTags(new Set(tags.map(([n]) => collectionKey(n))))}>
                {t("import.all")}
              </button>
              <button type="button" className="link-btn" onClick={() => setChosenTags(new Set())}>
                {t("import.none")}
              </button>
            </span>
          </legend>
          <small className="muted">{t("import.tagsHint")}</small>
          <div className="import__tags">
            {tags.map(([name, count]) => {
              const key = collectionKey(name);
              return (
                <label key={key} className={`tag-choice ${chosenTags.has(key) ? "is-on" : ""}`}>
                  <input type="checkbox" checked={chosenTags.has(key)} onChange={() => toggleTag(key)} />
                  {name} <span className="muted">{count}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="import__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className="btn btn--primary" disabled={plan.items.length === 0} onClick={start}>
          {plan.items.length ? t("import.start", { count: plan.items.length }) : t("import.nothing")}
        </button>
      </div>
    </div>
  );
}
