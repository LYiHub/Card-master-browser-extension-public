import type { DeckCard } from '../userscript-deck/cards';

export const GLOBAL_LIBRARY_HOST_ID = 'card-master-library-host';
export const GLOBAL_LIBRARY_ALIVE_ATTRIBUTE = 'data-card-master-library-alive';
export const GLOBAL_LIBRARY_GENERATION_ATTRIBUTE =
  'data-card-master-library-generation';
export const GLOBAL_LIBRARY_OPEN_EVENT = 'card-master:global-library-open';
export const GLOBAL_LIBRARY_DISPOSE_EVENT =
  'card-master:global-library-dispose';
export const GLOBAL_LIBRARY_CLOSING_EVENT =
  'card-master:global-library-closing';

export const GLOBAL_LIBRARY_CLOSED_EVENT = 'card-master:global-library-closed';

export const GLOBAL_LIBRARY_CARD_SETTINGS_REQUEST_EVENT =
  'card-master:global-library-card-settings-request';
export const GLOBAL_LIBRARY_CARD_SETTINGS_CLOSED_EVENT =
  'card-master:global-library-card-settings-closed';

export type GlobalLibraryCardSettingsRequestEvent = CustomEvent<{
  card: DeckCard;
}>;
