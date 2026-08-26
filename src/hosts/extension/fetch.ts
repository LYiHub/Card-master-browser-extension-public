import type { UserscriptFetch } from '../../userscript/application/update-service';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

type FetchResponse = {
  ok: boolean;
  status: number;
  body: string;
  error?: string;
};

export function extensionUserscriptFetch(api: ExtensionApi): UserscriptFetch {
  return async (input) => {
    const response = await sendExtensionRequest<FetchResponse>(api, {
      channel: EXTENSION_CHANNEL,
      type: 'fetch-update',
      url: input,
    });
    if (response.error) throw new Error(response.error);
    return new Response(response.body, { status: response.status });
  };
}
