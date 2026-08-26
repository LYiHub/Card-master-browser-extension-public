import type {
  DataManagementAction,
  DataManagementController,
  DataManagementResult,
} from '../../data-management/domain/types';
import { type ExtensionApi, sendExtensionRequest } from './api';
import { EXTENSION_CHANNEL } from './protocol';

type DataManagementResponse = {
  result?: DataManagementResult;
  error?: string;
};

export class ExtensionDataManagementController
  implements DataManagementController
{
  constructor(private readonly api: ExtensionApi) {}

  async run(action: DataManagementAction) {
    const response = await sendExtensionRequest<DataManagementResponse>(
      this.api,
      {
        channel: EXTENSION_CHANNEL,
        type: 'data-management-run',
        action,
      },
    );
    if (response.error) throw new Error(response.error);
    if (!response.result) throw new Error('数据管理操作没有返回结果。');
    return response.result;
  }
}
