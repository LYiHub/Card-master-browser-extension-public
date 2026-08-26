export const DATA_MANAGEMENT_ACTIONS = [
  'preferences',
  'scripts',
  'script-values',
  'assistant-conversations',
  'assistant-config',
  'assistant-pins',
  'content-blocking',
  'page-theme',
  'media-speed',
  'media-resources',
  'gamepad-control',
  'bilibili-capabilities',
  'diagnostics',
  'reset-all',
] as const;

export type DataManagementAction = (typeof DATA_MANAGEMENT_ACTIONS)[number];
export type DataManagementStepAction = Exclude<
  DataManagementAction,
  'reset-all'
>;

export type DataManagementStepResult = {
  action: DataManagementStepAction;
  status: 'completed' | 'failed';
  message: string;
  scriptsRemoved?: number;
  scriptValuesCleared?: number;
};

export type DataManagementResult = {
  action: DataManagementAction;
  status: 'completed' | 'partial';
  message: string;
  scriptsRemoved?: number;
  scriptValuesCleared?: number;
  steps?: readonly DataManagementStepResult[];
};

export interface DataManagementController {
  run(action: DataManagementAction): Promise<DataManagementResult>;
}

export function isDataManagementAction(
  value: unknown,
): value is DataManagementAction {
  return (
    typeof value === 'string' &&
    (DATA_MANAGEMENT_ACTIONS as readonly string[]).includes(value)
  );
}
