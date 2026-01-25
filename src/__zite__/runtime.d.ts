/**
 * @fillout/zite-lambda-runtime
 *
 * Type declarations for the Zite Lambda Runtime SDK.
 * This module is provided by the Cloudflare Worker at runtime.
 *
 * DO NOT EDIT - This file defines the contract between endpoint code
 * and the runtime implementation in packages/zite-lambda-sdk.
 */

declare module '@fillout/zite-lambda-runtime' {
  // ============================================================
  // ZiteError
  // ============================================================

  export type ZiteErrorCode =
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'RATE_LIMITED'
    | 'INTERNAL_ERROR';

  export class ZiteError extends Error {
    code: ZiteErrorCode;
    constructor(params: { code: ZiteErrorCode; message: string });
  }

  export function errorCodeToHttpStatus(code: ZiteErrorCode): number;

  // ============================================================
  // createEndpoint
  // ============================================================

  /**
   * Helper type to infer the output type from a Zod schema.
   * Zod schemas have an _output property that represents the inferred type.
   */
  export type InferSchemaType<T> = T extends { _output: infer U } ? U : T;

  /**
   * Stream interface for streaming endpoints.
   */
  export type ZiteStreamInterface = {
    /** Write a chunk to the stream (sent to frontend in real-time) */
    write: (data: any) => Promise<void>;
    /** Forward an AsyncIterable to the stream and collect the result */
    forward: (asyncIterable: AsyncIterable<string>) => Promise<string>;
  };

  /**
   * Endpoint configuration type.
   */
  export interface EndpointConfig<TInput, TOutput, TContext> {
    id?: string;
    description?: string;
    authenticated?: boolean;
    /** Enable streaming for this endpoint */
    stream?: boolean;
    inputSchema: TInput;
    outputSchema: TOutput;
    execute: (params: {
      input: InferSchemaType<TInput>;
      context: TContext;
      stream?: ZiteStreamInterface;
    }) => Promise<InferSchemaType<TOutput>>;
  }

  /**
   * Create an endpoint with the given configuration.
   */
  export function createEndpoint<TInput, TOutput, TContext = undefined>(
    config: EndpointConfig<TInput, TOutput, TContext>
  ): EndpointConfig<TInput, TOutput, TContext> & {
    inputSchema: TInput;
    outputSchema: TOutput;
  };

  // ============================================================
  // Logging
  // ============================================================

  /**
   * Initialize all log collection (console + fetch interception).
   * Called at the start of endpoint execution.
   */
  export function initializeLogging(): void;

  // ============================================================
  // SDK Call Helpers (used by generated SDK code)
  // ============================================================

  /**
   * Wrapper that handles SDK calls with automatic logging.
   * Used by generated SDK classes (Contact, Slack, etc.)
   */
  export function __wrapSdkCall<T>(
    integrationId: string,
    className: string,
    methodName: string,
    params: any
  ): Promise<T>;

  /**
   * Call workflow-runner for SDK operations.
   */
  export function __callWorkflowRunner(
    integrationId: string,
    methodName: string,
    params: any
  ): Promise<any>;

  /**
   * Parse SSE stream and yield chunks.
   */
  export function __parseSSEStream(response: Response): AsyncIterable<string>;
}
