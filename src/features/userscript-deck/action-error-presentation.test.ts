import { describe, expect, it } from 'vitest';

import type { InstalledUserscript } from '../../userscript/domain/types';
import { actionsFor } from './actions';
import { userscriptDeckActionNotice } from './deck-view';

function failedScript(error: string, instanceId: string | null = null) {
  return {
    kind: 'userscript',
    id: 'failed-script',
    manager: { enabled: true },
    runtime: {
      instanceId,
      status: 'error',
      error,
      commands: [
        {
          id: 'stale-command',
          title: '不应继续显示',
          description: '运行失败后留下的旧指令',
        },
      ],
    },
  } as unknown as InstalledUserscript;
}

describe('failed Userscript action presentation', () => {
  it('withholds historical command rings when no live instance exists', () => {
    const actions = actionsFor(failedScript('command failed'));

    expect(actions.some((action) => action.kind === 'command')).toBe(false);
    expect(actions.some((action) => action.kind === 'manage')).toBe(true);
    expect(actions.some((action) => action.kind === 'toggle')).toBe(true);
  });

  it('keeps commands from a connected instance even when that instance reports an error', () => {
    const actions = actionsFor(failedScript('command failed', 'instance-1'));

    expect(actions.some((action) => action.kind === 'command')).toBe(true);
  });

  it('shows the complete runtime error in the passive center notice', () => {
    const error = 'command failed\nstack line one\nstack line two';

    expect(userscriptDeckActionNotice(failedScript(error))).toMatchObject({
      title: '脚本执行异常',
      description: error,
      tone: 'error',
    });
  });
});
