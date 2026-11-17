export const UPLOAD_LIMITS = {
  avatar: 2 * 1024 * 1024,
  banner: 5 * 1024 * 1024,
  postMedia: 20 * 1024 * 1024,
} as const;

export function validateUpload(kind: "avatar" | "banner" | "post-media", file: File): string | null {
  if (kind === "avatar") {
    if (!file.type.startsWith("image/")) return "Avatar must be an image.";
    if (file.size > UPLOAD_LIMITS.avatar) return "Avatar must be 2 MB or less.";
  } else if (kind === "banner") {
    if (!file.type.startsWith("image/")) return "Banner must be an image.";
    if (file.size > UPLOAD_LIMITS.banner) return "Banner must be 5 MB or less.";
  } else {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return "Upload must be an image or short video.";
    if (file.size > UPLOAD_LIMITS.postMedia) return "Media must be 20 MB or less.";
  }
  return null;
}
