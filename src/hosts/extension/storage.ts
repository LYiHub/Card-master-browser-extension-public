import type { StringStorage } from '../../userscript/application/script-repository';
import type { ExtensionStorageArea } from './api';

export class ExtensionStringStorage implements StringStorage {
  constructor(private readonly area: ExtensionStorageArea) {}

  async getItem(key: string) {
    const value = (await this.area.get(key))[key];
    return typeof value === 'string' ? value : null;
  }

  async setItem(key: string, value: string) {
    await this.area.set({ [key]: value });
  }
}
