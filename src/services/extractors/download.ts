/**
 * Download a file from a signed HTTPS URL.
 * Works with any signed URL provider (GCS, S3, Azure, etc.).
 */
export async function downloadFile(fileUrl: string): Promise<Buffer> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
