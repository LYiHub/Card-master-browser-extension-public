import type { ExtensionBackgroundApi } from './api';

export async function configureExtensionStorageAccess(
  storage: ExtensionBackgroundApi['storage'],
) {
  const operations: Promise<void>[] = [];
  if (typeof storage.local.setAccessLevel === 'function') {
    operations.push(
      storage.local.setAccessLevel({
        accessLevel: 'TRUSTED_CONTEXTS',
      }),
    );
  }
  if (typeof storage.session.setAccessLevel === 'function') {
    operations.push(
      storage.session.setAccessLevel({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
      }),
    );
  }
  await Promise.all(operations);
}
