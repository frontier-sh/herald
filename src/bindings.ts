export type Bindings = {
  DB: D1Database;
  AI: Ai;
  CHANGELOG_QUEUE: Queue;
  IMAGE_STORE: R2Bucket;
  IMAGES: ImagesBinding;
  BASE_URL: string;
};
