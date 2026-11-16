# @nodoteca/extension

Chrome extension (Manifest V3): save the page you're on into one or more
collections, without leaving it.

- Click the toolbar icon, or press **Alt+Shift+N**
- Title is pre-filled, a preview is fetched, and you're warned if the link is already saved
- Pick or create collections, add a note, save

It reuses the web app's data layer, components and styles (`@web` alias →
`apps/web/src`), so both always behave the same.

## Build and install

```bash
npm run build:extension     # from the repo root -> apps/extension/dist
```

1. Open `chrome://extensions` and turn on **Developer mode**
2. **Load unpacked** → select `apps/extension/dist`
3. Click the icon, enter your email, open the link you receive, then click the icon again

`npm run dev -w @nodoteca/extension` rebuilds on every change; click the
reload icon on `chrome://extensions` to pick it up.

## Sign-in

An email link can't open an extension popup, so the link points to
`connect-extension.html` on the web app instead. That page reads the session
from the URL fragment (never sent to a server) and hands it to the extension
that asked for it (its id is in the link) through `externally_connectable`.
The extension gets its **own** session, independent from the web app's.

## Permissions

- `activeTab`: read the URL and title of the current tab **when you click the icon**
- `storage`: keep the handed-over session until the popup opens
