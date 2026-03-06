const mockTextDetection = jest.fn();

jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn().mockImplementation(() => ({
    textDetection: mockTextDetection,
  })),
}), { virtual: true });

import { createVisionClient } from './vision.client.js';

describe('createVisionClient', () => {
  const config = {
    serviceAccountKey: JSON.stringify({ project_id: 'test-project' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call textDetection with buffer content', async () => {
    mockTextDetection.mockResolvedValue([{
      textAnnotations: [{ description: 'Hello World' }],
    }]);

    const client = createVisionClient(config);
    const result = await client.detectText(Buffer.from('image data'));

    expect(mockTextDetection).toHaveBeenCalledWith({
      image: { content: Buffer.from('image data') },
    });
    expect(result).toBe('Hello World');
  });

  it('should return empty string when no annotations', async () => {
    mockTextDetection.mockResolvedValue([{ textAnnotations: [] }]);

    const client = createVisionClient(config);
    const result = await client.detectText(Buffer.from('image data'));

    expect(result).toBe('');
  });

  it('should accept object serviceAccountKey', async () => {
    mockTextDetection.mockResolvedValue([{
      textAnnotations: [{ description: 'text' }],
    }]);

    const client = createVisionClient({
      serviceAccountKey: { project_id: 'test' },
    });
    const result = await client.detectText(Buffer.from('data'));

    expect(result).toBe('text');
  });
});
