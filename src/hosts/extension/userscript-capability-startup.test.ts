import { describe, expect, it } from 'vitest';

import type { ExtensionBackgroundApi } from './api';
import { UserscriptCapabilityService } from './userscript-capability-service';

describe('UserscriptCapabilityService startup', () => {
  it('does not crash when optional browser event APIs are absent', () => {
    expect(
      () =>
        new UserscriptCapabilityService(
          {} as unknown as ExtensionBackgroundApi,
        ),
    ).not.toThrow();
  });
});
