import { useMemo, useState } from "react";
import { parentCandidates, type Collection, type Uuid } from "@nodoteca/core";
import { useCreateCollection, useDeleteCollection, useGraph, useUpdateCollection } from "../lib/api.ts";
import { COLLECTION_COLORS, colorFor } from "../lib/colors.ts";
import { useI18n } from "../lib/i18n.tsx";
import { errorCode } from "../lib/supabase.ts";
import { CollectionPicker } from "./CollectionPicker.tsx";
import { Dialog } from "./Dialog.tsx";

interface Props {
  /** Edit this collection; omit to create one. */
  collection?: Collection;
  /** For a new collection: start inside these parents. */
  initialParentIds?: Uuid[];
  onClose: () => void;
  onDeleted?: () => void;
}

export function CollectionDialog({ collection, initialParentIds = [], onClose, onDeleted }: Props) {
  const { t } = useI18n();
  const { graph } = useGraph();
  const create = useCreateCollection();
  const update = useUpdateCollection();
  const remove = useDeleteCollection();

  const [name, setName] = useState(collection?.name ?? "");
  const [color, setColor] = useState<string | null>(collection?.color ?? null);
  const [parentIds, setParentIds] = useState<Uuid[]>(
    collection ? (graph.parents.get(collection.id) ?? []) : initialParentIds,
  );
  const [error, setError] = useState<string | null>(null);

  // Never offer itself or its descendants as a parent: that would be a cycle.
  const candidates = useMemo(() => parentCandidates(graph, collection?.id ?? null), [graph, collection?.id]);
  const shown = color ?? colorFor(name || "?", null);

  async function submit() {
    setError(null);
    try {
      if (collection) await update.mutateAsync({ id: collection.id, name, color, parentIds });
      else await create.mutateAsync({ name, color, parentIds });
      onClose();
    } catch (err) {
      const code = errorCode(err);
      setError(code === "23505" ? t("collection.duplicateName") : code === "23514" ? t("collection.cycleError") : t("common.error"));
    }
  }

  async function destroy() {
    if (!collection || !confirm(t("collection.deleteConfirm", { name: collection.name }))) return;
    await remove.mutateAsync(collection.id);
    onDeleted?.();
    onClose();
  }

  return (
    <Dialog
      title={collection ? t("collection.edit") : t("collection.new")}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          {collection && (
            <button type="button" className="btn btn--danger push-left" onClick={() => void destroy()}>
              {t("collection.delete")}
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn--primary" disabled={!name.trim() || create.isPending || update.isPending}>
            {t("common.save")}
          </button>
        </>
      }
    >
      <label className="field">
        <span>{t("collection.name")}</span>
        <input required autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <fieldset className="field">
        <legend>{t("collection.color")}</legend>
        <div className="swatches">
          {COLLECTION_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${shown === c ? "is-active" : ""}`}
              style={{ background: c }}
              aria-label={c}
              aria-pressed={shown === c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </fieldset>

      <CollectionPicker
        label={t("collection.parents")}
        hint={t("collection.parentsHint")}
        options={candidates}
        value={parentIds}
        onChange={setParentIds}
        allowCreate={false}
      />

      {error && <p className="error">{error}</p>}
    </Dialog>
  );
}
