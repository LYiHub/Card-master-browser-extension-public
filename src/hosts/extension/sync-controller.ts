import type {
  SyncCommand,
  SyncController,
  SyncSnapshot,
} from '../../sync/model';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

export class ExtensionSyncController implements SyncController {
  constructor(private readonly api: ExtensionApi) {}

  request(command: SyncCommand) {
    return sendExtensionRequest<SyncSnapshot>(this.api, {
      channel: EXTENSION_CHANNEL,
      type: 'sync-command',
      command,
    });
  }
}
