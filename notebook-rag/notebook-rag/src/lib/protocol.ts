/**
 * The query endpoint streams a single response body:
 *   <citations JSON>  <DELIM>  <answer text stream…>
 * The client reads the citations first (so it can render inspectable sources),
 * then appends answer tokens live as they arrive.
 */
export const STREAM_DELIM = "\n\u241E\n"; // ␞ record separator, unlikely in prose
