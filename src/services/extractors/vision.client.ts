import type { VisionClient } from './image.extractor.js';

export interface VisionClientConfig {
  serviceAccountKey: string | object;
}

export async function createVisionClient(config: VisionClientConfig): Promise<VisionClient> {
  // @ts-expect-error — optional peer dependency, resolved at runtime
  const { ImageAnnotatorClient } = await import('@google-cloud/vision');

  const credentials = typeof config.serviceAccountKey === 'string'
    ? JSON.parse(config.serviceAccountKey)
    : config.serviceAccountKey;

  const client = new ImageAnnotatorClient({ credentials });

  return {
    async detectText(content: Buffer): Promise<string> {
      const [result] = await client.textDetection({ image: { content } });
      const detections = result.textAnnotations ?? [];
      return detections[0]?.description ?? '';
    },
  };
}
