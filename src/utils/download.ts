/** Trigger a local file download from an extension page (side panel / popup). */
export async function downloadBlobFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: true,
    });
    if (downloadId === undefined) {
      throw new Error('Download API returned no id');
    }
  } catch {
    // Fallback when downloads API is blocked or unavailable
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadTextFile(
  content: string,
  filename: string,
  mime = 'text/csv;charset=utf-8'
): Promise<void> {
  await downloadBlobFile(new Blob([content], { type: mime }), filename);
}
