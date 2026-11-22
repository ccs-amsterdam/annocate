/** Saves data as a file: the browser downloads it under `filename`. */
export function downloadFile(data: Blob | BlobPart, filename: string, type?: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  // Revoked later: right away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
