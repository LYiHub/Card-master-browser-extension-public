import type { ImageGenerationProtocolAdapter } from '../domain/image-generation-protocol';
import type { ImageServiceProtocol } from '../domain/types';
import { dashscopeImagesAdapter } from './dashscope-images-adapter';
import { openaiImagesAdapter } from './openai-images-adapter';

export const IMAGE_GENERATION_PROTOCOL_ADAPTERS: readonly ImageGenerationProtocolAdapter[] =
  [openaiImagesAdapter, dashscopeImagesAdapter];

const ADAPTERS_BY_PROTOCOL = new Map<
  ImageServiceProtocol,
  ImageGenerationProtocolAdapter
>(
  IMAGE_GENERATION_PROTOCOL_ADAPTERS.map((adapter) => [
    adapter.protocol,
    adapter,
  ]),
);

export function getImageGenerationAdapter(
  protocol: ImageServiceProtocol,
): ImageGenerationProtocolAdapter {
  const adapter = ADAPTERS_BY_PROTOCOL.get(protocol);
  if (!adapter) {
    throw new Error(`不支持的图像生成协议：${protocol}`);
  }
  return adapter;
}
