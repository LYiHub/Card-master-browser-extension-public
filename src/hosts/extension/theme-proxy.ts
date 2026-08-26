import '../../../vendor/darkreader/src/inject/dynamic-theme/mv3-proxy';
import {
  ensureHistoryLocationMethodsWritable,
  installHistoryLocationMonitor,
} from './page-location';
import { claimPageRuntime } from './page-runtime-ownership';

const URL_CHANGE_EVENT = 'card-master:url-change';
const navigation = (
  window as typeof window & {
    navigation?: {
      addEventListener(type: string, listener: EventListener): void;
      removeEventListener(type: string, listener: EventListener): void;
    };
  }
).navigation;

let previousUrl = location.href;
let queued = false;
let releaseOwnership = () => {};
let restoreHistory = () => {};

const notify = () => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    const url = location.href;
    if (url === previousUrl) return;
    const oldURL = previousUrl;
    previousUrl = url;
    document.dispatchEvent(
      new CustomEvent(URL_CHANGE_EVENT, {
        detail: { oldURL, url },
      }),
    );
  });
};

function dispose() {
  releaseOwnership();
  restoreHistory();
  removeEventListener('popstate', notify, true);
  removeEventListener('hashchange', notify, true);
  navigation?.removeEventListener('currententrychange', notify);
  navigation?.removeEventListener('navigatesuccess', notify);
}

releaseOwnership = claimPageRuntime('theme-proxy-location', dispose).release;
ensureHistoryLocationMethodsWritable(history);
restoreHistory = installHistoryLocationMonitor(history, notify);
addEventListener('popstate', notify, true);
addEventListener('hashchange', notify, true);
navigation?.addEventListener('currententrychange', notify);
navigation?.addEventListener('navigatesuccess', notify);
