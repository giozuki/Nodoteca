# @nodoteca/web

The Nodoteca web app: React + Vite + TypeScript, talking directly to Supabase.

```bash
npm run dev      # from the repo root: http://localhost:3000
npm run build
```

| Folder | What's inside |
|---|---|
| `src/lib/` | Supabase client, data hooks (TanStack Query), realtime sync, i18n |
| `src/components/` | UI: sidebar with the collection graph, item cards, dialogs, collection picker |
| `src/styles.css` | Design tokens and styles (light and dark follow the system) |

Port 3000 matches Supabase's default *Site URL*, so sign-in links work locally
without extra configuration.
