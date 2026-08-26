import { describe, expect, it } from 'vitest';

import { normalizeSafariDnrUpdate } from './safari-dnr-compat';

function rule(
  value: Partial<chrome.declarativeNetRequest.Rule> & {
    id: number;
  },
) {
  return {
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: '*' },
    ...value,
  } as chrome.declarativeNetRequest.Rule;
}

describe('Safari DNR compatibility', () => {
  it('drops rule structures Safari does not support', () => {
    const update = normalizeSafariDnrUpdate({
      addRules: [
        rule({
          id: 1,
          action: {
            type: 'modifyHeaders',
            responseHeaders: [{ header: 'server', operation: 'remove' }],
          },
        }),
        rule({
          id: 2,
          condition: {
            urlFilter: '*',
            tabIds: [3],
          },
        }),
        rule({
          id: 3,
          condition: {
            urlFilter: '*',
            resourceTypes: ['object'],
          },
        }),
        rule({ id: 4 }),
      ],
      removeRuleIds: [9],
    });

    expect(update.addRules?.map(({ id }) => id)).toEqual([4]);
    expect(update.removeRuleIds).toEqual([9]);
  });

  it('normalizes Safari domain fields and removes object resource types', () => {
    const normalized =
      normalizeSafariDnrUpdate({
        addRules: [
          rule({
            id: 5,
            action: {
              type: 'redirect',
              redirect: { regexSubstitution: 'https://example.com/$1' },
            },
            condition: {
              regexFilter: '(.*)',
              requestDomains: ['example.com'],
              resourceTypes: ['script', 'object'],
              excludedResourceTypes: ['object'],
            },
          }),
          rule({
            id: 6,
            condition: {
              urlFilter: '*',
              initiatorDomains: ['origin.example'],
              excludedInitiatorDomains: ['excluded.example'],
            },
          }),
        ],
      }).addRules ?? [];
    const redirectCondition = normalized[0]?.condition as
      | (chrome.declarativeNetRequest.RuleCondition & {
          domains?: string[];
        })
      | undefined;
    const blockCondition = normalized[1]?.condition as
      | (chrome.declarativeNetRequest.RuleCondition & {
          domains?: string[];
          excludedDomains?: string[];
        })
      | undefined;

    expect(redirectCondition).toMatchObject({
      domains: ['example.com'],
      resourceTypes: ['script'],
    });
    expect(redirectCondition).not.toHaveProperty('requestDomains');
    expect(redirectCondition).not.toHaveProperty('excludedResourceTypes');
    expect(blockCondition).toMatchObject({
      domains: ['origin.example'],
      excludedDomains: ['excluded.example'],
    });
    expect(blockCondition).not.toHaveProperty('initiatorDomains');
    expect(blockCondition).not.toHaveProperty('excludedInitiatorDomains');
  });
});
