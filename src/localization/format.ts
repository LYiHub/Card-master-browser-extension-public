export type Message = {
  message: string;
  description?: string;
  placeholders?: Record<string, { content: string; example?: string }>;
};
export type MessageCatalog = Record<string, Message>;
export type Substitutions = string | readonly (string | number)[];

export function formatMessage(
  message: Message,
  substitutions: Substitutions = [],
) {
  const values =
    typeof substitutions === 'string' ? [substitutions] : substitutions;
  const placeholders = Object.fromEntries(
    Object.entries(message.placeholders ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value.content,
    ]),
  );
  const positions = (value: string) =>
    value.replace(/\$\$|\$(\d+)/g, (token, index: string | undefined) =>
      token === '$$' ? '$' : String(values[Number(index) - 1] ?? ''),
    );
  return message.message.replace(
    /\$\$|\$(\d+)|\$([a-z0-9_]+)\$/gi,
    (token, index: string | undefined, name: string | undefined) => {
      if (token === '$$') return '$';
      if (index) return String(values[Number(index) - 1] ?? '');
      return positions(placeholders[name?.toLowerCase() ?? ''] ?? '');
    },
  );
}

export function createMessageReader(
  catalog: MessageCatalog,
  fallback: MessageCatalog = {},
) {
  const messages = new Map(
    Object.entries({ ...fallback, ...catalog }).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );
  return (key: string, substitutions?: Substitutions) => {
    const message = messages.get(key.toLowerCase());
    return message ? formatMessage(message, substitutions) : key;
  };
}
