// Image upload, optimization, and storage service using R2 + Cloudflare Images binding

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const MAX_SIZES: Record<string, number> = {
  content: 5 * 1024 * 1024,  // 5 MB
  logo: 2 * 1024 * 1024,     // 2 MB
  favicon: 1 * 1024 * 1024,  // 1 MB
};

export interface UploadResult {
  key: string;
  url: string;
}

export interface UploadError {
  error: string;
}

type Purpose = 'content' | 'logo' | 'favicon';

function validateImage(
  file: File,
  purpose: Purpose,
): UploadError | null {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return { error: `Unsupported image type: ${file.type}. Allowed: JPEG, PNG, GIF, WebP, SVG, ICO.` };
  }

  const maxSize = MAX_SIZES[purpose];
  if (file.size > maxSize) {
    const mb = (maxSize / (1024 * 1024)).toFixed(0);
    return { error: `File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum: ${mb}MB.` };
  }

  return null;
}

async function generateContentKey(buffer: ArrayBuffer, contentType: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = new Uint8Array(hashBuffer);
  const hex = Array.from(hashArray.slice(0, 8))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const ext = RASTER_TYPES.has(contentType) ? 'webp' : ALLOWED_TYPES[contentType];
  return `${hex}.${ext}`;
}

function generateBrandKey(contentType: string, purpose: 'logo' | 'favicon'): string {
  const ext = RASTER_TYPES.has(contentType) ? 'webp' : ALLOWED_TYPES[contentType];
  return `_${purpose}.${ext}`;
}

function arrayBufferToStream(buffer: ArrayBuffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });
}

async function optimizeAndStore(
  images: ImagesBinding,
  bucket: R2Bucket,
  buffer: ArrayBuffer,
  contentType: string,
  key: string,
  maxWidth: number = 1920,
): Promise<void> {
  if (RASTER_TYPES.has(contentType)) {
    const stream = arrayBufferToStream(buffer);
    const result = await images
      .input(stream)
      .transform({ width: maxWidth, fit: 'scale-down' })
      .output({ format: 'image/webp' });
    const response = result.response();
    const optimized = await response.arrayBuffer();
    await bucket.put(key, optimized, {
      httpMetadata: { contentType: 'image/webp' },
    });
  } else {
    await bucket.put(key, buffer, {
      httpMetadata: { contentType },
    });
  }
}

export async function uploadContentImage(
  images: ImagesBinding,
  bucket: R2Bucket,
  file: File,
): Promise<UploadResult | UploadError> {
  const validation = validateImage(file, 'content');
  if (validation) return validation;

  const buffer = await file.arrayBuffer();
  const key = await generateContentKey(buffer, file.type);

  // Check if this exact image already exists (deduplication)
  const existing = await bucket.head(key);
  if (existing) {
    return { key, url: `/images/${key}` };
  }

  await optimizeAndStore(images, bucket, buffer, file.type, key);
  return { key, url: `/images/${key}` };
}

export async function uploadBrandImage(
  images: ImagesBinding,
  bucket: R2Bucket,
  file: File,
  purpose: 'logo' | 'favicon',
  existingKey?: string | null,
): Promise<UploadResult | UploadError> {
  const validation = validateImage(file, purpose);
  if (validation) return validation;

  const buffer = await file.arrayBuffer();
  const key = generateBrandKey(file.type, purpose);

  // Delete old brand image if key differs
  if (existingKey && existingKey !== key) {
    await bucket.delete(existingKey);
  }

  const maxWidth = purpose === 'logo' ? 400 : 64;

  if (purpose === 'favicon' && !RASTER_TYPES.has(file.type)) {
    // Favicons that are ICO/SVG — store as-is
    await bucket.put(key, buffer, {
      httpMetadata: { contentType: file.type },
    });
  } else {
    await optimizeAndStore(images, bucket, buffer, file.type, key, maxWidth);
  }

  return { key, url: `/images/${key}` };
}

export async function deleteImage(
  bucket: R2Bucket,
  key: string,
): Promise<void> {
  await bucket.delete(key);
}
