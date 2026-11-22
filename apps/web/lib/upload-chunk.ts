// The browser uploader and the upload route share this; a multiple of 256 KiB, as Mux requires.
export const CHUNK_BYTES = 8 * 1024 * 1024;
