import { toast } from "@/hooks/use-toast";

export const requestZiteEndpoint = async ({
  appPublicIdentifier,
  inputs,
  workflowId,
  stream,
}: {
  appPublicIdentifier: string;
  inputs: any;
  mode: "live" | "preview";
  workflowId: string;
  stream?: boolean;
}): Promise<any> => {
  // @ts-ignore isLocalDev set by sdk.ts
  const SERVER_URL = window.isLocalDev
    ? "http://localhost:2506"
    : window.isStaging
      ? "https://staging-workflows.fillout.co"
      : window.isProduction
        ? "https://workflows.fillout.com"
        : // antony TODO eventually we can phase this out and
          // point everyone to workflows.fillout.com
          "https://server.zite.com";

  const host = window.location.host;
  const mode =
    host.startsWith("zite-editor-") ||
    host.endsWith(".ziteapp.com") ||
    host.endsWith(".zitedev.com")
      ? "preview"
      : "live";

  // ?usageToken=xxx
  const urlParams = new URLSearchParams(window.location.search);
  const usageToken = window._ziteUsageToken || urlParams.get("usageToken");
  const controller = new AbortController();
  const signal = controller.signal;

  const ziteAuthToken = localStorage.getItem("zite.auth.token");

  try {
    const fetchResponse = await fetch(
      `${SERVER_URL}/public/${appPublicIdentifier}/workflow/execute`,
      {
        credentials: "include",
        body: JSON.stringify({
          inputs,
          mode,
          workflowId,
          usageToken,
          stream,
          ziteAuthToken,
        }),
        method: "POST",
        headers: {
          "content-type": "application/json;charset=UTF-8",
        },
        signal,
      },
    );

    if (!fetchResponse.ok) {
      const errorData = await fetchResponse.json();
      throw new Error(
        `Error with endpoint ${workflowId}: ${errorData.message}` ||
          `Error with endpoint ${workflowId} status: ${fetchResponse.status}`,
      );
    }

    if (stream && fetchResponse.body !== null) {
      const decoder = new TextDecoder();

      const reader = fetchResponse.body.getReader();
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              const { value, done } = await reader.read();
              if (done) return { done: true, value: undefined };
              return {
                done: false,
                value: decoder.decode(value, { stream: true }),
              };
            },
          };
        },
      };
    }

    const response = await fetchResponse.json();

    return response;
  } catch (error) {
    // do not throw if request was aborted
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }

    const err = error as Error;
    const errorMessage =
      err.message || `Unknown error with endpoint ${workflowId}`;

    // This will result in the error being passed to the LLM (since we collect console.errors)
    console.error(errorMessage);

    if (mode === "live") {
      toast({
        variant: "destructive",
        title: errorMessage,
      });
    }

    throw error;
  }
};
