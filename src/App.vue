<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import AppSidebar from "./components/AppSidebar.vue";
import FirstRun from "./components/FirstRun.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import TitleBar from "./components/TitleBar.vue";
import { currentDesign, currentProject, mode, store, theme, toggleFullscreen, toggleSidebar, toggleZen } from "./store";
import EditorView from "./views/EditorView.vue";
import ProjectsView from "./views/ProjectsView.vue";
import ProjectView from "./views/ProjectView.vue";

// Shortcuts that work on every screen.
function onKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "F11") { e.preventDefault(); toggleFullscreen(); }
  else if (mod && e.shiftKey && (e.key === "\\" || e.key === "|")) { e.preventDefault(); store.showStatus = !store.showStatus; }
  else if (mod && e.key === "\\") { e.preventDefault(); toggleZen(); }
  else if (mod && !e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); }
  else if (mod && e.key === ",") { e.preventDefault(); store.settingsOpen = !store.settingsOpen; }
}
// Ctrl+scroll and trackpad pinch must never zoom the whole window; the canvas handles its own zoom.
function onWheel(e: WheelEvent) {
  if (e.ctrlKey) e.preventDefault();
}
onMounted(() => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("wheel", onWheel, { passive: false });
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("wheel", onWheel);
});
</script>

<template>
  <div class="app" :class="['theme-' + theme, 'mode-' + mode, { zen: store.zen, fullscreen: store.fullscreen }]">
    <TitleBar v-if="!store.fullscreen" />
    <div v-if="store.error" class="errbar" role="alert"><span>{{ store.error }}</span><button @click="store.error = ''">Dismiss</button></div>
    <div v-if="store.ready" class="body">
      <FirstRun v-if="store.firstRun" />
      <template v-else>
        <div v-if="mode === 'compact' && store.sbOverlay && !store.zen" class="sb-spacer"></div>
        <AppSidebar v-if="!store.zen" />
        <EditorView v-if="store.view.name === 'editor' && currentProject && currentDesign" :key="currentDesign.id" :project="currentProject" :design="currentDesign" />
        <ProjectView v-else-if="store.view.name === 'project' && currentProject" :key="currentProject.id" :project="currentProject" :creating="store.view.creating" />
        <ProjectsView v-else />
      </template>
    </div>
    <SettingsDialog v-if="store.settingsOpen" />
    <div v-if="store.toast" class="toast" role="status">{{ store.toast }}</div>
  </div>
</template>
