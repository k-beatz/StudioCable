/**
 * File access. Inside the installed app (Tauri: desktop and Android) we use the
 * system's own open/save dialogs; in a plain browser we fall back to a download
 * link and a file picker. The rest of the app only calls these two functions.
 */

/** True when running inside the installed Tauri app rather than a browser. */
export const isNativeApp = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Extension without the dot, e.g. "studiocable" or "json". */
const extensionOf = (fileName: string) => fileName.slice(fileName.lastIndexOf('.') + 1);

/** Saves a text file. Resolves true if it was written, false if the user cancelled. */
export async function saveTextFile(fileName: string, content: string, mimeType = 'application/json'): Promise<boolean> {
  if (isNativeApp()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const path = await save({
      defaultPath: fileName,
      filters: [{ name: 'StudioCable', extensions: [extensionOf(fileName)] }],
    });
    if (!path) return false;
    await writeTextFile(path, content);
    return true;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/**
 * Lets the user pick a file; resolves with its text, or null if cancelled.
 * `accept` uses the browser format, e.g. ".studiocable,.json,application/json".
 */
export async function openTextFile(accept: string): Promise<string | null> {
  if (isNativeApp()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const extensions = accept
      .split(',')
      .filter((a) => a.startsWith('.'))
      .map((a) => a.slice(1));
    // Android's picker cannot filter by our own extension, so it shows all files there.
    const path = await open({
      multiple: false,
      directory: false,
      filters: /Android/i.test(navigator.userAgent) ? [] : [{ name: 'StudioCable', extensions }],
    });
    if (!path) return null;
    return readTextFile(path);
  }

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
