export function normalizeAdguardMessage(message: unknown, handlerName: string) {
  if (
    !message ||
    typeof message !== 'object' ||
    !('handlerName' in message) ||
    message.handlerName !== handlerName ||
    !('type' in message) ||
    !('payload' in message)
  ) {
    return message;
  }
  return {
    handlerName: message.handlerName,
    type: message.type,
    payload: message.payload,
  };
}
