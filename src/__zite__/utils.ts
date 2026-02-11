import { toast } from "@/hooks/use-toast";

/**
 * Response type for streaming endpoints.
 * Provides both real-time chunks via async iteration AND final structured result.
 *
 * Usage:
 * ```typescript
 * const stream = chat({ messages: [...] });
 *
 * // Iterate over chunks in real-time
 * for await (const chunk of stream) {
 *   setResponse(prev => prev + chunk);
 * }
 *
 * // Get final structured result (after stream completes)
 * const result = await stream.result;
 * ```
 */
export type StreamingResponse<T> = {
  [Symbol.asyncIterator](): AsyncIterator<string>;
  result: Promise<T>;
};

/**
 * Call a streaming endpoint and get both real-time chunks and final result.
 * Use this for endpoints that have `stream: true` in their config.
 *
 * Returns an object with:
 * - AsyncIterator: yields chunks as they arrive (use `for await...of`)
 * - result: Promise that resolves to the final structured result
 */
export function streamZiteEndpoint<T>({
  appPublicIdentifier,
  inputs,
  workflowId,
}: {
  appPublicIdentifier: string;
  inputs: Record<string, unknown>;
  mode: "live" | "preview";
  workflowId: string;
}): StreamingResponse<T> {
  // @ts-ignore isLocalDev set by sdk.ts
  const SERVER_URL = window.isLocalDev
    ? "http://localhost:2506"
    : window.isStaging
      ? "https://staging-workflows.fillout.co"
      : window.isProduction
        ? "https://workflows.fillout.com"
        : "https://server.zite.com";

  const host = window.location.host;
  const mode =
    host.endsWith(".zite-dev-sandbox.com") || host.endsWith(".zite-sandbox.com")
      ? "preview"
      : "live";

  const urlParams = new URLSearchParams(window.location.search);
  const usageToken = window._ziteUsageToken || urlParams.get("usageToken");
  const ziteAuthToken = localStorage.getItem("zite.auth.token");

  // Create result promise that will be resolved when we receive the 'result' SSE event
  let resultResolve: (value: T) => void;
  let resultReject: (error: Error) => void;
  const resultPromise = new Promise<T>((resolve, reject) => {
    resultResolve = resolve;
    resultReject = reject;
  });

  // Start the fetch immediately
  const fetchPromise = fetch(
    `${SERVER_URL}/public/${appPublicIdentifier}/workflow/execute`,
    {
      credentials: "include",
      body: JSON.stringify({
        inputs,
        mode,
        workflowId,
        usageToken,
        stream: true,
        ziteAuthToken,
      }),
      method: "POST",
      headers: {
        "content-type": "application/json;charset=UTF-8",
      },
    },
  );

  return {
    async *[Symbol.asyncIterator]() {
      try {
        const response = await fetchPromise;

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const error = new Error(
            errorData.message ||
              `Error with endpoint ${workflowId}: ${response.status}`,
          );
          resultReject(error);
          throw error;
        }

        if (!response.body) {
          const error = new Error("No response body for streaming endpoint");
          resultReject(error);
          throw error;
        }

        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;

          // Parse SSE events from buffer
          while (buffer.includes("\n\n")) {
            const eventEnd = buffer.indexOf("\n\n");
            const eventBlock = buffer.substring(0, eventEnd);
            buffer = buffer.substring(eventEnd + 2);

            // Parse event type and data from the SSE block
            const eventTypeMatch = eventBlock.match(/^event: (.+)$/m);
            const dataMatch = eventBlock.match(/^data: (.+)$/m);

            const eventType = eventTypeMatch?.[1];
            const dataStr = dataMatch?.[1];

            if (eventType === "data" && dataStr) {
              // Yield the chunk to the iterator
              try {
                yield JSON.parse(dataStr);
              } catch {
                // If not JSON, yield raw string
                yield dataStr;
              }
            } else if (eventType === "result" && dataStr) {
              // Resolve the result promise
              try {
                resultResolve(JSON.parse(dataStr));
              } catch {
                resultResolve(dataStr as unknown as T);
              }
            } else if (eventType === "error" && dataStr) {
              // Handle error event
              try {
                const errorData = JSON.parse(dataStr);
                resultReject(new Error(errorData.message || "Streaming error"));
              } catch {
                resultReject(new Error(dataStr || "Streaming error"));
              }
            }
            // 'done' event is handled by the stream ending naturally
          }
        }
      } catch (error) {
        const err = error as Error;

        // Don't toast for aborted requests
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        const errorMessage =
          err.message || `Unknown error with endpoint ${workflowId}`;
        console.error(errorMessage);

        if (mode === "live") {
          toast({
            variant: "destructive",
            title: errorMessage,
          });
        }

        resultReject(err);
        throw err;
      }
    },
    result: resultPromise,
  };
}

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
    host.startsWith("zite-editor") ||
    host.endsWith(".zite-dev-sandbox.com") ||
    host.endsWith(".zite-sandbox.com")
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
