type DnrUpdate = chrome.declarativeNetRequest.UpdateRuleOptions;
type DnrRule = chrome.declarativeNetRequest.Rule;

type SafariRuleCondition = DnrRule['condition'] & {
  domains?: string[];
  excludedDomains?: string[];
  topDomains?: string[];
  excludedTopDomains?: string[];
  requestHeaders?: unknown[];
  responseHeaders?: unknown[];
};

function withoutObjectResourceType(
  values: SafariRuleCondition['resourceTypes'],
) {
  if (!values?.some((value) => value === 'object')) return values;
  const supported = values.filter((value) => value !== 'object');
  return supported.length > 0 ? supported : null;
}

function normalizeRule(rule: DnrRule): DnrRule | null {
  const normalized = structuredClone(rule);
  if (normalized.action.type === 'modifyHeaders') return null;

  const condition = normalized.condition as SafariRuleCondition;
  if (
    condition.tabIds ||
    condition.requestHeaders ||
    condition.responseHeaders ||
    condition.topDomains ||
    condition.excludedTopDomains
  ) {
    return null;
  }

  const resourceTypes = withoutObjectResourceType(condition.resourceTypes);
  if (resourceTypes === null) return null;
  if (resourceTypes !== condition.resourceTypes) {
    condition.resourceTypes = resourceTypes;
  }

  const excludedResourceTypes = withoutObjectResourceType(
    condition.excludedResourceTypes,
  );
  if (excludedResourceTypes === null) {
    delete condition.excludedResourceTypes;
  } else if (excludedResourceTypes !== condition.excludedResourceTypes) {
    condition.excludedResourceTypes = excludedResourceTypes;
  }

  if (
    normalized.action.redirect?.regexSubstitution &&
    condition.requestDomains
  ) {
    condition.domains = condition.requestDomains;
    delete condition.requestDomains;
    return normalized;
  }
  if (condition.initiatorDomains) {
    condition.domains = condition.initiatorDomains;
    delete condition.initiatorDomains;
  }
  if (condition.excludedInitiatorDomains) {
    condition.excludedDomains = condition.excludedInitiatorDomains;
    delete condition.excludedInitiatorDomains;
  }

  return normalized;
}

export function normalizeSafariDnrUpdate(update: DnrUpdate): DnrUpdate {
  const addRules = update.addRules
    ?.map(normalizeRule)
    .filter((rule): rule is DnrRule => rule !== null);
  return {
    ...(addRules && addRules.length > 0 ? { addRules } : {}),
    ...(update.removeRuleIds?.length
      ? { removeRuleIds: [...update.removeRuleIds] }
      : {}),
  };
}
