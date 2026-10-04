<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { ENGINES } from "../engines";
import { currentProject, moveProject, onDisk, pickFolder, setRoot, store } from "../store";
import type { Theme } from "../types";
import Icon from "./Icon.vue";

const close = () => { store.settingsOpen = false; };

function setTheme(e: Event) {
  const v = (e.target as HTMLSelectElement).value;
  store.themeOverride = v === "system" ? null : (v as Theme);
}
async function changeRoot() {
  const dir = await pickFolder(store.root);
  if (dir) await setRoot(dir);
}
async function moveCurrent() {
  const p = currentProject.value;
  if (!p) return;
  const dir = await pickFolder(p.path);
  if (dir) await moveProject(p, dir);
}
function setProjectEngine(e: Event) {
  const p = currentProject.value;
  const v = (e.target as HTMLSelectElement).value;
  if (p) { p.engine = v || undefined; p.modified = Date.now(); }
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") { e.stopPropagation(); close(); }
}
onMounted(() => window.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <div class="modal-back" @mousedown.self="close">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Settings" style="width: min(560px, 100%)">
      <div class="modal-h"><span>Settings</span><span class="grow"></span><button class="ibtn" aria-label="Close" @click="close"><Icon name="close" /></button></div>
      <div class="modal-b prefs">
        <h2>Appearance</h2>
        <label class="pref"><span>Theme</span>
          <select class="selbox" :value="store.themeOverride || 'system'" @change="setTheme"><option value="system">Match Windows</option><option value="light">Light</option><option value="dark">Dark</option></select>
        </label>
        <label class="pref"><span>Show the status bar <span class="kbd">Ctrl+Shift+\</span></span><input v-model="store.showStatus" type="checkbox" /></label>
        <label class="pref"><span>Show the minimap in the editor <span class="kbd">M</span></span><input v-model="store.showMinimap" type="checkbox" /></label>

        <h2>New designs</h2>
        <label class="pref"><span>Default database engine</span>
          <select v-model="store.defaultEngine" class="selbox"><option v-for="e in ENGINES" :key="e" :value="e">{{ e }}</option></select>
        </label>

        <template v-if="onDisk">
          <h2>Storage</h2>
          <div class="pref"><span>Default projects folder<span class="path" :title="store.root">{{ store.root }}</span></span><button class="btn" @click="changeRoot">Change…</button></div>
        </template>

        <template v-if="currentProject">
          <h2>This project · {{ currentProject.name }}</h2>
          <label class="pref"><span>Engine for new designs</span>
            <select class="selbox" :value="currentProject.engine || ''" @change="setProjectEngine"><option value="">Use the default ({{ store.defaultEngine }})</option><option v-for="e in ENGINES" :key="e" :value="e">{{ e }}</option></select>
          </label>
          <div v-if="onDisk" class="pref"><span>Project folder<span class="path" :title="currentProject.path">{{ currentProject.path }}</span></span><button class="btn" @click="moveCurrent">Move…</button></div>
        </template>
      </div>
    </div>
  </div>
</template>
