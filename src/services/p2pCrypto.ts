// ------------------------------------------------------------------
// P2P CRYPTO SERVICE - AES-256-GCM End-to-End Encryption
// ------------------------------------------------------------------

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

export interface EncryptedSharePayload {
  version: "1.0";
  protocol: "OXSHARE";
  keyHex: string;
  ivHex: string;
  ciphertextBase64: string;
  itemType: "deck" | "folder" | "subject";
  itemName: string;
  itemIcon: string;
}

/**
 * Encrypt a JS object payload (deck, folder, or subject) using AES-256-GCM
 */
export async function encryptPackagePayload(
  payloadObj: any,
  itemType: "deck" | "folder" | "subject",
  itemName: string,
  itemIcon: string
): Promise<{ qrString: string; payloadStruct: EncryptedSharePayload }> {
  const jsonStr = JSON.stringify(payloadObj);
  const textEncoder = new TextEncoder();
  const plainBytes = textEncoder.encode(jsonStr);

  // Generate 256-bit AES-GCM Key
  const cryptoKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // Export Key to raw bytes
  const rawKeyBuf = await window.crypto.subtle.exportKey("raw", cryptoKey);
  const keyHex = bufToHex(rawKeyBuf);

  // Generate 12-byte IV
  const ivBytes = window.crypto.getRandomValues(new Uint8Array(12));
  const ivHex = bufToHex(ivBytes.buffer);

  // Encrypt with AES-GCM
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    cryptoKey,
    plainBytes
  );

  const ciphertextBase64 = arrayBufferToBase64(cipherBuffer);

  const payloadStruct: EncryptedSharePayload = {
    version: "1.0",
    protocol: "OXSHARE",
    keyHex,
    ivHex,
    ciphertextBase64,
    itemType,
    itemName,
    itemIcon,
  };

  // Compact string representation for QR code
  const qrString = `OXSHARE1:${keyHex}:${ivHex}:${ciphertextBase64}`;

  return { qrString, payloadStruct };
}

/**
 * Decrypt a QR payload string or struct using Web Crypto API AES-256-GCM
 */
export async function decryptPackagePayload(rawPayload: string): Promise<{ data: any; itemType: string; itemName?: string }> {
  let keyHex = "";
  let ivHex = "";
  let ciphertextBase64 = "";

  const trimmed = rawPayload.trim();

  // Case A: Compact string OXSHARE1:<keyHex>:<ivHex>:<ciphertextBase64>
  if (trimmed.startsWith("OXSHARE1:")) {
    const parts = trimmed.split(":");
    if (parts.length < 4) {
      throw new Error("Invalid OXSHARE QR code payload format.");
    }
    keyHex = parts[1];
    ivHex = parts[2];
    ciphertextBase64 = parts.slice(3).join(":"); // handles base64 string
  } else {
    // Case B: Full JSON struct
    try {
      const parsed = JSON.parse(trimmed) as EncryptedSharePayload;
      if (parsed.protocol === "OXSHARE" && parsed.keyHex && parsed.ciphertextBase64) {
        keyHex = parsed.keyHex;
        ivHex = parsed.ivHex;
        ciphertextBase64 = parsed.ciphertextBase64;
      } else {
        throw new Error("Not an encrypted OXSHARE package payload.");
      }
    } catch (e: any) {
      throw new Error("Unrecognized QR Code payload format: " + e.message);
    }
  }

  // Import AES-256 key
  const rawKeyBuf = hexToBuf(keyHex);
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    rawKeyBuf,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // Prepare IV & Ciphertext
  const ivBuf = hexToBuf(ivHex);
  const cipherBuf = base64ToArrayBuffer(ciphertextBase64);

  // Decrypt
  const decryptedBuf = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(ivBuf) },
    cryptoKey,
    cipherBuf
  );

  const textDecoder = new TextDecoder();
  const jsonStr = textDecoder.decode(decryptedBuf);
  const data = JSON.parse(jsonStr);

  const packageType = data.type || (data.deck ? "deck" : data.subject ? "subject" : data.folders ? "folder" : "unknown");

  return {
    data,
    itemType: packageType,
    itemName: data.deck?.name || data.subject?.name || data.folders?.[0]?.name || "Imported Package",
  };
}
