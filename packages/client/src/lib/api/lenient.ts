// The API may add values to the enums in its responses (docs/api/README.md,
// "Stability"): an error code, a device type, how a session ended, a
// warning's code, an agreement metric. The client reads them leniently: a
// value it doesn't know yet is shown as it is, never an error or a blank.

/**
 * What to show for a value of an enum the server may add to: its label, or
 * the value itself when this client doesn't know it yet.
 */
export function labelOf(labels: Readonly<Record<string, string>>, value: string): string {
  return Object.hasOwn(labels, value) ? labels[value]! : value;
}
