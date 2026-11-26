import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from "./App";
import { ErrorBoundary } from 'react-error-boundary';
import { AlertTriangle, HammerIcon, RotateCw } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function reloadApp() {
  if (window._ziteOnReload) {
    window._ziteOnReload();
  } else {
    location.reload();
  }
}

function RuntimeErrorFallback(props: { error: Error }) {
  const allowAiFix = window.__ziteAllowAiFix === true;

  return (
    <div className="fixed inset-0 grid place-items-center">
      {/* This card is the one screen that can appear before any theme is
          applied, so it uses the colour variables (which have defaults in
          index.css) rather than fixed whites and greys that assume light mode. */}
      <div className="relative m-4 w-full max-w-xl rounded-[var(--radius)] border border-t-4 border-border border-t-destructive bg-card p-4 text-card-foreground shadow-lg">
        <h3 className="mb-2 flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          This screen broke
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          {allowAiFix
            ? 'The app hit an unexpected error. Reloading usually clears it.'
            : 'Something went wrong while loading this page. Reloading usually clears it, and if it keeps happening, tell an admin so they know it is still there.'}
        </p>

        <pre className="overflow-auto rounded border-l-4 border-destructive bg-muted p-4 font-mono text-sm text-foreground">
          {props.error.message}
        </pre>
        <div className="mt-4 flex gap-2">
          {allowAiFix ? (
            <button
              type="button"
              className="flex items-center gap-2 rounded border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-foreground transition hover:bg-accent"
              onClick={() => window._ziteOnFixError?.(props.error)}
            >
              <HammerIcon className="h-4 w-4" />
              Fix it for me
            </button>
          ) : null}
          <button
            type="button"
            onClick={reloadApp}
            className="flex items-center gap-2 rounded border border-border bg-muted px-2.5 py-1.5 text-sm font-medium text-foreground transition hover:bg-accent"
          >
            <RotateCw className="h-4 w-4" />
            Reload the page
          </button>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      fallbackRender={props => <RuntimeErrorFallback error={props.error} />}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Register the service worker for the installed PWA (offline shell + push).
// Production always; in dev only when explicitly asked, because otherwise it
// serves stale bundles and fights Vite's HMR. Set VITE_ENABLE_SW=1 in dev when
// you need to test notifications or offline behaviour specifically.
if ('serviceWorker' in navigator && (import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW === '1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A failed registration just means no offline shell or push; the app works.
    });
  });
}
