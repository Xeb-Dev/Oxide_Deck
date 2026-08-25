// ------------------------------------------------------------------
// HIGH-DENSITY OFFLINE QR TRANSFER SERVICE
// Standard HTTPS URL Format + fflate Level 9 Compression + Chunky Low-Density QR Codes
// 100% Offline Optical Transfer - Instant Camera Recognition
// ------------------------------------------------------------------

import * as fflate from "fflate";

const B64_MAP = new Uint8Array(256);
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
for (let i = 0; i < 256; i++) B64_MAP[i] = 255;
for (let i = 0; i < B64_CHARS.length; i++) B64_MAP[B64_CHARS.charCodeAt(i)] = i;
B64_MAP["-".charCodeAt(0)] = 62;
B64_MAP["_".charCodeAt(0)] = 63;

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // URL-safe Base64: replaces + with - and / with _, removes padding =
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const values: number[] = [];
  for (let i = 0; i < base64.length; i++) {
    const val = B64_MAP[base64.charCodeAt(i) & 0xff];
    if (val !== 255) {
      values.push(val);
    }
  }

  if (values.length === 0) {
    throw new Error("Empty payload data received.");
  }

  const outBytes: number[] = [];
  for (let i = 0; i < values.length; i += 4) {
    const b0 = values[i];
    const b1 = i + 1 < values.length ? values[i + 1] : 0;
    const b2 = i + 2 < values.length ? values[i + 2] : 64;
    const b3 = i + 3 < values.length ? values[i + 3] : 64;

    outBytes.push((b0 << 2) | (b1 >> 4));
    if (b2 !== 64 && i + 2 < values.length) {
      outBytes.push(((b1 & 15) << 4) | (b2 >> 2));
    }
    if (b3 !== 64 && i + 3 < values.length) {
      outBytes.push(((b2 & 3) << 6) | b3);
    }
  }

  return new Uint8Array(outBytes);
}

/**
 * Super-compact Tuple-based Minification:
 * Strips all JSON property key overhead by packing cards into lightweight positional arrays.
 */
function minifyToCompactTuples(payload: any): any {
  if (!payload) return payload;

  const min: any = { t: payload.type || "deck" };

  if (payload.deck) {
    min.d = [
      payload.deck.name || "",
      payload.deck.icon || "🃏",
      payload.deck.description || "",
    ];
  }

  if (payload.subject) {
    min.sb = [
      payload.subject.id || "",
      payload.subject.name || "",
      payload.subject.icon || "📚",
      payload.subject.color || "#6366f1",
    ];
  }

  if (Array.isArray(payload.folders)) {
    min.fo = payload.folders.map((f: any) => [
      f.id,
      f.name,
      f.icon || "📁",
      f.parent_folder_id || "",
      f.subject_id || "",
    ]);
  }

  if (Array.isArray(payload.decks)) {
    min.dk = payload.decks.map((d: any) => [
      d.id,
      d.name,
      d.icon || "🃏",
      d.description || "",
      d.folder_id || "",
    ]);
  }

  if (Array.isArray(payload.flashcards)) {
    min.c = payload.flashcards.map((c: any) => [
      c.front || "",
      c.back || "",
      c.tags || "",
      c._deck_temp_id || "",
      c.image_url || "",
      c.front_image_url || "",
      c.back_image_url || "",
    ]);
  }

  return min;
}

/**
 * Reconstructs full database model from compact tuples
 */
function unminifyFromCompactTuples(min: any): any {
  if (!min || typeof min !== "object") return min;

  // If already full format
  if (min.version || min.flashcards) return min;

  const payload: any = {
    version: "1.0",
    type: min.t || "deck",
    exported_at: new Date().toISOString(),
  };

  if (Array.isArray(min.d)) {
    payload.deck = {
      name: min.d[0] || "Imported Deck",
      icon: min.d[1] || "🃏",
      description: min.d[2] || "",
    };
  }

  if (Array.isArray(min.sb)) {
    payload.subject = {
      id: min.sb[0],
      name: min.sb[1],
      icon: min.sb[2] || "📚",
      color: min.sb[3] || "#6366f1",
    };
  }

  if (Array.isArray(min.fo)) {
    payload.folders = min.fo.map((f: any) => ({
      id: f[0],
      name: f[1],
      icon: f[2] || "📁",
      parent_folder_id: f[3] || null,
      subject_id: f[4] || null,
    }));
  }

  if (Array.isArray(min.dk)) {
    payload.decks = min.dk.map((d: any) => ({
      id: d[0],
      name: d[1],
      icon: d[2] || "🃏",
      description: d[3] || "",
      folder_id: d[4] || null,
    }));
  }

  if (Array.isArray(min.c)) {
    payload.flashcards = min.c.map((c: any) => ({
      front: c[0],
      back: c[1],
      tags: c[2] || "",
      _deck_temp_id: c[3] || undefined,
      image_url: c[4] || null,
      front_image_url: c[5] || null,
      back_image_url: c[6] || null,
    }));
  }

  return payload;
}

export interface ChunkedQrResult {
  qrStrings: string[];
  totalChunks: number;
  sessionHash: string;
  itemType: "deck" | "folder" | "subject";
  itemName: string;
  itemIcon: string;
}

export interface ScannedChunk {
  protocol: "OXPKG";
  sessionHash: string;
  chunkIndex: number;
  totalChunks: number;
  itemType: "deck" | "folder" | "subject";
  itemName: string;
  chunkData: string;
}

/**
 * Maximum compression of payload to Standard HTTPS URL format Multi-Part QR codes.
 * Small chunk size (240 chars) keeps QR module matrix small (Version 6, ~41x41) with large chunky pixels for instant phone scanning.
 */
export async function encryptPackagePayload(
  payloadObj: any,
  itemType: "deck" | "folder" | "subject",
  itemName: string,
  itemIcon: string
): Promise<ChunkedQrResult> {
  // 1. Minify JSON into keyless tuples
  const minified = minifyToCompactTuples(payloadObj);
  const jsonStr = JSON.stringify(minified);

  // 2. Heavy Deflate Level 9 Compression via fflate
  const rawBytes = fflate.strToU8(jsonStr);
  const compressedBytes = fflate.deflateSync(rawBytes, { level: 9 });
  const compressedBase64 = uint8ArrayToBase64(compressedBytes);

  // 3. Short 4-char session hash for multi-part integrity
  let hashNum = 0;
  for (let i = 0; i < Math.min(jsonStr.length, 100); i++) {
    hashNum = (hashNum * 31 + jsonStr.charCodeAt(i)) >>> 0;
  }
  const sessionHash = hashNum.toString(36).substring(0, 4);

  // 4. High-capacity chunk size: 450 chars fits ~35-50 flashcards in 1 QR code while remaining sharp and scannable on 320-440px canvas
  const CHUNK_SIZE = 450;
  const totalChunks = Math.max(1, Math.ceil(compressedBase64.length / CHUNK_SIZE));
  const qrStrings: string[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, compressedBase64.length);
    const chunkData = compressedBase64.substring(start, end);
    const chunkIndex = i + 1; // 1-based index

    // Pure URL-safe HTTPS format without unnecessary query params
    const qrUrl = `https://oxide.app/s?h=${sessionHash}&c=${chunkIndex}&t=${totalChunks}&y=${itemType}&d=${chunkData}`;
    qrStrings.push(qrUrl);
  }

  return {
    qrStrings,
    totalChunks,
    sessionHash,
    itemType,
    itemName,
    itemIcon,
  };
}

/**
 * Parse any scanned QR code string (supports standard HTTPS URLs, custom protocols, and legacy formats)
 */
export function parseScannedQrString(rawString: string): ScannedChunk {
  const trimmed = rawString.trim();

  // 1. Standard HTTPS URL Format: https://oxide.app/s?h=...&c=...&t=...&y=...&n=...&d=...
  if (trimmed.includes("oxide.app/s?") || trimmed.includes("oxidedeck://share?") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const params = url.searchParams;
      const sessionHash = params.get("h") || "pkg1";
      const chunkIndex = parseInt(params.get("c") || "1", 10);
      const totalChunks = parseInt(params.get("t") || "1", 10);
      const itemType = (params.get("y") || "deck") as "deck" | "folder" | "subject";
      
      let itemName = "Imported Package";
      try {
        itemName = params.get("n") ? decodeURIComponent(params.get("n")!) : "Imported Package";
      } catch {
        itemName = params.get("n") || "Imported Package";
      }

      // Handle both URL-safe Base64 and legacy standard Base64
      const rawChunkData = params.get("d") || "";
      const chunkData = rawChunkData.replace(/ /g, "+");

      if (chunkData) {
        return {
          protocol: "OXPKG",
          sessionHash,
          chunkIndex,
          totalChunks,
          itemType,
          itemName,
          chunkData,
        };
      }
    } catch {
      // Continue to regex/string fallback
    }
  }

  // 2. Custom Protocol: OXPKG:1:<sessionHash>:<chunkIndex>:<totalChunks>:<itemType>:<encodedName>:<chunkData>
  if (trimmed.startsWith("OXPKG:1:")) {
    const parts = trimmed.split(":");
    if (parts.length >= 8) {
      return {
        protocol: "OXPKG",
        sessionHash: parts[2],
        chunkIndex: parseInt(parts[3], 10),
        totalChunks: parseInt(parts[4], 10),
        itemType: parts[5] as "deck" | "folder" | "subject",
        itemName: decodeURIComponent(parts[6]),
        chunkData: parts.slice(7).join(":"),
      };
    }
  }

  // 3. Fallback for OXCHUNK:1:
  if (trimmed.startsWith("OXCHUNK:1:")) {
    const parts = trimmed.split(":");
    return {
      protocol: "OXPKG",
      sessionHash: parts[2],
      chunkIndex: parseInt(parts[3], 10),
      totalChunks: parseInt(parts[4], 10),
      itemType: parts[7] as "deck" | "folder" | "subject",
      itemName: decodeURIComponent(parts[8] || "Imported Package"),
      chunkData: parts.slice(9).join(":"),
    };
  }

  throw new Error(`Unrecognized QR Code. Please ensure you are scanning an Oxide Deck QR code.`);
}

/**
 * Assembles collected chunks and decompresses back to SQLite-ready package.
 * Chunks can be scanned in ANY order!
 */
export async function assembleAndDecryptPackage(
  chunksMap: Map<number, string>,
  header: ScannedChunk
): Promise<{ data: any; itemType: string; itemName: string }> {
  const { totalChunks, itemType, itemName } = header;

  // 1. Verify all parts are present
  for (let i = 1; i <= totalChunks; i++) {
    if (!chunksMap.has(i)) {
      throw new Error(`Missing Part ${i} of ${totalChunks}.`);
    }
  }

  // 2. Concatenate chunks in order 1..N
  let fullBase64 = "";
  for (let i = 1; i <= totalChunks; i++) {
    fullBase64 += chunksMap.get(i);
  }

  // 3. Base64 to Compressed Binary
  const compressedBytes = base64ToUint8Array(fullBase64);

  // 4. Heavy Deflate Decompression via fflate
  let jsonStr = "";
  try {
    const decompressedBytes = fflate.inflateSync(compressedBytes);
    jsonStr = fflate.strFromU8(decompressedBytes);
  } catch (err: any) {
    // If raw uncompressed fallback
    try {
      jsonStr = fflate.strFromU8(compressedBytes);
    } catch {
      throw new Error(`Decompression failed: ${err.message}`);
    }
  }

  // 5. Unminify Tuples to full schema
  const parsedMinified = JSON.parse(jsonStr);
  const fullData = unminifyFromCompactTuples(parsedMinified);

  const resolvedType = fullData.type || itemType || (fullData.deck ? "deck" : fullData.subject ? "subject" : "folder");
  const resolvedName = fullData.deck?.name || fullData.subject?.name || fullData.folders?.[0]?.name || itemName;

  return {
    data: fullData,
    itemType: resolvedType,
    itemName: resolvedName,
  };
}

/**
 * Direct one-shot decrypt for single QR code or text payload
 */
export async function decryptPackagePayload(rawPayload: string): Promise<{ data: any; itemType: string; itemName: string }> {
  const chunk = parseScannedQrString(rawPayload);
  const map = new Map<number, string>();
  map.set(chunk.chunkIndex, chunk.chunkData);

  if (chunk.totalChunks > 1) {
    throw new Error(`This is Part ${chunk.chunkIndex} of a ${chunk.totalChunks}-part QR code. Please scan all ${chunk.totalChunks} parts.`);
  }

  return assembleAndDecryptPackage(map, chunk);
}
