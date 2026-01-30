/**
 * Type declarations for @fillout/zite-lambda-sdk
 *
 * This package is pre-installed in E2B sandboxes and provides runtime
 * SDK helpers for endpoint execution. Types are declared here since
 * the package lives in a separate repository.
 */

declare module '@fillout/zite-lambda-sdk' {
  // Log collector
  export function initLogCollector(): void;
  export function resetLogCollector(): void;
  export function getLogCollector(): ZiteLogCollector | undefined;
  export function getLogLimits(): LogLimits;
  export function truncateToLimit(str: string, maxLength: number): string;
  export function getLogSize(event: WorkflowEvent): number;
  export function addSdkCallEvent(
    integrationId: string,
    methodName: string,
    params: unknown,
    result: unknown,
    error: string | undefined,
    durationMs: number
  ): void;

  // SDK call helpers
  export function callWorkflowRunner(
    integrationId: string,
    methodName: string,
    params: unknown
  ): Promise<unknown>;

  export function wrapSdkCall<T>(
    integrationId: string,
    methodName: string,
    params: unknown,
    call: () => Promise<T>
  ): Promise<T>;

  // Direct SDK calls
  export function directSdkCall(
    integrationId: string,
    methodName: string,
    params: unknown
  ): Promise<unknown>;

  export interface ServiceCredential {
    serviceType: string;
    integrationId: string;
    settings: Record<string, unknown>;
    accessToken?: string;
    apiKey?: string;
    config?: Record<string, unknown>;
  }

  // Endpoint creation
  export function createEndpoint<TInput, TOutput>(
    config: EndpointConfig<TInput, TOutput>
  ): EndpointResult<TInput, TOutput>;

  export interface EndpointConfig<TInput, TOutput> {
    inputSchema?: import('zod').ZodType<TInput>;
    outputSchema?: import('zod').ZodType<TOutput>;
    execute: (params: {
      input: TInput;
      context: { user?: Record<string, unknown> } | null;
    }) => Promise<TOutput>;
  }

  export interface EndpointResult<TInput, TOutput> {
    execute: (params: {
      input: TInput;
      context: { user?: Record<string, unknown> } | null;
    }) => Promise<TOutput>;
    inputSchema?: import('zod').ZodType<TInput>;
    outputSchema?: import('zod').ZodType<TOutput>;
  }

  // Error handling
  export class ZiteError extends Error {
    code: ZiteErrorCode;
    constructor(params: { code: ZiteErrorCode; message: string });
  }

  export type ZiteErrorCode =
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'UNPROCESSABLE_ENTITY'
    | 'INTERNAL_SERVER_ERROR'
    | 'SERVICE_UNAVAILABLE';

  export function errorCodeToHttpStatus(code: ZiteErrorCode): number;

  // Stream utilities
  export function parseSSEStream(
    stream: ReadableStream<Uint8Array>
  ): AsyncGenerator<string, void, unknown>;

  export function createStreamInterface(): ZiteStreamInterface;

  // Types
  export interface ZiteExecutionConfig {
    token: string;
    workflowRunnerUrl: string;
    runId: string;
    workflowId: string;
    snapshotId: number;
  }

  export interface ZiteLogCollector {
    events: WorkflowEvent[];
  }

  export interface ZiteStreamInterface {
    write: (chunk: string) => void;
    end: () => void;
    getStream: () => ReadableStream<string>;
  }

  export type WorkflowEvent = SdkCallEvent | ConsoleEvent | FetchEvent;

  export interface SdkCallEvent {
    type: 'sdk_call';
    data: SdkCallEventData;
    createdAt: number;
  }

  export interface ConsoleEvent {
    type: 'console';
    data: ConsoleEventData;
    createdAt: number;
  }

  export interface FetchEvent {
    type: 'fetch';
    data: FetchEventData;
    createdAt: number;
  }

  export interface SdkCallEventData {
    integrationId: string;
    method: string;
    params: unknown;
    result: unknown;
    error?: string;
    durationMs: number;
  }

  export interface ConsoleEventData {
    level: 'log' | 'info' | 'warn' | 'error';
    message: string;
  }

  export interface FetchEventData {
    url: string;
    method: string;
    status: number;
    durationMs: number;
  }

  export interface LogLimits {
    maxEvents: number;
    maxEventSize: number;
    maxTotalSize: number;
  }

  export const DEFAULT_LOG_LIMITS: LogLimits;

  export type InferSchemaType<T> = T extends import('zod').ZodType<infer U> ? U : never;
}
