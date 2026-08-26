export const ADGUARD_BROWSER_API_GLOBAL =
  '__cardMasterAdguardBrowserApi' as const;

export type AdguardScriptInjection = {
  code?: string;
  file?: string;
  frameId?: number;
};

export type AdguardBrowserApi = {
  executeScript(
    tabId: number,
    injection: AdguardScriptInjection,
  ): Promise<void> | undefined;
  getDisabledRuleIds(
    options: chrome.declarativeNetRequest.GetDisabledRuleIdsOptions,
  ): Promise<number[]>;
  getAllFrames(
    details: chrome.webNavigation.GetAllFrameDetails,
  ): Promise<chrome.webNavigation.GetAllFrameResultDetails[] | null>;
  handlerBehaviorChanged(): Promise<void>;
  insertCSS(
    injection: chrome.scripting.CSSInjection,
  ): Promise<void> | undefined;
  updateDynamicRules(
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ): Promise<void>;
  updateSessionRules(
    update: chrome.declarativeNetRequest.UpdateRuleOptions,
  ): Promise<void>;
  updateStaticRules(
    update: chrome.declarativeNetRequest.UpdateStaticRulesOptions,
  ): Promise<void>;
};

export function installAdguardBrowserApi(api: AdguardBrowserApi) {
  const adapter = Object.freeze({
    executeScript: api.executeScript.bind(api),
    getDisabledRuleIds: api.getDisabledRuleIds.bind(api),
    getAllFrames: api.getAllFrames.bind(api),
    handlerBehaviorChanged: api.handlerBehaviorChanged.bind(api),
    insertCSS: api.insertCSS.bind(api),
    updateDynamicRules: api.updateDynamicRules.bind(api),
    updateSessionRules: api.updateSessionRules.bind(api),
    updateStaticRules: api.updateStaticRules.bind(api),
  } satisfies AdguardBrowserApi);
  Object.defineProperty(globalThis, ADGUARD_BROWSER_API_GLOBAL, {
    configurable: true,
    value: adapter,
  });
}
