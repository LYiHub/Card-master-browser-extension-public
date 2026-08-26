import { describe, expect, it, vi } from 'vitest';

import { ExtensionSpeechRecognitionClient } from './extension-speech-recognition-client';

function extensionPort(postMessage: () => void) {
  return {
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onDisconnect: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    postMessage: vi.fn(postMessage),
    disconnect: vi.fn(),
  } as unknown as chrome.runtime.Port;
}

describe('ExtensionSpeechRecognitionClient', () => {
  it('turns a synchronously invalidated port into a rejected command', async () => {
    const failure = new Error('Extension context invalidated');
    const port = extensionPort(() => {
      throw failure;
    });
    const client = new ExtensionSpeechRecognitionClient({
      runtime: { connect: () => port },
    });

    await expect(client.cancelSpeechRecognition()).rejects.toBe(failure);
    expect(() => client.dispose()).not.toThrow();
  });

  it('keeps disposal idempotent when the port is already invalid', () => {
    const port = extensionPort(() => undefined);
    port.disconnect = vi.fn(() => {
      throw new Error('Extension context invalidated');
    });
    const client = new ExtensionSpeechRecognitionClient({
      runtime: { connect: () => port },
    });

    expect(() => {
      client.dispose();
      client.dispose();
    }).not.toThrow();
  });
});
