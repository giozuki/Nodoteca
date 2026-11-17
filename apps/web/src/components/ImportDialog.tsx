import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  buildImportPlan,
  collectionKey,
  ImportFormatError,
  normalizeUrl,
  parseImportFileFull,
  sharedFolderNames,
  tagCounts,
  type CollectionDetails,
  type MessageKey,
  type ImportEntry,
  type ImportWarning,
} from "@nodoteca/core";
import { useCollections } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.tsx";
import { fetchExistingUrls, runImport, type ImportResult } from "../lib/importer.ts";
import { Dialog } from "./Dialog.tsx";

type Step =
  | { kind: "pick"; error?: string }
  | {
      kind: "review";
      entries: ImportEntry[];
      edges: [string, string][];
      details: Map<string, CollectionDetails>;
      warnings: ImportWarning[];
      existingUrls: Set<string>;
      fileName: string;
    }
  | { kind: "running"; done: number; total: number }
  | { kind: "done"; result: ImportResult }
  | { kind: "failed" };

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>({ kind: "pick" });

  async function readFile(file: File) {
    try {
      const { entries, edges, details, warnings } = parseImportFileFull(await file.text());
      if (!entries.length && !edges.length) return setStep({ kind: "pick", error: t("import.badFile") });
      setStep({ kind: "review", entries, edges, details, warnings, existingUrls: await fetchExistingUrls(), fileName: file.name });
    } catch (err) {
      if (err instanceof ImportFormatError) {
        return setStep({ kind: "pick", error: t(`import.error.${err.code}`, { detail: err.detail ?? "" }) });
      }
      setStep({ kind: "pick", error: t("import.badFile") });
    }
  }

  const busy = step.kind === "running";

  return (
    <Dialog title={t("import.title")} onClose={busy ? () => {} : onClose}>
      {step.kind === "pick" && <SourcePicker error={step.error} onFile={(file) => void readFile(file)} />}

      {step.kind === "review" && (
        <Review
          entries={step.entries}
          edges={step.edges}
          details={step.details}
          warnings={step.warnings}
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

/* --- Step 1: pick a source, then follow its instructions ---------------------- */

type SourceId = "raindrop" | "browser" | "backup" | "native";

const SOURCES: { id: SourceId; icon: string; accept: string; types: string; ordered: boolean; steps: number }[] = [
  { id: "raindrop", icon: "💧", accept: ".csv,text/csv", types: ".csv", ordered: true, steps: 3 },
  { id: "browser", icon: "🔖", accept: ".html,.htm,text/html", types: ".html", ordered: false, steps: 3 },
  { id: "backup", icon: "🗄️", accept: ".json,application/json", types: ".json", ordered: true, steps: 2 },
  { id: "native", icon: "🧩", accept: ".json,application/json", types: ".json", ordered: true, steps: 3 },
];
const ANY_FILE = ".csv,.html,.htm,.json,text/csv,text/html,application/json";
const GUIDE_URL = "https://github.com/giozuki/Nodoteca/blob/main/docs/import-format.md";

function SourcePicker({ error, onFile }: { error?: string; onFile: (file: File) => void }) {
  const { t } = useI18n();
  const [sourceId, setSourceId] = useState<SourceId | null>(null);
  const source = SOURCES.find((s) => s.id === sourceId);

  if (!source) {
    return (
      <div className="import">
        <div>
          <p className="import__lead">{t("import.pickTitle")}</p>
          <p className="muted small">{t("import.pickHint")}</p>
        </div>
        <div className="sources">
          {SOURCES.map((s) => (
            <button key={s.id} type="button" className="source" onClick={() => setSourceId(s.id)}>
              <span className="source__icon" aria-hidden="true">
                {s.icon}
              </span>
              <span className="source__text">
                <span className="source__name">
                  {t(`import.src.${s.id}.name`)}
                </span>
                <span className="source__desc">{t(`import.src.${s.id}.desc`)}</span>
              </span>
              <span className="source__chevron" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
        <DropZone accept={ANY_FILE} onFile={onFile} compact />
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  // Message keys are checked at compile time, so build them with a cast: not every source has three steps.
  const steps = Array.from({ length: source.steps }, (_, i) => t(`import.src.${source.id}.s${i + 1}` as MessageKey));
  const note = t(`import.src.${source.id}.note`);
  const List = source.ordered ? "ol" : "ul";

  return (
    <div className="import">
      <button type="button" className="link-btn import__back" onClick={() => setSourceId(null)}>
        ‹ {t("import.back")}
      </button>
      <p className="import__lead">
        <span aria-hidden="true">{source.icon}</span> {t(`import.src.${source.id}.name`)}
      </p>
      <List className={`import__steps ${source.ordered ? "" : "import__steps--plain"}`}>
        {steps.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </List>
      {note && <p className="muted small">{note}</p>}
      {source.id === "native" && (
        <a className="import__guide" href={GUIDE_URL} target="_blank" rel="noreferrer">
          {t("import.guide")}
        </a>
      )}
      <DropZone accept={source.accept} types={source.types} onFile={onFile} />
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** A drop target with a "Choose a file" button inside. The file type is detected from its content. */
function DropZone({ accept, types, compact, onFile }: { accept: string; types?: string; compact?: boolean; onFile: (file: File) => void }) {
  const { t } = useI18n();
  const [over, setOver] = useState(false);

  const picker = (
    <label className={`btn ${compact ? "btn--ghost" : "btn--primary"} import__file`}>
      {t("import.choose")}
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow picking the same file again after an error
          if (file) onFile(file);
        }}
      />
    </label>
  );

  return (
    <div
      className={`dropzone ${compact ? "dropzone--compact" : ""} ${over ? "is-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      {compact ? (
        <>
          <span className="muted small">{t("import.dropShort")}</span>
          {picker}
        </>
      ) : (
        <>
          <span className="dropzone__icon" aria-hidden="true">
            ⇪
          </span>
          <strong>{t("import.drop")}</strong>
          {types && <span className="muted small">{t("import.accepts", { types })}</span>}
          <span className="muted small">{t("import.or")}</span>
          {picker}
        </>
      )}
    </div>
  );
}

/* --- Step 2: review ------------------------------------------------------------ */

interface ReviewProps {
  entries: ImportEntry[];
  edges: [string, string][];
  details: Map<string, CollectionDetails>;
  warnings: ImportWarning[];
  existingUrls: Set<string>;
  fileName: string;
  onCancel: () => void;
  onStart: (run: (progress: (done: number, total: number) => void) => Promise<ImportResult>) => void;
}

function Review({ entries, edges, details, warnings, existingUrls, fileName, onCancel, onStart }: ReviewProps) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const existingCollections = useCollections().data ?? [];
  const tags = useMemo(() => tagCounts(entries), [entries]);
  const shared = useMemo(() => sharedFolderNames(entries), [entries]);
  const [skipExisting, setSkipExisting] = useState(true);
  const [merge, setMerge] = useState(true);
  const [chosenTags, setChosenTags] = useState<Set<string>>(new Set());

  const plan = useMemo(
    () => buildImportPlan(entries, { tagsAsCollections: chosenTags, existingUrls, skipExisting, mergeSameNames: merge, edges, details }),
    [entries, edges, details, chosenTags, existingUrls, skipExisting, merge],
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

      {warnings.length > 0 && <Warnings warnings={warnings} />}

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

const SHOWN_WARNINGS = 8;

/** Problems found in the file that didn't stop the import. */
function Warnings({ warnings }: { warnings: ImportWarning[] }) {
  const { t } = useI18n();
  const text = (w: ImportWarning): string => {
    switch (w.code) {
      case "link-skipped":
        return t(`import.warn.link-skipped.${w.reason}`, { n: w.index + 1 });
      case "bad-date":
        return t("import.warn.bad-date", { n: w.index + 1, value: w.value });
      case "undeclared-collection":
        return t("import.warn.undeclared-collection", { name: w.name });
      case "cycle-removed":
        return t("import.warn.cycle-removed", { parent: w.parent, child: w.child });
      case "self-parent":
        return t("import.warn.self-parent", { name: w.name });
      case "bad-color":
        return t("import.warn.bad-color", { name: w.name, value: w.value });
      case "bad-icon":
        return t("import.warn.bad-icon", { name: w.name, value: w.value });
      case "duplicate-collection":
        return t("import.warn.duplicate-collection", { name: w.name });
    }
  };
  return (
    <fieldset className="import__group import__warnings">
      <legend>⚠ {t("import.warnings", { count: warnings.length })}</legend>
      <ul className="small">
        {warnings.slice(0, SHOWN_WARNINGS).map((w, i) => (
          <li key={i}>{text(w)}</li>
        ))}
      </ul>
      {warnings.length > SHOWN_WARNINGS && (
        <small className="muted">{t("import.moreWarnings", { count: warnings.length - SHOWN_WARNINGS })}</small>
      )}
    </fieldset>
  );
}
