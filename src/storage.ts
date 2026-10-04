import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Project, ProjectSort, Theme } from "./types";

// In the desktop app projects are files on disk. In a plain browser (vite dev
// without Tauri) the same calls fall back to localStorage so the UI still works.
export const onDisk = isTauri();

export interface Settings {
  // Default projects folder; null until the first-run choice has been made.
  root: string | null;
  // Project folders that live outside the default folder.
  extra: string[];
  theme: Theme | null;
  sbCollapsed: boolean;
  defaultEngine?: string;
  showStatus?: boolean;
  showMinimap?: boolean;
  projectSort?: ProjectSort;
  pinchZoom?: boolean;
  showNav?: boolean;
  showToolbar?: boolean;
  showInspector?: boolean;
  clickRipple?: boolean;
}

const LS_SETTINGS = "joinery.settings";
const LS_PROJECT = "joinery.project.";

export async function loadSettings(): Promise<Settings | null> {
  const raw = onDisk ? await invoke<string | null>("read_settings") : localStorage.getItem(LS_SETTINGS);
  if (!raw) return null;
  try { return JSON.parse(raw) as Settings; } catch { return null; }
}

export async function saveSettings(s: Settings): Promise<void> {
  const contents = JSON.stringify(s, null, 2);
  if (onDisk) await invoke("write_settings", { contents });
  else localStorage.setItem(LS_SETTINGS, contents);
}

export async function defaultRoot(): Promise<string> {
  return onDisk ? invoke<string>("default_root") : "";
}

export async function loadProjects(root: string, extra: string[]): Promise<Project[]> {
  const out: Project[] = [];
  if (onDisk) {
    const found = await invoke<[string, string][]>("list_projects", { root, extra });
    for (const [dir, contents] of found) {
      try { out.push({ ...(JSON.parse(contents) as Project), path: dir }); } catch { /* skip unreadable project files */ }
    }
  } else {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PROJECT)) {
        try { out.push({ ...(JSON.parse(localStorage.getItem(k)!) as Project), path: "" }); } catch { /* skip */ }
      }
    }
  }
  return out;
}

export async function projectDir(parent: string, name: string): Promise<string> {
  return onDisk ? invoke<string>("project_dir", { parent, name }) : "";
}

export function serializeProject(p: Project): string {
  const { path: _path, ...rest } = p;
  return JSON.stringify(rest, null, 2);
}

export async function writeProject(dir: string, id: string, contents: string): Promise<void> {
  if (onDisk) await invoke("write_project", { dir, contents });
  else localStorage.setItem(LS_PROJECT + id, contents);
}

export async function removeProject(dir: string, id: string): Promise<void> {
  if (onDisk) await invoke("delete_project", { dir });
  else localStorage.removeItem(LS_PROJECT + id);
}

export async function pickFolder(defaultPath?: string): Promise<string | null> {
  if (!onDisk) return null;
  const r = await open({ directory: true, multiple: false, defaultPath, title: "Choose a folder" });
  return typeof r === "string" ? r : null;
}

// Saves an exported file: a save dialog in the desktop app, a download in the browser.
export async function saveFile(name: string, ext: string, label: string, data: string | Uint8Array): Promise<boolean> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (onDisk) {
    const path = await save({ defaultPath: name, filters: [{ name: label, extensions: [ext] }] });
    if (!path) return false;
    await invoke("write_file", { path, contents: Array.from(bytes) });
    return true;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  return true;
}
