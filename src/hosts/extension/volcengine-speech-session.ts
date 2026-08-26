import {
  createVolcengineAsrAudioFrame,
  createVolcengineAsrRequest,
  parseVolcengineAsrResponse,
  type VolcengineAsrResult,
} from '../../ai/infrastructure/volcengine-asr-protocol';

export const SPEECH_AUTHORIZATION_RULE_ID = 1_800_000_001;
const SPEECH_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel';
const SPEECH_RESOURCE_ID = 'volc.seedasr.sauc.duration';

type SpeechDeclarativeNetRequestApi = Pick<
  typeof chrome.declarativeNetRequest,
  'getSessionRules' | 'updateSessionRules'
>;

export type VolcengineSpeechAuthorization = {
  sessionId: string;
  endpoint: string;
};

type SpeechSessionCallbacks = {
  onResult: (result: VolcengineAsrResult) => void;
  onError: (error: Error) => void;
  onClosed: () => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function speechEndpoint() {
  return new URL(SPEECH_ENDPOINT);
}

export function createVolcengineSpeechAuthorizationRule(
  endpoint: URL,
  apiKey: string,
  requestId: string,
  resourceId: string,
): chrome.declarativeNetRequest.Rule {
  return {
    id: SPEECH_AUTHORIZATION_RULE_ID,
    priority: 10_000,
    action: {
      type: 'modifyHeaders' as chrome.declarativeNetRequest.RuleActionType,
      requestHeaders: [
        {
          header: 'X-Api-Key',
          operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
          value: apiKey,
        },
        {
          header: 'X-Api-Resource-Id',
          operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
          value: resourceId,
        },
        {
          header: 'X-Api-Connect-Id',
          operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
          value: requestId,
        },
        {
          header: 'X-Api-Request-Id',
          operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
          value: requestId,
        },
        {
          header: 'X-Api-Sequence',
          operation: 'set' as chrome.declarativeNetRequest.HeaderOperation,
          value: '-1',
        },
      ],
    },
    condition: {
      urlFilter: `||${endpoint.hostname}${endpoint.pathname}|`,
      resourceTypes: ['websocket' as chrome.declarativeNetRequest.ResourceType],
    },
  };
}

async function installAuthorizationRule(
  declarativeNetRequest: SpeechDeclarativeNetRequestApi,
  endpoint: URL,
  apiKey: string,
  requestId: string,
  resourceId: string,
) {
  await declarativeNetRequest.updateSessionRules({
    removeRuleIds: [SPEECH_AUTHORIZATION_RULE_ID],
    addRules: [
      createVolcengineSpeechAuthorizationRule(
        endpoint,
        apiKey,
        requestId,
        resourceId,
      ),
    ],
  });
  const installed = await declarativeNetRequest.getSessionRules();
  if (!installed.some((rule) => rule.id === SPEECH_AUTHORIZATION_RULE_ID)) {
    throw new Error('语音识别鉴权规则未能写入浏览器。');
  }
}

async function removeAuthorizationRule(
  declarativeNetRequest: SpeechDeclarativeNetRequestApi,
) {
  await declarativeNetRequest
    .updateSessionRules({
      removeRuleIds: [SPEECH_AUTHORIZATION_RULE_ID],
    })
    .catch(() => undefined);
}

export class VolcengineSpeechAuthorizationCoordinator {
  private activeSessionId: string | null = null;
  private operation = Promise.resolve();

  constructor(
    private readonly declarativeNetRequest: SpeechDeclarativeNetRequestApi,
  ) {}

  open(apiKey: string): Promise<VolcengineSpeechAuthorization> {
    return this.enqueue(async () => {
      if (this.activeSessionId) {
        throw new Error('已有语音识别鉴权会话正在运行。');
      }
      const sessionId = crypto.randomUUID();
      this.activeSessionId = sessionId;
      try {
        const endpoint = speechEndpoint();
        const requestId = crypto.randomUUID();
        await installAuthorizationRule(
          this.declarativeNetRequest,
          endpoint,
          apiKey,
          requestId,
          SPEECH_RESOURCE_ID,
        );
        return { sessionId, endpoint: endpoint.href };
      } catch (error) {
        if (this.activeSessionId === sessionId) this.activeSessionId = null;
        throw error;
      }
    });
  }

  close(sessionId: string) {
    return this.enqueue(async () => {
      if (this.activeSessionId !== sessionId) return;
      this.activeSessionId = null;
      await removeAuthorizationRule(this.declarativeNetRequest);
    });
  }

  private enqueue<T>(operation: () => Promise<T>) {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class VolcengineSpeechSession {
  private socket: WebSocket | null = null;
  private audioQueue: Promise<void> = Promise.resolve();
  private closed = false;
  private finalReceived = false;
  private responseQueue: Promise<void> = Promise.resolve();
  private sequence = 1;

  constructor(private readonly callbacks: SpeechSessionCallbacks) {}

  async connect(endpointValue: string) {
    if (this.socket) throw new Error('语音识别会话已经建立。');
    const userId = crypto.randomUUID();
    const endpoint = new URL(endpointValue);
    if (
      endpoint.protocol !== 'wss:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    ) {
      throw new Error('语音识别服务地址配置无效。');
    }
    const socket = await new Promise<WebSocket>((resolve, reject) => {
      const candidate = new WebSocket(endpoint.href);
      candidate.binaryType = 'arraybuffer';
      candidate.addEventListener('open', () => resolve(candidate), {
        once: true,
      });
      candidate.addEventListener(
        'error',
        () => reject(new Error('无法连接字节跳动语音识别服务。')),
        { once: true },
      );
    });
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      this.responseQueue = this.responseQueue
        .then(async () => {
          const result = await parseVolcengineAsrResponse(
            event.data as ArrayBuffer,
          );
          if (result.final) this.finalReceived = true;
          this.callbacks.onResult(result);
        })
        .catch((error) => {
          this.callbacks.onError(errorMessage(error));
          this.close();
        });
    });
    socket.addEventListener('close', () => {
      if (!this.closed && !this.finalReceived) {
        this.callbacks.onError(new Error('语音识别连接在返回最终结果前中断。'));
      }
      this.closed = true;
      this.callbacks.onClosed();
    });
    socket.addEventListener('error', () => {
      if (!this.closed) {
        this.callbacks.onError(new Error('语音识别连接发生网络错误。'));
      }
    });
    socket.send(await createVolcengineAsrRequest(this.sequence++, userId));
  }

  sendAudio(pcm: Uint8Array) {
    if (!this.socket || this.closed) {
      return Promise.reject(new Error('语音识别会话尚未开始。'));
    }
    this.audioQueue = this.audioQueue.then(async () => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        throw new Error('语音识别连接已经关闭。');
      }
      this.socket.send(
        await createVolcengineAsrAudioFrame(pcm, this.sequence++, false),
      );
    });
    return this.audioQueue;
  }

  finish() {
    if (!this.socket || this.closed) return Promise.resolve();
    this.audioQueue = this.audioQueue.then(async () => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      this.socket.send(
        await createVolcengineAsrAudioFrame(
          new Uint8Array(),
          this.sequence++,
          true,
        ),
      );
    });
    return this.audioQueue;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.socket?.close(1000, '语音输入已关闭');
    this.socket = null;
  }
}
