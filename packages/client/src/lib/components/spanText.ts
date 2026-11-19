import type { SpanSlice } from "@annotinder/contracts";

// Pure helpers for selecting spans of text (SelectableText): word snapping, slices.

/**
 * Truncates span text with an ellipsis in the middle if it exceeds maxLength.
 * Useful for keeping badge titles and summary chips compact and legible.
 */
export function truncateSpanText(text: string, maxLength = 30): string {
  if (text.length <= maxLength) return text;
  const charsToShow = maxLength - 1; // 1 for '…'
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return `${text.slice(0, frontChars).trimEnd()}…${text.slice(-backChars).trimStart()}`;
}

/**
 * Snaps arbitrary character start/end offsets to word boundaries,
 * following the standard natural text selection expectation.
 */
export function snapToWord(text: string, start: number, end: number): [number, number] {
  if (start >= end) return [start, end];

  // Expand start backwards to word boundary (non-whitespace)
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }

  // Expand end forwards to word boundary (non-whitespace)
  while (end < text.length && !/\s/.test(text[end])) {
    end++;
  }

  // Trim leading/trailing whitespace if any crept in
  while (start < end && /\s/.test(text[start])) {
    start++;
  }
  while (end > start && /\s/.test(text[end - 1])) {
    end--;
  }

  return [start, end];
}

/**
 * Trims leading and trailing whitespace from a character range.
 */
function trimRangeWhitespace(
  text: string,
  offset: number,
  length: number,
): { offset: number; length: number } {
  let start = offset;
  let end = offset + length;
  while (start < end && /\s/.test(text[start])) {
    start++;
  }
  while (end > start && /\s/.test(text[end - 1])) {
    end--;
  }
  return { offset: start, length: Math.max(0, end - start) };
}

/**
 * Merges overlapping or directly adjacent slices and extracts their text from `text`.
 */
export function mergeSpanSlices(
  text: string,
  slices: Array<{ offset: number; length: number }>,
): SpanSlice[] {
  if (slices.length === 0) return [];
  const sorted = [...slices].sort((a, b) => a.offset - b.offset);
  const merged: Array<{ offset: number; length: number }> = [];

  for (const raw of sorted) {
    const trimmed = trimRangeWhitespace(text, raw.offset, raw.length);
    if (trimmed.length === 0) continue;

    if (merged.length === 0) {
      merged.push({ ...trimmed });
      continue;
    }
    const last = merged[merged.length - 1];
    // If overlapping, touching, or separated only by whitespace, merge them
    const between = text.slice(last.offset + last.length, trimmed.offset);
    const isWhitespaceOnly = /^\s*$/.test(between);
    if (trimmed.offset <= last.offset + last.length || isWhitespaceOnly) {
      const newEnd = Math.max(last.offset + last.length, trimmed.offset + trimmed.length);
      last.length = newEnd - last.offset;
    } else {
      merged.push({ ...trimmed });
    }
  }

  return merged.map((m) => ({
    offset: m.offset,
    length: m.length,
    text: text.slice(m.offset, m.offset + m.length),
  }));
}

/**
 * Toggles a range on or off within a set of slices.
 * If range overlaps any current slice, it removes that range (splitting or shortening slices).
 * If range does not overlap, it adds that range and merges any touching slices.
 */
export function toggleSliceRange(
  text: string,
  currentSlices: SpanSlice[],
  range: { offset: number; length: number },
): SpanSlice[] {
  const trimmed = trimRangeWhitespace(text, range.offset, range.length);
  if (trimmed.length === 0) return currentSlices;
  const rStart = trimmed.offset;
  const rEnd = trimmed.offset + trimmed.length;

  const overlaps = currentSlices.some(
    (s) => rStart < s.offset + s.length && s.offset < rEnd,
  );

  if (overlaps) {
    // Toggle OFF: subtract range from slices
    const newRanges: Array<{ offset: number; length: number }> = [];
    for (const s of currentSlices) {
      const sStart = s.offset;
      const sEnd = s.offset + s.length;
      if (rEnd <= sStart || rStart >= sEnd) {
        // No overlap
        newRanges.push({ offset: sStart, length: s.length });
      } else {
        // Overlap: keep parts before and after
        if (sStart < rStart) {
          newRanges.push({ offset: sStart, length: rStart - sStart });
        }
        if (sEnd > rEnd) {
          newRanges.push({ offset: rEnd, length: sEnd - rEnd });
        }
      }
    }
    return newRanges
      .map((r) => trimRangeWhitespace(text, r.offset, r.length))
      .filter((r) => r.length > 0)
      .map((r) => ({
        offset: r.offset,
        length: r.length,
        text: text.slice(r.offset, r.offset + r.length),
      }));
  } else {
    // Toggle ON: add and merge
    return mergeSpanSlices(text, [...currentSlices, trimmed]);
  }
}

/**
 * Finds the word boundaries at a given character offset in `text`.
 */
export function getWordAtPosition(text: string, offset: number): [number, number] | null {
  if (offset < 0 || offset >= text.length) return null;

  // If clicked directly on whitespace, look right or left for nearest word
  if (/\s/.test(text[offset])) {
    if (offset + 1 < text.length && !/\s/.test(text[offset + 1])) {
      offset = offset + 1;
    } else if (offset > 0 && !/\s/.test(text[offset - 1])) {
      offset = offset - 1;
    } else {
      return null;
    }
  }

  let start = offset;
  let end = offset;

  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }
  while (end < text.length && !/\s/.test(text[end])) {
    end++;
  }

  return [start, end];
}
