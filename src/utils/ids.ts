/**
 * UUIDv7 generator (RFC 9562): 48-bit ms timestamp + random bits. Time-ordered, so rows sort
 * by creation and future sync can use them as global IDs.
 *
 * Hermes has no crypto.getRandomValues; the app entry point wires expo-crypto in via
 * configureRandomSource(). Tests (Node) use the global WebCrypto.
 */
type RandomSource = (bytes: Uint8Array<ArrayBuffer>) => void;

let randomSource: RandomSource | null =
  typeof globalThis.crypto?.getRandomValues === 'function'
    ? (bytes) => {
        globalThis.crypto.getRandomValues(bytes);
      }
    : null;

export function configureRandomSource(source: RandomSource): void {
  randomSource = source;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function newId(now: number = Date.now()): string {
  if (!randomSource) throw new Error('ids: no random source configured');
  const b = new Uint8Array(16);
  randomSource(b);
  // 48-bit big-endian timestamp. Avoid 32-bit bitwise ops on the full value.
  let t = Math.floor(now);
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70; // version 7
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => HEX[x]).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
