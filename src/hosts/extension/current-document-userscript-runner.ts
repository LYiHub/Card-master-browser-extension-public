import type { AiScriptExecution } from '../../ai/domain/types';
import { t } from '../../localization/messages';
import { matchInstalledUserscript } from '../../userscript/domain/matcher';
import type { ExtensionUserscriptApi } from './api';
import type { AssistantPageAttachment } from './assistant-page-observer';
import type { RegisteredUserscriptSynchronizer } from './registration-sync';
import type { ExtensionRuntimeBridge } from './runtime-bridge';
import { executeSafariUserscriptRegistration } from './safari-userscript-executor';

const RUNTIME_REPORT_TIMEOUT_MS = 3_000;
const RUNTIME_POLL_INTERVAL_MS = 50;

type CurrentDocumentExecutionApi = {
  userScripts?: Pick<ExtensionUserscriptApi['userScripts'], 'execute'>;
  scripting: Pick<typeof chrome.scripting, 'executeScript'>;
};

function wait(duration: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, duration));
}

function frameDocumentProbe() {
  return window.location.href;
}

export class CurrentDocumentUserscriptRunner {
  constructor(
    private readonly api: CurrentDocumentExecutionApi,
    private readonly synchronizer: RegisteredUserscriptSynchronizer,
    private readonly runtimeBridge: ExtensionRuntimeBridge,
  ) {}

  async execute(
    attachment: AssistantPageAttachment,
    scriptId: string,
  ): Promise<AiScriptExecution> {
    const { script, registrations } =
      await this.synchronizer.executionRegistrations(scriptId);
    const completedAt = Date.now();
    const match = matchInstalledUserscript(script, {
      url: attachment.context.url,
      frameId: 0,
      topFrame: true,
      softNavigation: false,
    });
    if (!script.manager.enabled || !match.eligible) {
      return {
        status: 'not-matched',
        url: attachment.context.url,
        completedAt,
        error: script.manager.enabled
          ? t('cm_current_document_userscript_runner_text_1', [
              String(match.reason),
            ])
          : t('cm_current_document_userscript_runner_text_2'),
      };
    }
    if (registrations.length === 0) {
      return {
        status: 'error',
        url: attachment.context.url,
        completedAt,
        error: t('cm_current_document_userscript_runner_error_3'),
      };
    }

    try {
      const previousState = await this.runtimeBridge.state(
        attachment.target.tabId,
        0,
        script.id,
        attachment.target.documentId,
      );
      const previousInstanceId = previousState?.instanceId ?? null;
      let allFrameDocumentIds: string[] | null = null;
      for (const registration of registrations) {
        const [firstSource, ...remainingSources] = registration.js ?? [];
        if (!firstSource) {
          throw new Error(
            t('cm_current_document_userscript_runner_error_4', [
              String(registration.id),
            ]),
          );
        }
        if (registration.allFrames && !allFrameDocumentIds) {
          allFrameDocumentIds =
            await this.resolveCurrentFrameDocumentIds(attachment);
        }
        const documentIds = registration.allFrames
          ? (allFrameDocumentIds ?? [attachment.target.documentId])
          : [attachment.target.documentId];
        if (this.api.userScripts) {
          await this.api.userScripts.execute({
            target: {
              tabId: attachment.target.tabId,
              documentIds,
            },
            js: [firstSource, ...remainingSources],
            world: registration.world,
            ...(registration.worldId ? { worldId: registration.worldId } : {}),
            injectImmediately: true,
          });
        } else {
          await executeSafariUserscriptRegistration(
            this.api.scripting,
            {
              tabId: attachment.target.tabId,
              documentIds,
            },
            registration,
          );
        }
      }

      const deadline = Date.now() + RUNTIME_REPORT_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const state = await this.runtimeBridge.state(
          attachment.target.tabId,
          0,
          script.id,
          attachment.target.documentId,
        );
        if (!state || state.instanceId === previousInstanceId) {
          await wait(RUNTIME_POLL_INTERVAL_MS);
          continue;
        }
        if (state.status === 'ready') {
          return {
            status: 'ready',
            url: attachment.context.url,
            completedAt: Date.now(),
          };
        }
        if (state.status === 'error') {
          return {
            status: 'error',
            url: attachment.context.url,
            completedAt: Date.now(),
            error:
              state.error || t('cm_current_document_userscript_runner_text_5'),
          };
        }
        await wait(RUNTIME_POLL_INTERVAL_MS);
      }
      return {
        status: 'error',
        url: attachment.context.url,
        completedAt: Date.now(),
        error: t('cm_current_document_userscript_runner_error_6'),
      };
    } catch (error) {
      return {
        status: 'error',
        url: attachment.context.url,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async resolveCurrentFrameDocumentIds(
    attachment: AssistantPageAttachment,
  ) {
    const results = await this.api.scripting.executeScript({
      target: {
        tabId: attachment.target.tabId,
        allFrames: true,
      },
      func: frameDocumentProbe,
    });
    const documentIds = [
      ...new Set(
        results.flatMap((result) =>
          result.documentId ? [result.documentId] : [],
        ),
      ),
    ];
    if (!documentIds.includes(attachment.target.documentId)) {
      throw new Error(t('cm_current_document_userscript_runner_error_7'));
    }
    return documentIds;
  }
}
