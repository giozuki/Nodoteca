/**
 * English: the default language and the source of truth.
 * Every other locale must provide exactly these keys (checked by TypeScript).
 * Placeholders use {name} syntax.
 */
export const en = {
  "app.name": "Nodoteca",
  "app.tagline": "One link, many collections.",

  "auth.signIn": "Sign in",
  "auth.signOut": "Sign out",
  "auth.email": "Email",
  "auth.sendMagicLink": "Send me a sign-in link",
  "auth.checkInbox": "Check your inbox: we sent a link to {email}.",

  "item.save": "Save",
  "item.url": "Link",
  "item.title": "Title",
  "item.note": "Note",
  "item.delete": "Delete link",
  "item.alreadySaved": "Already saved in: {collections}. Save it again?",
  "item.saveAnyway": "Save anyway",

  "collection.new": "New collection",
  "collection.name": "Name",
  "collection.parents": "Parent collections",
  "collection.addTo": "Add to collections",
  "collection.empty": "No links here yet.",
  "collection.cycleError": "That would put a collection inside itself.",
  "collection.count": "{count} links",

  "search.placeholder": "Search links, notes, sites…",
  "search.noResults": "Nothing found for “{query}”.",

  "settings.title": "Settings",
  "settings.language": "Language",

  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.error": "Something went wrong. Please try again.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
