import { useState } from 'react';
import { UiNotice, UiSegmentedControl } from '../../components/ui/Ui';
import { requireExtensionApi } from '../../hosts/extension/api';
import type { LanguagePreference } from '../../localization/locale';
import { t } from '../../localization/messages';
import { writeLanguagePreference } from '../../localization/preferences';
import { useLocale } from '../../localization/react';

export function LanguageSettings() {
  const { preference } = useLocale();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const change = async (value: LanguagePreference) => {
    setSaving(true);
    setError('');
    try {
      await writeLanguagePreference(requireExtensionApi(), value);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="manager-language-settings" aria-busy={saving}>
      <strong>{t('cm_language_title')}</strong>
      <p>{t('cm_language_description')}</p>
      <UiSegmentedControl
        label={t('cm_language_title')}
        value={preference}
        options={[
          { value: 'auto', label: t('cm_language_auto') },
          { value: 'zh-CN', label: t('cm_language_simplified') },
          { value: 'zh-TW', label: t('cm_language_traditional') },
        ]}
        onChange={(value) => {
          if (!saving) void change(value);
        }}
      />
      {error ? (
        <UiNotice tone="error" title={t('cm_language_title')}>
          {error}
        </UiNotice>
      ) : null}
    </div>
  );
}
