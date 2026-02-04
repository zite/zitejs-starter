/**
 * Type declarations for @zite/endpoints-runtime-sdk
 *
 * This module is pre-bundled by cloudflare-lambda and provided as a Worker Loader
 * module (__zite-runtime__.js). It contains runtime infrastructure for endpoint
 * execution including logging, SDK call wrappers, and the endpoint factory.
 *
 * At bundle time, esbuild maps '@zite/endpoints-runtime-sdk' -> './__zite-runtime__.js'
 *
 * Note: These types are stable and unlikely to change frequently. Eventually this
 * will be abstracted into a `zite build` command that injects types automatically.
 */

declare module '@zite/endpoints-runtime-sdk' {
  // =============================================================================
  // Endpoint Creation
  // =============================================================================

  /**
   * Helper type to infer the output type from a Zod schema or use the type directly
   */
  type InferSchemaType<T> = T extends { _output: infer U } ? U : T;

  /**
   * Stream interface for streaming endpoints
   */
  interface ZiteStreamInterface {
    /** Write a chunk to the stream (sent to frontend in real-time) */
    write: (data: unknown) => Promise<void>;
    /** Forward an AsyncIterable to the stream and collect the result */
    forward: (asyncIterable: AsyncIterable<string>) => Promise<string>;
  }

  /**
   * Configuration for creating an endpoint
   */
  interface EndpointConfig<TInput, TOutput, TContext = unknown> {
    /** Optional endpoint identifier */
    id?: string;
    /** Optional description for documentation */
    description?: string;
    /** Whether the endpoint requires authentication */
    authenticated?: boolean;
    /** Enable streaming for this endpoint */
    stream?: boolean;
    /** Zod schema for input validation */
    inputSchema: TInput;
    /** Zod schema for output validation */
    outputSchema: TOutput;
    /** The endpoint handler function */
    execute: (params: {
      input: InferSchemaType<TInput>;
      context: TContext;
      /** Stream interface (only available when stream: true) */
      stream?: ZiteStreamInterface;
    }) => Promise<InferSchemaType<TOutput>>;
  }

  /**
   * Create an endpoint definition.
   * The context type is generic - the generated SDK provides the specific type.
   */
  export function createEndpoint<TInput, TOutput, TContext = unknown>(
    config: EndpointConfig<TInput, TOutput, TContext>
  ): EndpointConfig<TInput, TOutput, TContext>;

  // =============================================================================
  // Error Handling
  // =============================================================================

  /**
   * Error codes that map to HTTP status codes
   */
  type ZiteErrorCode =
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'RATE_LIMITED'
    | 'INTERNAL_ERROR';

  /**
   * Structured error class for endpoint errors.
   * Throw this to return specific HTTP status codes to the client.
   */
  export class ZiteError extends Error {
    code: ZiteErrorCode;
    constructor(params: { code: ZiteErrorCode; message: string });
  }

  // =============================================================================
  // Runtime Initialization (internal - rarely used directly)
  // =============================================================================

  /**
   * Initialize the Zite runtime - sets up log collector and intercepts console/fetch.
   * Called automatically when the module is imported.
   */
  export function initRuntime(): void;

  // =============================================================================
  // SDK Call Helpers (internal - used by generated integration code)
  // =============================================================================

  /**
   * Call workflow-runner for SDK operations (RPC mode).
   * Used internally by generated integration SDK code.
   */
  export function __callWorkflowRunner(
    integrationId: string,
    methodName: string,
    params: unknown
  ): Promise<unknown>;

  /**
   * Wrapper that handles SDK calls with automatic logging.
   * Uses direct execution when credentials are available, otherwise falls back to RPC.
   * Used internally by generated integration SDK code.
   */
  export function __wrapSdkCall<T>(
    integrationId: string,
    className: string,
    methodName: string,
    params: unknown
  ): Promise<T>;
}
