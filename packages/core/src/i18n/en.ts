/**
 * English: the default language and the source of truth.
 * Every other locale must provide exactly these keys (checked by TypeScript).
 * Placeholders use {name} syntax.
 */
export const en = {
  "app.name": "Nodoteca",
  "app.tagline": "One link, many collections.",

  "auth.intro": "Sign in with your email. No password needed.",
  "auth.email": "Email",
  "auth.sendMagicLink": "Send me a sign-in link",
  "auth.sending": "Sending…",
  "auth.checkInbox": "Check your inbox: we sent a sign-in link to {email}.",
  "auth.useAnotherEmail": "Use a different email",
  "auth.signOut": "Sign out",

  "nav.all": "All links",
  "nav.unfiled": "Unfiled",
  "nav.collections": "Collections",
  "nav.menu": "Menu",

  "item.add": "Save link",
  "item.edit": "Edit link",
  "item.url": "Link",
  "item.urlPlaceholder": "Paste a link",
  "item.invalidUrl": "That doesn't look like a link.",
  "item.title": "Title",
  "item.note": "Note",
  "item.untitled": "Untitled",
  "item.loadingPreview": "Fetching preview…",
  "item.alreadySaved": "Already saved in: {collections}.",
  "item.alreadySavedNowhere": "Already saved (not in any collection).",
  "item.saveAnyway": "Save anyway",
  "item.delete": "Delete link",
  "item.deleteConfirm": "Delete this link? It will be removed from every collection.",

  "collection.new": "New collection",
  "collection.edit": "Edit collection",
  "collection.name": "Name",
  "collection.color": "Color",
  "collection.parents": "Inside",
  "collection.parentsHint": "A collection can sit inside several others.",
  "collection.addTo": "Collections",
  "collection.findOrCreate": "Find or create a collection…",
  "collection.create": "Create “{name}”",
  "collection.none": "No collections yet.",
  "collection.empty": "No links here yet.",
  "collection.includeSub": "Include sub-collections",
  "collection.alsoIn": "Also inside: {names}",
  "collection.delete": "Delete collection",
  "collection.deleteConfirm": "Delete “{name}”? Its links stay saved: they are only removed from this collection.",
  "collection.duplicateName": "You already have a collection with this name.",
  "collection.cycleError": "That would put a collection inside itself.",

  "search.placeholder": "Search links, notes, sites…",
  "search.results": "Results for “{query}”",
  "search.noResults": "Nothing found for “{query}”.",

  "library.empty": "Your library is empty. Save your first link!",

  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",

  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.loading": "Loading…",
  "common.error": "Something went wrong. Please try again.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
