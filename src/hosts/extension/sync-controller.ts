import type {
  SyncCommand,
  SyncController,
  SyncSnapshot,
} from '../../sync/model';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

export class ExtensionSyncController implements SyncController {
  constructor(private readonly api: ExtensionApi) {}

  async request(command: SyncCommand) {
    const response = await sendExtensionRequest<
      SyncSnapshot & { error?: string }
    >(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'sync-command',
      command,
    });
    if (response?.error) throw new Error(response.error);
    if (!response || typeof response.status !== 'string')
      throw new Error('同步服务未返回有效状态。');
    return response;
  }
}
