import { Link } from "react-router";
import {
  fileExtension,
  filesOf,
  formatBytes,
  opensInline,
  thumbFile,
  type CollectionGraph,
  type ItemFile,
  type ItemWithCollections,
} from "@nodoteca/core";
import { colorFor } from "../lib/colors.ts";
import { openFile } from "../lib/files.ts";
import { useI18n } from "../lib/i18n.tsx";
import { useOnline } from "../lib/offline.ts";
import { CollectionIcon } from "./CollectionIcon.tsx";
import { Dialog } from "./Dialog.tsx";
import { IconDownload, IconEdit, IconExternal } from "./Icons.tsx";
import { useNotice } from "./Prompt.tsx";

/** Opens or downloads a file from a click, with the app's own message when offline or on failure. */
export function useFileOpener() {
  const { t } = useI18n();
  const notice = useNotice();
  const online = useOnline();
  return (f: ItemFile, opts?: { download?: boolean }) => {
    if (!online) return void notice({ title: t("files.offlineTitle"), message: t("files.offline") });
    openFile(f, opts).catch(() => notice({ title: t("files.openFailedTitle"), message: t("files.openFailed") }));
  };
}

function hostAndPath(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname.replace(/^www\./, "") + u.pathname + u.search).replace(/\/$/, "");
  } catch {
    return url;
  }
}

interface Props {
  item: ItemWithCollections;
  graph: CollectionGraph;
  /** Signed URLs of file previews, by Storage path. */
  thumbs: Map<string, string>;
  onEdit: () => void;
  onClose: () => void;
}

/** Everything about one item: its link, note, collections and files to open or download. */
export function ItemDetailDialog({ item, graph, thumbs, onEdit, onClose }: Props) {
  const { t, locale } = useI18n();
  const online = useOnline();
  const open = useFileOpener();
  const files = filesOf(item);
  const fileThumb = thumbFile(item)?.thumb_path;
  const picture = item.thumbnail_url ?? (fileThumb ? thumbs.get(fileThumb) : undefined);
  const date = new Date(item.created_at).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  const collections = item.item_collections
    .map((r) => graph.byId.get(r.collection_id))
    .filter((c) => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Dialog
      title={item.title || (item.url ? hostAndPath(item.url) : files[0]?.name) || t("item.untitled")}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t("common.close")}
          </button>
          {online && (
            <button type="button" className="btn btn--primary" onClick={onEdit} data-autofocus>
              <IconEdit s={15} /> {t("item.edit")}
            </button>
          )}
        </>
      }
    >
      {picture && <img className="dialog__thumb detail__picture" src={picture} alt="" referrerPolicy="no-referrer" />}

      <p className="card__meta detail__meta">
        <span className="card__site">{item.site_name || (item.url ? new URL(item.url).hostname.replace(/^www\./, "") : t("files.file"))}</span>
        <time dateTime={item.created_at}>{date}</time>
      </p>

      {item.url && (
        <a className="detail__link" href={item.url} target="_blank" rel="noopener noreferrer">
          <IconExternal s={16} />
          <span>{hostAndPath(item.url)}</span>
        </a>
      )}

      {item.description && !item.note && <p className="detail__text muted">{item.description}</p>}
      {item.note && <p className="detail__text">{item.note}</p>}

      {collections.length > 0 && (
        <ul className="card__chips">
          {collections.map((c) => (
            <li key={c.id}>
              <Link
                to={`/c/${c.id}`}
                onClick={onClose}
                className="chip chip--link"
                style={{ "--chip": colorFor(c.name, c.color) } as React.CSSProperties}
              >
                <CollectionIcon collection={c} size="sm" />
                <span className="chip__label">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <div className="field">
          <span>{item.url ? t("files.attachments") : t("files.files")}</span>
          <ul className="files__list">
            {files.map((f) => (
              <li key={f.id} className="files__row">
                <span className="files__ext">{fileExtension(f.name) || "·"}</span>
                <span className="files__name" title={f.name}>{f.name}</span>
                <span className="files__size">{formatBytes(f.size, locale)}</span>
                {opensInline(f.mime) && (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={!online} onClick={() => open(f)}>
                    {t("files.open")}
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  disabled={!online}
                  aria-label={t("files.download")}
                  title={t("files.download")}
                  onClick={() => open(f, { download: true })}
                >
                  <IconDownload s={16} />
                </button>
              </li>
            ))}
          </ul>
          {!online && <small className="muted">{t("files.offline")}</small>}
        </div>
      )}
    </Dialog>
  );
}
