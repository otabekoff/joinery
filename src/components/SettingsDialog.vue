<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { ENGINES } from "../engines";
import { currentProject, onDisk, pickFolder, setRoot, store } from "../store";
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

        <h2>Show <span class="kbd">Ctrl+Shift+/ hides or shows all of these</span></h2>
        <label class="pref"><span>Navigation pane <span class="kbd">Ctrl+B</span></span><input v-model="store.showNav" type="checkbox" /></label>
        <label class="pref"><span>Toolbar <span class="kbd">Ctrl+Shift+T</span></span><input v-model="store.showToolbar" type="checkbox" /></label>
        <label class="pref"><span>Inspector <span class="kbd">Ctrl+.</span></span><input v-model="store.showInspector" type="checkbox" /></label>
        <label class="pref"><span>Status bar <span class="kbd">Ctrl+Shift+S</span></span><input v-model="store.showStatus" type="checkbox" /></label>
        <label class="pref"><span>Minimap <span class="kbd">M</span></span><input v-model="store.showMinimap" type="checkbox" /></label>

        <h2>Canvas</h2>
        <label class="pref"><span>Zoom with pinch and Ctrl+scroll<span class="path">Trackpad pinch, two-finger touch, or Ctrl with the mouse wheel</span></span><input v-model="store.pinchZoom" type="checkbox" /></label>

        <label class="pref"><span>Mark where I click the canvas<span class="path">A brief ripple on empty canvas, where the next note or table will go</span></span><input v-model="store.clickRipple" type="checkbox" /></label>

        <h2>New designs</h2>
        <label class="pref"><span>Default database engine</span>
          <select v-model="store.defaultEngine" class="selbox"><option v-for="e in ENGINES" :key="e" :value="e">{{ e }}</option></select>
        </label>

        <template v-if="onDisk">
          <h2>Storage</h2>
          <div class="pref"><span>Default projects folder<span class="path" :title="store.root">{{ store.root }}</span></span><button class="btn" @click="changeRoot">Change…</button></div>
        </template>

        <p v-if="currentProject" class="muted" style="margin: 10px 0 0">Settings for “{{ currentProject.name }}” are in <button class="linkbtn" @click="store.settingsOpen = false; store.projectSettingsId = currentProject.id">Project settings</button>.</p>
      </div>
    </div>
  </div>
</template>
