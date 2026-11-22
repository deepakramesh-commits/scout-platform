// HTTP Range for streaming match video, so the browser's player can seek. Pure, so `node --test` runs it.

export type ByteRange = { start: number; end: number };

/** The single byte range a request asks for; null for the whole file; "unsatisfiable" when it lies outside it. */
export function parseRange(header: string | null, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null; // multiple or malformed ranges: send the whole file, as RFC 9110 allows
  if (m[1] === "") {
    const suffix = Number(m[2]);
    return suffix === 0 || size === 0 ? "unsatisfiable" : { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  return start >= size || end < start ? "unsatisfiable" : { start, end };
}
