import type {
  ModelServiceConfig,
  UserscriptAiRequest,
  UserscriptAiResponse,
} from '../domain/types';
import {
  AiServiceHttpError,
  type AiServiceRequestDiagnostic,
} from './ai-service-http';
import { ChatCompletionsClient } from './chat-completions-client';
import type {
  AiModelClient,
  AiModelCompletion,
  AiModelStreamCallbacks,
  AiModelStreamRequest,
} from './model-client';
import { ResponsesApiClient } from './responses-api-client';

type ResponsesConversionFailure = Readonly<
  AiServiceRequestDiagnostic & {
    errorType?: string;
    errorCode?: string;
  }
>;

export function responsesConversionUnavailable(
  error: unknown,
): error is AiServiceHttpError & {
  diagnostic: ResponsesConversionFailure;
} {
  return (
    error instanceof AiServiceHttpError &&
    error.diagnostic.status === 500 &&
    error.diagnostic.errorType === 'new_api_error' &&
    error.diagnostic.errorCode === 'convert_request_failed' &&
    /not implemented/i.test(error.message)
  );
}

export class ResponsesCompatibilityClient implements AiModelClient {
  private useChatCompletions = false;

  constructor(
    private readonly config: ModelServiceConfig,
    private readonly responses: AiModelClient = new ResponsesApiClient(config),
    private readonly chatCompletions: AiModelClient = new ChatCompletionsClient(
      config,
    ),
  ) {}

  private async execute<Result>(
    responses: () => Promise<Result>,
    chatCompletions: () => Promise<Result>,
  ) {
    if (this.useChatCompletions) return chatCompletions();
    try {
      return await responses();
    } catch (error) {
      if (!responsesConversionUnavailable(error)) throw error;
      this.useChatCompletions = true;
      console.warn(
        '[Card Master][ai-service] responses-conversion-unavailable',
        {
          model: this.config.model,
          endpoint: error.diagnostic.endpoint,
          status: error.diagnostic.status,
          errorType: error.diagnostic.errorType,
          errorCode: error.diagnostic.errorCode,
          serviceRequestId: error.diagnostic.serviceRequestId,
          serviceTraceId: error.diagnostic.serviceTraceId,
          fallbackProtocol: 'chat-completions',
        },
      );
      return chatCompletions();
    }
  }

  stream(
    request: AiModelStreamRequest,
    callbacks: AiModelStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<AiModelCompletion> {
    return this.execute(
      () => this.responses.stream(request, callbacks, signal),
      () => this.chatCompletions.stream(request, callbacks, signal),
    );
  }

  completeUserscriptRequest(
    request: UserscriptAiRequest,
    signal?: AbortSignal,
  ): Promise<UserscriptAiResponse> {
    return this.execute(
      () => this.responses.completeUserscriptRequest(request, signal),
      () => this.chatCompletions.completeUserscriptRequest(request, signal),
    );
  }
}
