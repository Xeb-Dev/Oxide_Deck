// ------------------------------------------------------------------
// P2P CRYPTO SERVICE - AES-256-GCM End-to-End Encryption & P2P Stream
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
  protocol: "OXSHARE" | "OXCONNECT";
  keyHex: string;
  ivHex: string;
  ciphertextBase64: string;
  itemType: "deck" | "folder" | "subject";
  itemName: string;
  itemIcon: string;
  isP2pHandshake?: boolean;
  token?: string;
}

// In-Memory & Local P2P Store
const p2pChannel = new BroadcastChannel("oxide-p2p-share");

interface P2pSession {
  token: string;
  keyHex: string;
  ivHex: string;
  ciphertextBase64: string;
  itemType: "deck" | "folder" | "subject";
  itemName: string;
  itemIcon: string;
  expiresAt: number;
}

const activeSessions = new Map<string, P2pSession>();

// Listen for P2P requests over BroadcastChannel
p2pChannel.onmessage = (event) => {
  if (event.data?.type === "P2P_REQUEST_PAYLOAD") {
    const { token } = event.data;
    const session = activeSessions.get(token) || getSessionFromStorage(token);
    if (session) {
      p2pChannel.postMessage({
        type: "P2P_RESPONSE_PAYLOAD",
        token,
        ciphertextBase64: session.ciphertextBase64,
      });
    }
  }
};

function saveSessionToStorage(session: P2pSession) {
  try {
    sessionStorage.setItem(`oxide_p2p_${session.token}`, JSON.stringify(session));
  } catch (e) {
    // Ignore storage quota errors
  }
}

function getSessionFromStorage(token: string): P2pSession | null {
  try {
    const raw = sessionStorage.getItem(`oxide_p2p_${token}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore
  }
  return null;
}

/**
 * Encrypt a JS object payload (deck, folder, or subject) using AES-256-GCM.
 * Automatically switches to lightweight P2P Handshake QR Code if payload is large.
 */
export async function encryptPackagePayload(
  payloadObj: any,
  itemType: "deck" | "folder" | "subject",
  itemName: string,
  itemIcon: string
): Promise<{ qrString: string; payloadStruct: EncryptedSharePayload; isP2pStream: boolean }> {
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

  const directQrString = `OXSHARE1:${keyHex}:${ivHex}:${ciphertextBase64}`;

  // If payload is small enough (< 1200 chars), use direct payload QR
  if (directQrString.length <= 1200) {
    return { qrString: directQrString, payloadStruct, isP2pStream: false };
  }

  // Payload is large (e.g. contains cards or images) -> Generate P2P Handshake QR
  const token = `p2p_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const p2pSession: P2pSession = {
    token,
    keyHex,
    ivHex,
    ciphertextBase64,
    itemType,
    itemName,
    itemIcon,
    expiresAt: Date.now() + 120000, // 2 minute lifetime
  };

  activeSessions.set(token, p2pSession);
  saveSessionToStorage(p2pSession);

  // Ultra-compact P2P handshake QR string (~150 chars, ALWAYS fits in any QR code)
  const p2pQrString = `OXCONNECT1:${token}:${keyHex}:${ivHex}:${itemType}:${encodeURIComponent(itemName)}`;

  payloadStruct.protocol = "OXCONNECT";
  payloadStruct.isP2pHandshake = true;
  payloadStruct.token = token;

  return { qrString: p2pQrString, payloadStruct, isP2pStream: true };
}

/**
 * Decrypt a QR payload string or struct using Web Crypto API AES-256-GCM.
 * Seamlessly resolves direct payloads AND P2P stream handshakes.
 */
export async function decryptPackagePayload(rawPayload: string): Promise<{ data: any; itemType: string; itemName?: string }> {
  let keyHex = "";
  let ivHex = "";
  let ciphertextBase64 = "";

  const trimmed = rawPayload.trim();

  // Case 1: Direct QR Payload OXSHARE1:<keyHex>:<ivHex>:<ciphertextBase64>
  if (trimmed.startsWith("OXSHARE1:")) {
    const parts = trimmed.split(":");
    if (parts.length < 4) {
      throw new Error("Invalid OXSHARE QR code payload format.");
    }
    keyHex = parts[1];
    ivHex = parts[2];
    ciphertextBase64 = parts.slice(3).join(":");
  }
  // Case 2: P2P Stream Handshake QR Code OXCONNECT1:<token>:<keyHex>:<ivHex>:<itemType>:<itemName>
  else if (trimmed.startsWith("OXCONNECT1:")) {
    const parts = trimmed.split(":");
    if (parts.length < 5) {
      throw new Error("Invalid OXCONNECT P2P handshake payload format.");
    }
    const token = parts[1];
    keyHex = parts[2];
    ivHex = parts[3];

    // Request payload from session store / BroadcastChannel
    const session = activeSessions.get(token) || getSessionFromStorage(token);
    if (session) {
      ciphertextBase64 = session.ciphertextBase64;
    } else {
      // Query active P2P broadcast channels
      ciphertextBase64 = await fetchP2pPayloadFromChannel(token);
    }
  } else {
    // Case 3: Full JSON struct
    try {
      const parsed = JSON.parse(trimmed) as EncryptedSharePayload;
      if (parsed.keyHex && parsed.ciphertextBase64) {
        keyHex = parsed.keyHex;
        ivHex = parsed.ivHex;
        ciphertextBase64 = parsed.ciphertextBase64;
      } else {
        throw new Error("Not an encrypted OXSHARE or OXCONNECT package payload.");
      }
    } catch (e: any) {
      throw new Error("Unrecognized QR Code payload format: " + e.message);
    }
  }

  if (!ciphertextBase64) {
    throw new Error("P2P session payload not found or expired. Please re-scan or share via package file.");
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

async function fetchP2pPayloadFromChannel(token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempChannel = new BroadcastChannel("oxide-p2p-share");
    const timeout = setTimeout(() => {
      tempChannel.close();
      reject(new Error("P2P transfer timed out. Sender session may have closed."));
    }, 4000);

    tempChannel.onmessage = (evt) => {
      if (evt.data?.type === "P2P_RESPONSE_PAYLOAD" && evt.data?.token === token) {
        clearTimeout(timeout);
        tempChannel.close();
        resolve(evt.data.ciphertextBase64);
      }
    };

    tempChannel.postMessage({ type: "P2P_REQUEST_PAYLOAD", token });
  });
}
