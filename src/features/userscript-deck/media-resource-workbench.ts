import { t } from '../../localization/messages';
import type {
  MediaResource,
  MediaResourceKind,
} from '../../media-resources/domain/types';

export type MediaResourceGroup = {
  id: 'manifest' | 'video' | 'audio' | 'image' | 'subtitle' | 'other';
  label: string;
  resources: MediaResource[];
};

const RESOURCE_GROUPS: readonly {
  id: MediaResourceGroup['id'];
  label: string;
  kinds: readonly MediaResourceKind[];
}[] = [
  {
    id: 'manifest',
    get label() {
      return t('cm_media_resource_workbench_label_1');
    },
    kinds: ['hls', 'dash'],
  },
  {
    id: 'video',
    get label() {
      return t('cm_media_resource_workbench_label_2');
    },
    kinds: ['video'],
  },
  {
    id: 'audio',
    get label() {
      return t('cm_media_resource_workbench_label_3');
    },
    kinds: ['audio'],
  },
  {
    id: 'image',
    get label() {
      return t('cm_media_resource_workbench_label_4');
    },
    kinds: ['image'],
  },
  {
    id: 'subtitle',
    get label() {
      return t('cm_media_resource_workbench_label_5');
    },
    kinds: ['subtitle'],
  },
  {
    id: 'other',
    get label() {
      return t('cm_media_resource_workbench_label_6');
    },
    kinds: ['media'],
  },
];

function kindPriority(kind: MediaResourceKind) {
  switch (kind) {
    case 'hls':
    case 'dash':
      return 5;
    case 'video':
      return 4;
    case 'media':
      return 3;
    case 'audio':
      return 2;
    case 'image':
      return 2;
    case 'subtitle':
      return 1;
  }
}

export function compareMediaResources(
  left: MediaResource,
  right: MediaResource,
) {
  const kindDifference = kindPriority(right.kind) - kindPriority(left.kind);
  if (kindDifference !== 0) return kindDifference;
  const sizeDifference = (right.size ?? -1) - (left.size ?? -1);
  if (sizeDifference !== 0) return sizeDifference;
  const timeDifference = right.discoveredAt - left.discoveredAt;
  if (timeDifference !== 0) return timeDifference;
  return left.fileName.localeCompare(right.fileName);
}

export function recommendedMediaResource(resources: readonly MediaResource[]) {
  return resources.slice().sort(compareMediaResources)[0] ?? null;
}

export function groupMediaResources(
  resources: readonly MediaResource[],
): MediaResourceGroup[] {
  return RESOURCE_GROUPS.flatMap((definition) => {
    const grouped = resources
      .filter((resource) => definition.kinds.includes(resource.kind))
      .sort(compareMediaResources);
    return grouped.length > 0
      ? [{ id: definition.id, label: definition.label, resources: grouped }]
      : [];
  });
}

export function reconcileSelectedResourceIds(
  selectedIds: readonly string[],
  resources: readonly MediaResource[],
) {
  const availableIds = new Set(resources.map((resource) => resource.id));
  const retained = selectedIds.filter((id) => availableIds.has(id));
  if (retained.length > 0) return retained;
  const recommended = recommendedMediaResource(resources);
  return recommended ? [recommended.id] : [];
}
