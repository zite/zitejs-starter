import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "@app";
import { ErrorBoundary } from "react-error-boundary";
import { HammerIcon } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary
      fallbackRender={(props) => (
        <div className="fixed inset-0 grid place-items-center">
          <div className="relative w-full max-w-xl rounded border-t-4 border-t-red-500 bg-white p-4 shadow-lg">
            <h3 className="mb-2 flex items-center gap-2 font-medium">
              Issue rendering app
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              Try asking Zite to fix the issue or find a workaround.
            </p>

            <pre className="overflow-auto rounded border-l-4 border-red-500 bg-red-50 p-4 font-mono text-sm text-red-900">
              {props.error.message}
            </pre>
            <div className="flex gap-2 mt-4">
              <button
                className="flex items-center gap-2 rounded border border-red-100 bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-500 transition hover:bg-red-100"
                onClick={() => window._ziteOnFixError?.(props.error)}
              >
                <HammerIcon className="h-4 w-4" />
                Fix it for me
              </button>
              <button
                onClick={() => window._ziteOnReload?.()}
                className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      )}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
