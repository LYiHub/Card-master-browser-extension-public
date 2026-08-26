export async function readResponseBytesWithinLimit(
  response: Response,
  maxBytes: number,
  tooLargeMessage: string,
  onProgress?: (loaded: number, total: number | null) => void,
) {
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength =
    contentLengthHeader === null || contentLengthHeader.trim() === ''
      ? Number.NaN
      : Number(contentLengthHeader);
  const total =
    Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null;
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(tooLargeMessage);
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error(tooLargeMessage);
    }
    onProgress?.(bytes.byteLength, total);
    return bytes;
  }
  const reader = response.body.getReader();
  let byteLength = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new Error(tooLargeMessage);
      }
      chunks.push(value);
      onProgress?.(byteLength, total);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    reader.releaseLock();
  }
}

export async function readResponseTextWithinLimit(
  response: Response,
  maxBytes: number,
  tooLargeMessage: string,
) {
  return new TextDecoder().decode(
    await readResponseBytesWithinLimit(response, maxBytes, tooLargeMessage),
  );
}
