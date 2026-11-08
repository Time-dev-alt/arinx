/**
 * Magic-byte validation for uploads.
 *
 * Extensions and `Content-Type` are caller-supplied and trivially forged. This
 * is the client-side half of the platform's defence (the database trigger in
 * `0012_enterprise_constraints.sql` is the authoritative server-side half).
 */

export type UploadBucket = "videos" | "thumbnails" | "channel-art";

export type DetectedFormat = "mp4" | "webm" | "jpeg" | "png" | "webp" | "unknown";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBM = [0x1a, 0x45, 0xdf, 0xa3];

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let out = "";
  for (let i = from; i < to && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

export function detectFormat(bytes: Uint8Array): DetectedFormat {
  if (bytes.length < 12) return "unknown";
  // ISO base media file format: ....ftyp<brand>
  if (ascii(bytes, 4, 8) === "ftyp") return "mp4";
  if (startsWith(bytes, WEBM)) return "webm";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (startsWith(bytes, PNG)) return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  return "unknown";
}

const ALLOWED_FORMATS: Record<UploadBucket, readonly DetectedFormat[]> = {
  videos: ["mp4", "webm"],
  thumbnails: ["jpeg", "png", "webp"],
  "channel-art": ["jpeg", "png", "webp"],
};

/** Extension → the container that must actually be present in the bytes. */
const EXT_FORMAT: Record<string, DetectedFormat> = {
  mp4: "mp4",
  m4v: "mp4",
  mov: "mp4",
  webm: "webm",
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
};

export function validateFileSignature(
  bytes: Uint8Array,
  bucket: UploadBucket,
  ext: string,
): { ok: boolean; detected: DetectedFormat; reason?: string } {
  const detected = detectFormat(bytes);
  if (detected === "unknown") {
    return { ok: false, detected, reason: "Unrecognised file signature" };
  }
  if (!ALLOWED_FORMATS[bucket].includes(detected)) {
    return { ok: false, detected, reason: "File type not allowed for this bucket" };
  }
  const expected = EXT_FORMAT[ext.toLowerCase()];
  if (!expected || expected !== detected) {
    return { ok: false, detected, reason: "File extension does not match its contents" };
  }
  return { ok: true, detected };
}

async function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  // jsdom and older embedded webviews only expose FileReader.
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file header"));
    reader.readAsArrayBuffer(blob);
  });
}

/** Read just the header; never load a multi-GB video into memory. */
export async function readSignature(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blobBytes(file.slice(0, 32)));
}

/** MIME types the storage layer is allowed to record for each bucket. */
const ALLOWED_MIME: Record<UploadBucket, readonly string[]> = {
  videos: ["video/mp4", "video/webm", "video/quicktime", "video/x-m4v", ""],
  thumbnails: ["image/jpeg", "image/png", "image/webp", ""],
  "channel-art": ["image/jpeg", "image/png", "image/webp", ""],
};

export function validateMime(mime: string, bucket: UploadBucket): boolean {
  return ALLOWED_MIME[bucket].includes((mime ?? "").toLowerCase());
}
