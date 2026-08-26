import type { DailyReviewWallpaperService } from './daily-review-wallpaper-service';
import {
  type LumnoNewTabCompatibilityService,
  lumnoNewTabRequest,
} from './lumno-new-tab-compat';
import { newTabRequest } from './new-tab-protocol';
import type { ExtensionNewTabService } from './new-tab-service';

type NewTabBackgroundRouterDependencies = {
  compatibility: LumnoNewTabCompatibilityService;
  service: ExtensionNewTabService;
  dailyReview: DailyReviewWallpaperService;
  reportFailure: (context: string, error: unknown) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function routeNewTabBackgroundMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
  dependencies: NewTabBackgroundRouterDependencies,
) {
  if (lumnoNewTabRequest(message)) {
    void dependencies.compatibility
      .handle(message, sender)
      .then(sendResponse)
      .catch((error) => {
        dependencies.reportFailure('新标签页后台请求失败', error);
        sendResponse({ ok: false, error: errorMessage(error) });
      });
    return true;
  }
  if (!newTabRequest(message)) return false;
  if (message.type === 'new-tab-daily-review-wallpaper-read') {
    void dependencies.dailyReview
      .readSnapshot()
      .then((snapshot) => sendResponse({ snapshot }))
      .catch((error) => {
        dependencies.reportFailure('每日回顾状态读取失败', error);
        sendResponse({ error: errorMessage(error) });
      });
    return true;
  }
  if (message.type === 'new-tab-daily-review-wallpaper-generate') {
    const task = dependencies.dailyReview.start({
      trigger: 'manual',
      force: true,
      ...(message.plan ? { plan: message.plan } : {}),
    });
    sendResponse({ started: task.started });
    void task.operation.catch((error) =>
      dependencies.reportFailure('每日回顾手动生成失败', error),
    );
    return true;
  }
  void dependencies.service
    .handle(message, sender)
    .then(sendResponse)
    .catch((error) => {
      dependencies.reportFailure('新标签页后台请求失败', error);
      sendResponse({ error: errorMessage(error) });
    });
  return true;
}
