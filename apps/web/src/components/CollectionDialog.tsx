import { useMemo, useState } from "react";
import { lastIcon, normalizeIcon, parentCandidates, type Collection, type Uuid } from "@nodoteca/core";
import { useCreateCollection, useDeleteCollection, useGraph, useUpdateCollection } from "../lib/api.ts";
import { COLLECTION_COLORS, colorFor } from "../lib/colors.ts";
import { useI18n } from "../lib/i18n.tsx";
import { errorCode } from "../lib/supabase.ts";
import { CollectionPicker } from "./CollectionPicker.tsx";
import { CollectionIcon } from "./CollectionIcon.tsx";
import { Dialog } from "./Dialog.tsx";

// Ten rows of eight, by theme: reading, work, tech, design, media, food, travel, sport, nature, everything else.
const EMOJI = [
  ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
    "📚📖🔖📝🎓🧠💡🗞️💼📊📈🗂️📌📎🗓️✅💻🖥️⌨️🛠️⚙️🤖🧪🔒🎨✨🖌️📐🖼️🎭📷🎬🎵🎧🎸🎮📺🎙️🍿📰🍝🍕🍣🥗🍰☕🍷🍳✈️🗺️🏖️🏔️🏠🌍🚲🚗⚽🏃🧘💪🏀🎾🥾❤️🌱🌸🐶🐱🌙☀️🔥🌊⭐🎁🛒💰👶🎉🧩💬",
  ),
].map((g) => g.segment);

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
  const [icon, setIcon] = useState<string | null>(collection?.icon ?? null);
  const [customIcon, setCustomIcon] = useState("");
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
      if (collection) await update.mutateAsync({ id: collection.id, name, color, icon, parentIds });
      else await create.mutateAsync({ name, color, icon, parentIds });
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
      <div className="collection-head">
        <CollectionIcon collection={{ name: name || "?", color: shown, icon }} size="xl" />
        <label className="field">
          <span>{t("collection.name")}</span>
          <input required autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      <fieldset className="field">
        <legend>{t("collection.icon")}</legend>
        <div className="emoji-grid" role="radiogroup" aria-label={t("collection.icon")}>
          <button
            type="button"
            role="radio"
            aria-checked={!icon}
            className={`emoji-grid__item emoji-grid__none ${!icon ? "is-active" : ""}`}
            title={t("collection.iconNone")}
            aria-label={t("collection.iconNone")}
            onClick={() => {
              setIcon(null);
              setCustomIcon("");
            }}
          >
            <CollectionIcon collection={{ name: name || "?", color: shown, icon: null }} size="sm" />
          </button>
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={icon === e}
              aria-label={e}
              className={`emoji-grid__item ${icon === e ? "is-active" : ""}`}
              onClick={() => {
                setIcon(e);
                setCustomIcon("");
              }}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          className="emoji-custom"
          value={customIcon}
          maxLength={40}
          placeholder={t("collection.iconCustom")}
          aria-label={t("collection.iconCustom")}
          onChange={(e) => {
            setCustomIcon(e.target.value);
            const picked = lastIcon(e.target.value);
            if (picked) setIcon(normalizeIcon(picked));
          }}
        />
        {customIcon.trim() && !lastIcon(customIcon) && <small className="error">{t("collection.iconInvalid")}</small>}
      </fieldset>

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
