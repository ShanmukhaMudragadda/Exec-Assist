/**
 * Pure JS PKCE — no native modules, no crypto global required.
 */

// --- minimal SHA-256 (public domain) ---
function rightRotate(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount))
}

function sha256Bytes(ascii: string): number[] {
  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  const lengthProperty = 'length'
  let i, j
  let result = ''

  const words: number[] = []
  const asciiBitLength = ascii[lengthProperty] * 8

  let hash: number[] = []
  const k: number[] = []
  let primeCounter = 0

  const isComposite: Record<number, boolean> = {}
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) isComposite[i] = true
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0
    }
  }

  ascii += '\x80'
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00'
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i)
    if (j >> 8) return []
    words[i >> 2] |= j << (((3 - i) % 4) * 8)
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0
  words[words[lengthProperty]] = asciiBitLength

  for (j = 0; j < words[lengthProperty]; ) {
    const W: number[] = words.slice(j, (j += 16))
    const oldHash = hash.slice(0)
    for (i = 0; i < 64; i++) {
      const i2 = i + j - 16
      const w15 = W[i - 15]
      const w2 = W[i - 2]
      const a = oldHash[0], e = oldHash[4]
      const temp1 =
        oldHash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & oldHash[5]) ^ (~e & oldHash[6])) +
        k[i] +
        (W[i] =
          i < 16
            ? W[i]
            : (W[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                W[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0)
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & oldHash[1]) ^ (a & oldHash[2]) ^ (oldHash[1] & oldHash[2]))
      oldHash.unshift((temp1 + temp2) | 0)
      oldHash.pop()
      oldHash[4] = (oldHash[4] + temp1) | 0
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255
      result += (b < 16 ? '0' : '') + b.toString(16)
    }
  }
  return result.match(/.{2}/g)!.map((h) => parseInt(h, 16))
}

function hexToBase64Url(bytes: number[]): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function generateState(): string {
  return randomString(16)
}

export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomString(64)
  const hashBytes = sha256Bytes(codeVerifier)
  const codeChallenge = hexToBase64Url(hashBytes)
  return { codeVerifier, codeChallenge }
}
