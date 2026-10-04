import { computed, reactive, watch } from "vue";
import { DEFAULT_ENGINE } from "./engines";
import { sampleProject } from "./seed";
import * as storage from "./storage";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Design, DesignSortKey, Mode, Project, ProjectSort, ProjectSortKey, Theme, View } from "./types";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

export const store = reactive({
  ready: false,
  // True until the user has confirmed where projects are kept.
  firstRun: false,
  defaultRoot: "",
  root: "",
  extra: [] as string[],
  projects: [] as Project[],
  themeOverride: null as Theme | null,
  systemDark: darkQuery.matches,
  sbCollapsed: false,
  sbOverlay: false,
  view: { name: "projects" } as View,
  width: window.innerWidth,
  now: Date.now(),
  saved: true,
  error: "",
  // Preferences
  defaultEngine: DEFAULT_ENGINE,
  showStatus: true,
  showMinimap: true,
  projectSort: { key: "modified", desc: true } as ProjectSort,
  // Session-only view state
  zen: false,
  fullscreen: false,
  settingsOpen: false,
  toast: "",
});

darkQuery.addEventListener("change", (e) => { store.systemDark = e.matches; });
window.addEventListener("resize", () => { store.width = window.innerWidth; });
setInterval(() => { store.now = Date.now(); }, 30_000);

export const onDisk = storage.onDisk;
export const theme = computed<Theme>(() => store.themeOverride || (store.systemDark ? "dark" : "light"));
export const mode = computed<Mode>(() => (store.width >= 1200 ? "wide" : store.width >= 1000 ? "mid" : "compact"));

export const currentProject = computed<Project | null>(() => {
  const v = store.view;
  return v.name === "projects" ? null : store.projects.find((p) => p.id === v.projectId) || null;
});
export const currentDesign = computed<Design | null>(() => {
  const v = store.view;
  if (v.name !== "editor" || !currentProject.value) return null;
  return currentProject.value.designs.find((d) => d.id === v.designId) || null;
});
export const projectsByRecent = computed(() => store.projects.slice().sort((a, b) => b.modified - a.modified));

function fail(e: unknown) {
  store.error = "Could not save: " + (e instanceof Error ? e.message : String(e));
}

/* ---------- loading ---------- */

// Brings projects saved by older versions up to the current shape.
function normalize(p: Project): Project {
  p.designs.forEach((d) => {
    d.enums = d.enums || [];
    d.notes = d.notes || [];
    d.tables.forEach((t) => {
      if (t.draft) { t.draft = false; if (!t.name.trim()) t.name = t.id; }
      const old = (t as unknown as { extraIdx?: { name: string; cols: string }[] }).extraIdx;
      if (old) {
        t.indexes = (t.indexes || []).concat(old.map((x) => ({
          id: crypto.randomUUID(), name: x.name, unique: false,
          cols: x.cols.split(",").map((n) => n.trim()).map((n) => (t.cols.find((c) => c.name === n) || { id: "" }).id).filter(Boolean),
        })));
        delete (t as unknown as { extraIdx?: unknown }).extraIdx;
      }
    });
  });
  return p;
}

const lastSaved = new Map<string, string>();
const savedKey = (p: Project) => p.path + "\n" + storage.serializeProject(p);

async function loadProjects() {
  const list = (await storage.loadProjects(store.root, store.extra)).map(normalize);
  lastSaved.clear();
  list.forEach((p) => lastSaved.set(p.id, savedKey(p)));
  store.projects = list;
}

export async function init() {
  try {
    const s = await storage.loadSettings();
    store.defaultRoot = await storage.defaultRoot();
    if (s) {
      store.extra = s.extra || [];
      store.themeOverride = s.theme;
      store.sbCollapsed = s.sbCollapsed;
      store.defaultEngine = s.defaultEngine || DEFAULT_ENGINE;
      store.showStatus = s.showStatus !== false;
      store.showMinimap = s.showMinimap !== false;
      if (s.projectSort) store.projectSort = s.projectSort;
    }
    if (onDisk && (!s || s.root == null)) {
      store.firstRun = true;
    } else {
      store.root = s && s.root ? s.root : "";
      await loadProjects();
      if (!s) { await addSample(); await saveSettings(); }
    }
  } catch (e) {
    fail(e);
  }
  store.ready = true;
  watch(() => store.projects, scheduleSave, { deep: true });
  watch(() => [store.root, store.extra, store.themeOverride, store.sbCollapsed, store.defaultEngine, store.showStatus, store.showMinimap, store.projectSort], saveSettings, { deep: true });
  scheduleSave();
}

async function addSample() {
  const s = sampleProject();
  store.projects.push({ ...s, path: await storage.projectDir(store.root, s.name) });
}

// Called from the first-run screen with the folder the user confirmed.
export async function finishFirstRun(root: string) {
  try {
    store.root = root;
    await loadProjects();
    if (!store.projects.length) await addSample();
    store.firstRun = false;
    await saveSettings();
  } catch (e) {
    fail(e);
  }
}

/* ---------- saving ---------- */

async function saveSettings() {
  if (store.firstRun) return;
  try {
    await storage.saveSettings({ root: store.root, extra: store.extra, theme: store.themeOverride, sbCollapsed: store.sbCollapsed, defaultEngine: store.defaultEngine, showStatus: store.showStatus, showMinimap: store.showMinimap, projectSort: store.projectSort });
  } catch (e) {
    fail(e);
  }
}

let saveTimer: number | undefined;
function scheduleSave() {
  store.saved = false;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flush, 250);
}

// Writes anything still waiting to be saved; used before the window closes.
export async function flushNow() {
  clearTimeout(saveTimer);
  await flush();
}

async function flush() {
  try {
    for (const p of store.projects) {
      const key = savedKey(p);
      if (lastSaved.get(p.id) === key) continue;
      await storage.writeProject(p.path, p.id, storage.serializeProject(p));
      lastSaved.set(p.id, key);
    }
    store.saved = true;
    store.error = "";
  } catch (e) {
    fail(e);
  }
}

/* ---------- view modes ---------- */

let toastTimer: number | undefined;
export function toast(message: string) {
  store.toast = message;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { store.toast = ""; }, 3500);
}

// Hides the navigation pane, toolbar and status bar so only the content is left.
export function toggleZen() {
  store.zen = !store.zen;
  if (store.zen) toast("Interface hidden · Ctrl+\\ shows it again");
}

export async function toggleFullscreen() {
  const on = !store.fullscreen;
  try {
    if (onDisk) await getCurrentWindow().setFullscreen(on);
    else if (on) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
    store.fullscreen = on;
    if (on) toast("Full screen · F11 leaves it");
  } catch (e) {
    fail(e);
  }
}

/* ---------- ordering ---------- */

const cmp = (a: string | number, b: string | number) => (typeof a === "string" ? a.localeCompare(b as string) : a - (b as number));

export const projectsSorted = computed(() => {
  const { key, desc } = store.projectSort;
  const val = (p: Project) => (key === "name" ? p.name.toLowerCase() : key === "designs" ? p.designs.length : p.modified);
  const list = store.projects.slice().sort((a, b) => cmp(val(a), val(b)));
  return desc ? list.reverse() : list;
});
export function sortProjectsBy(key: ProjectSortKey) {
  const cur = store.projectSort;
  // Dates and counts read best largest-first; names A to Z.
  store.projectSort = cur.key === key ? { key, desc: !cur.desc } : { key, desc: key !== "name" };
}

export function sortedDesigns(p: Project): Design[] {
  const s = p.sort;
  if (!s || s.key === "custom") return p.designs;
  const val = (d: Design) => (s.key === "name" ? d.name : s.key === "engine" ? d.engine : s.key === "tables" ? d.tables.length : d.modified);
  const list = p.designs.slice().sort((a, b) => cmp(val(a), val(b)));
  return s.desc ? list.reverse() : list;
}
// Clicking a column cycles ascending, descending, then back to the hand-arranged order.
export function sortDesignsBy(p: Project, key: DesignSortKey) {
  const cur = p.sort;
  if (!cur || cur.key !== key) p.sort = { key, desc: false };
  else if (!cur.desc) p.sort = { key, desc: true };
  else p.sort = { key: "custom", desc: false };
}
// Moves a design to a new position; whatever order was on screen becomes the custom order.
export function moveDesign(p: Project, id: string, toIndex: number) {
  const list = sortedDesigns(p).slice();
  const from = list.findIndex((d) => d.id === id);
  if (from < 0) return;
  const [d] = list.splice(from, 1);
  list.splice(toIndex > from ? toIndex - 1 : toIndex, 0, d);
  p.designs = list;
  p.sort = { key: "custom", desc: false };
}

/* ---------- navigation ---------- */

export function openProjects() { store.view = { name: "projects" }; store.sbOverlay = false; }
export function openProject(projectId: string, creating = false) { store.view = { name: "project", projectId, creating }; store.sbOverlay = false; }
export function openDesign(projectId: string, designId: string) { store.view = { name: "editor", projectId, designId }; store.sbOverlay = false; }

export function toggleSidebar() {
  if (mode.value === "compact") store.sbOverlay = !store.sbOverlay;
  else store.sbCollapsed = !store.sbCollapsed;
}

/* ---------- folders ---------- */

const norm = (p: string) => p.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
const parentOf = (p: string) => norm(p).replace(/\/[^/]*$/, "");
const inRoot = (dir: string) => parentOf(dir) === norm(store.root);

function trackFolder(dir: string, old?: string) {
  if (old) store.extra = store.extra.filter((x) => norm(x) !== norm(old));
  if (dir && !inRoot(dir) && !store.extra.some((x) => norm(x) === norm(dir))) store.extra.push(dir);
}

// What a project's folder would be called under `parent`, for display before it exists.
export function previewPath(parent: string, name: string): string {
  const sep = parent.includes("\\") ? "\\" : "/";
  return parent.replace(/[\\/]+$/, "") + sep + (name.trim() || "…");
}

export const pickFolder = storage.pickFolder;

// Changes the default projects folder. Projects already open stay in the list.
export async function setRoot(root: string) {
  try {
    await flush();
    const keep = store.projects.map((p) => p.path);
    store.root = root;
    store.extra = [];
    keep.forEach((dir) => trackFolder(dir));
    await loadProjects();
  } catch (e) {
    fail(e);
  }
}

/* ---------- projects ---------- */

export async function createProject(name: string, parent?: string): Promise<Project | null> {
  try {
    const path = await storage.projectDir(parent || store.root, name);
    store.projects.unshift({ id: crypto.randomUUID(), name, path, designs: [], modified: Date.now() });
    trackFolder(path);
    return store.projects[0];
  } catch (e) {
    fail(e);
    return null;
  }
}

// The same cleaning the desktop side applies when it names a project folder.
const folderName = (name: string) => name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().replace(/\.+$/, "").trim() || "Project";

// Writes the project into `dir`, removes it from its old folder and updates the bookkeeping.
async function relocate(p: Project, dir: string) {
  const old = p.path;
  await storage.writeProject(dir, p.id, storage.serializeProject(p));
  await storage.removeProject(old, p.id);
  p.path = dir;
  lastSaved.set(p.id, savedKey(p));
  trackFolder(dir, old);
}

// Renames the project, and its folder too when the folder was named after it.
export async function renameProject(p: Project, name: string) {
  const oldName = p.name;
  p.name = name;
  p.modified = Date.now();
  if (!onDisk) return;
  try {
    const m = /^(.*)[\\/]([^\\/]+)[\\/]*$/.exec(p.path);
    if (!m || m[2] !== folderName(oldName) || folderName(name) === m[2]) return;
    await relocate(p, await storage.projectDir(m[1], name));
  } catch (e) {
    fail(e);
  }
}

// Adds a project that already exists in a folder chosen by the user.
export async function openProjectFolder(): Promise<void> {
  try {
    const dir = await storage.pickFolder(store.root);
    if (!dir) return;
    const found = (await storage.loadProjects("", [dir])).map(normalize);
    if (!found.length) { store.error = "There is no Joinery project in " + dir; return; }
    const p = found[0];
    const existing = store.projects.find((x) => x.id === p.id);
    if (!existing) {
      lastSaved.set(p.id, savedKey(p));
      store.projects.push(p);
      trackFolder(dir);
    }
    openProject(p.id);
  } catch (e) {
    fail(e);
  }
}

export async function deleteProject(p: Project) {
  try {
    await storage.removeProject(p.path, p.id);
    lastSaved.delete(p.id);
    store.projects = store.projects.filter((x) => x.id !== p.id);
    trackFolder("", p.path);
    if (store.view.name !== "projects" && store.view.projectId === p.id) openProjects();
  } catch (e) {
    fail(e);
  }
}

// Moves the project into a folder of its own under `parent`.
export async function moveProject(p: Project, parent: string) {
  try {
    if (parentOf(p.path) === norm(parent)) return;
    await relocate(p, await storage.projectDir(parent, p.name));
  } catch (e) {
    fail(e);
  }
}

/* ---------- designs ---------- */

export function designName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

function uniqueDesignName(project: Project, name: string, except?: Design): string {
  let n = name, k = 2;
  while (project.designs.some((d) => d !== except && d.name === n)) { n = name + "_" + k; k++; }
  return n;
}

export function createDesign(project: Project, name: string, engine = project.engine || store.defaultEngine): Design {
  const now = Date.now();
  project.designs.unshift({ id: crypto.randomUUID(), name: uniqueDesignName(project, name), engine, tables: [], rels: [], enums: [], notes: [], modified: now });
  project.modified = now;
  return project.designs[0];
}

export function renameDesign(project: Project, d: Design, name: string) {
  d.name = uniqueDesignName(project, name, d);
  touchDesign(d);
}

export function duplicateDesign(project: Project, d: Design): Design {
  const copy = JSON.parse(JSON.stringify(d)) as Design;
  copy.id = crypto.randomUUID();
  copy.name = uniqueDesignName(project, d.name + "_copy");
  project.designs.splice(project.designs.indexOf(d) + 1, 0, copy);
  touchDesign(copy);
  return project.designs.find((x) => x.id === copy.id)!;
}

export function deleteDesign(project: Project, d: Design) {
  project.designs = project.designs.filter((x) => x.id !== d.id);
  project.modified = Date.now();
  if (store.view.name === "editor" && store.view.designId === d.id) openProject(project.id);
}

export function touchDesign(design: Design) {
  const now = Date.now();
  design.modified = now;
  const p = store.projects.find((x) => x.designs.some((d) => d.id === design.id));
  if (p) p.modified = now;
}

/* ---------- formatting ---------- */

export function designMono(name: string): string {
  const parts = name.split("_").filter(Boolean);
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatModified(ts: number, now: number): string {
  const diff = now - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + " min ago";
  const d = new Date(ts), n = new Date(now);
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(n) - day(d)) / 86_400_000);
  if (days === 0) return "Today, " + hm;
  if (days === 1) return "Yesterday, " + hm;
  const md = MONTHS[d.getMonth()] + " " + d.getDate();
  return d.getFullYear() === n.getFullYear() ? md : md + ", " + d.getFullYear();
}

export function plural(n: number, word: string): string {
  return n + " " + word + (n === 1 ? "" : "s");
}
