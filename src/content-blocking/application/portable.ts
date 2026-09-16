import {
  CONTENT_BLOCKER_FIRST_CUSTOM_FILTER_ID,
  type ContentBlockingState,
} from '../domain/types';
import { parseContentBlockingState } from './repository';

export function portableContentBlocking(state: ContentBlockingState) {
  return {
    ...state,
    subscriptions: state.subscriptions.map(({ url, name, enabled }) => ({
      url,
      name,
      enabled,
    })),
  };
}

export function parsePortableContentBlocking(
  value: unknown,
): ContentBlockingState {
  if (
    !value ||
    typeof value !== 'object' ||
    !('subscriptions' in value) ||
    !Array.isArray(value.subscriptions)
  ) {
    throw new Error('内容拦截同步配置无效。');
  }
  const subscriptions = value.subscriptions.map(
    (entry: unknown, index: number) => {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Object.keys(entry).sort().join(',') !== 'enabled,name,url'
      )
        throw new Error('过滤订阅配置无效。');
      return {
        ...entry,
        id: `sync-${index}`,
        filterId: CONTENT_BLOCKER_FIRST_CUSTOM_FILTER_ID + index,
        content: '',
        ruleCount: 0,
        rejectedRuleCount: 0,
      };
    },
  );
  const state = parseContentBlockingState({ ...value, subscriptions });
  if (
    !state ||
    new Set(state.subscriptions.map((item) => item.url)).size !==
      state.subscriptions.length
  )
    throw new Error('内容拦截同步配置无效。');
  return state;
}
