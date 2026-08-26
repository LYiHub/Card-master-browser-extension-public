import type { AssistantWorkbenchTab } from '../../ai/domain/types';
import type { BilibiliCapabilityController } from '../../bilibili-capabilities/domain/types';
import type { ContentBlockingController } from '../../content-blocking/domain/types';
import type { DataManagementController } from '../../data-management/domain/types';
import type { GamepadControlController } from '../../gamepad-control/domain/settings';
import type { MediaResourcesController } from '../../media-resources/domain/types';
import type { MediaSpeedController } from '../../media-speed/domain/types';
import type { PageThemeController } from '../../page-theme/domain/types';
import type { UserscriptCoverController } from '../../userscript/application/card-cover';
import type { UserscriptRuntime } from '../../userscript/application/runtime';
import type { ScriptRepository } from '../../userscript/application/script-repository';
import type { UserscriptSettingsController } from '../../userscript/application/settings';
import type { UserscriptSourceExporter } from '../../userscript/application/source-export';
import type { UserscriptUpdater } from '../../userscript/application/update-service';
import type {
  InstalledUserscript,
  ScriptMatchContext,
} from '../../userscript/domain/types';
import type { UserscriptExecutionCapability } from '../../userscript/runtime/capabilities';
import type { DeckEntryController } from './deck-entry';

export type DeckDetailStageModule = typeof import('./DetailStage');

export type UserscriptDeckHost = {
  scrollLockOwnerId: string;
  initialOpen?: boolean;
  onReady?: () => void;
  initialScripts: readonly InstalledUserscript[];
  repository: ScriptRepository;
  runtime: UserscriptRuntime;
  updater: UserscriptUpdater;
  userscriptSettings: UserscriptSettingsController;
  dataManagement: DataManagementController;
  sourceExporter: UserscriptSourceExporter;
  coverController: UserscriptCoverController;
  deckEntry: DeckEntryController;
  gamepadControl: GamepadControlController;
  openGlobalLibrary: () => Promise<void>;
  openSiteScriptSearch: () => Promise<void>;
  openNewTab: () => Promise<void>;
  openNewTabSettings: () => Promise<void>;
  openAssistantPanel: (tab?: AssistantWorkbenchTab) => Promise<void>;
  loadDetailStage?: () => Promise<DeckDetailStageModule>;
  readExecutionCapability: () => Promise<UserscriptExecutionCapability>;
  runtimeContext: ScriptMatchContext;
  contentBlocking?: ContentBlockingController;
  pageTheme?: PageThemeController;
  mediaSpeed?: MediaSpeedController;
  mediaResources?: MediaResourcesController;
  bilibiliCapabilities?: BilibiliCapabilityController;
  reportError?: (
    scope: string,
    event: string,
    error: unknown,
    details?: Readonly<Record<string, unknown>>,
  ) => void;
};
