import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/instrument-sans";
import "@web/styles.css";
import "./popup.css";
import { I18nProvider } from "@web/lib/i18n.tsx";
import { Popup } from "./Popup.tsx";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <Popup />
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
