import simplified from '../locales/zh_CN/messages.json';
import traditional from '../locales/zh_TW/messages.json';
import { createMessageReader, type Substitutions } from './format';
import { getLocale } from './locale';

export type MessageKey = keyof typeof simplified;
const readers = {
  'zh-CN': createMessageReader(simplified),
  'zh-TW': createMessageReader(traditional, simplified),
};

export function t(key: MessageKey, substitutions?: Substitutions): string {
  return readers[getLocale()](key, substitutions);
}
