import { useId, useMemo, useRef, useState } from "react";
import type { Collection, Uuid } from "@nodoteca/core";
import { useCreateCollection } from "../lib/api.ts";
import { colorFor } from "../lib/colors.ts";
import { useI18n } from "../lib/i18n.tsx";
import { CollectionIcon } from "./CollectionIcon.tsx";

interface Props {
  label: string;
  hint?: string;
  /** Collections that can be picked. */
  options: Collection[];
  value: Uuid[];
  onChange: (ids: Uuid[]) => void;
  /** Allow creating a new collection from the typed text. */
  allowCreate?: boolean;
}

/** Multi-select with type-to-filter and create-on-Enter. The heart of "one link, many collections". */
export function CollectionPicker({ label, hint, options, value, onChange, allowCreate = true }: Props) {
  const { t } = useI18n();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const create = useCreateCollection();

  const byId = useMemo(() => new Map(options.map((c) => [c.id, c])), [options]);
  const selected = value.map((v) => byId.get(v)).filter((c): c is Collection => !!c);

  const query = text.trim().toLocaleLowerCase();
  const matches = options.filter((c) => !value.includes(c.id) && c.name.toLocaleLowerCase().includes(query)).slice(0, 8);
  const exact = options.some((c) => c.name.toLocaleLowerCase() === query);
  const canCreate = allowCreate && query.length > 0 && !exact;
  const rows = matches.length + (canCreate ? 1 : 0);

  function pick(c: Collection) {
    onChange([...value, c.id]);
    setText("");
    setActive(0);
    inputRef.current?.focus();
  }

  async function createFromText() {
    const created = await create.mutateAsync({ name: text.trim() });
    pick(created);
  }

  function choose(index: number) {
    if (index < matches.length) pick(matches[index]!);
    else if (canCreate) void createFromText();
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="picker" onClick={() => inputRef.current?.focus()}>
        {selected.map((c) => (
          <span key={c.id} className="chip" style={{ "--chip": colorFor(c.name, c.color) } as React.CSSProperties}>
            <CollectionIcon collection={c} size="sm" />
            <span className="chip__label">{c.name}</span>
            <button
              type="button"
              className="chip__x"
              aria-label={`✕ ${c.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((v) => v !== c.id));
              }}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          value={text}
          role="combobox"
          aria-expanded={open && rows > 0}
          aria-controls={`${id}-list`}
          autoComplete="off"
          placeholder={selected.length ? "" : t("collection.findOrCreate")}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, rows - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && rows > 0 && query) {
              e.preventDefault();
              choose(active);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
        />
      </div>
      {open && rows > 0 && (
        <ul className="picker__list" id={`${id}-list`} role="listbox">
          {matches.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
            >
              <CollectionIcon collection={c} size="sm" />
              {c.name}
            </li>
          ))}
          {canCreate && (
            <li
              role="option"
              aria-selected={active === matches.length}
              className={`picker__create ${active === matches.length ? "is-active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                void createFromText();
              }}
            >
              + {t("collection.create", { name: text.trim() })}
            </li>
          )}
        </ul>
      )}
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}
