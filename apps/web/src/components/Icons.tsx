/** Small stroke icons, drawn on a 20px grid so they stay crisp at 16–20px. */
const icon = (d: string, size = 18) =>
  function Icon({ s = size }: { s?: number }) {
    return (
      <svg viewBox="0 0 20 20" width={s} height={s} aria-hidden="true">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

export const IconSearch = icon("M9 15.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM17.5 17.5l-3.9-3.9");
export const IconPlus = icon("M10 4v12M4 10h12");
export const IconAll = icon("M3.5 5.5h13M3.5 10h13M3.5 14.5h8");
export const IconInbox = icon("M3 11.5 5.2 4.6a1.5 1.5 0 0 1 1.4-1.1h6.8a1.5 1.5 0 0 1 1.4 1.1L17 11.5M3 11.5V15a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15v-3.5M3 11.5h4l1 2h4l1-2h4");
export const IconCollections = icon("M3.5 6.5h5l1.5 2h6.5v7a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-9ZM3.5 6.5V4.8A1.3 1.3 0 0 1 4.8 3.5h3.4l1.3 1.5");
export const IconEdit = icon("M12.8 3.7a1.9 1.9 0 0 1 2.7 2.7L7 15l-3.5 1 1-3.5 8.3-8.8Z");
export const IconTrash = icon("M4 5.5h12M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5.5 5.5l.7 10a1.5 1.5 0 0 0 1.5 1.4h4.6a1.5 1.5 0 0 0 1.5-1.4l.7-10");
export const IconRefresh = icon("M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3h-3");
export const IconClose = icon("M5 5l10 10M15 5 5 15");
export const IconOffline = icon("M3 3l14 14M8.5 4.2A11 11 0 0 1 18 7M2 7a11 11 0 0 1 2.6-1.8M5 10.3a6.5 6.5 0 0 1 3-1.6M15 10.3a6.5 6.5 0 0 0-1.2-.8M8 13.6a3 3 0 0 1 4 0M10 16.5h0");
export const IconPaperclip = icon("M15 9.2 9.7 14.5a3.2 3.2 0 0 1-4.5-4.5l5.9-5.9a2.1 2.1 0 0 1 3 3l-5.8 5.8a1 1 0 0 1-1.5-1.5L12 6.2");
export const IconArrowUp = icon("M10 15.5v-11M5.5 9 10 4.5 14.5 9");
export const IconDownload = icon("M10 3.5v9m0 0-3.5-3.5M10 12.5l3.5-3.5M4 16h12");
export const IconExternal = icon("M11.5 3.5h5v5M16.5 3.5 9 11M14 11.5v3.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 4 15V7.5A1.5 1.5 0 0 1 5.5 6H9");
