<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { currentProject, flushNow, openProject, store, toggleSidebar } from "../store";
import Icon from "./Icon.vue";

// The caption buttons do nothing when the UI runs in a plain browser.
async function win(action: "minimize" | "toggleMaximize" | "close") {
  if (!isTauri()) return;
  // Edits are saved a moment after they happen; make sure nothing is still pending.
  if (action === "close") await flushNow();
  getCurrentWindow()[action]();
}

const maximized = ref(false);
let unlisten: (() => void) | undefined;
let unlistenClose: (() => void) | undefined;
onMounted(async () => {
  if (!isTauri()) return;
  const w = getCurrentWindow();
  maximized.value = await w.isMaximized();
  // The resize event can arrive before the window reports its new state, so ask a moment later.
  // Alt+F4 and the taskbar close the window without going through the button above.
  unlistenClose = await w.onCloseRequested(async () => { await flushNow(); });
  unlisten = await w.onResized(() => { setTimeout(async () => { maximized.value = await w.isMaximized(); }, 120); });
});
onBeforeUnmount(() => { unlisten?.(); unlistenClose?.(); });
</script>

<template>
  <header class="titlebar" data-tauri-drag-region>
    <div class="tb-left" data-tauri-drag-region>
      <div class="brand-ic" data-tauri-drag-region><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1.5" width="7" height="5.5" rx="1.4" fill="var(--accent)" /><rect x="8" y="9" width="7" height="5.5" rx="1.4" fill="var(--accent)" opacity=".5" /><path d="M4.5 7v4.5H8" fill="none" stroke="var(--accent)" stroke-width="1.4" /></svg></div>
      <button class="ibtn" aria-label="Navigation pane" :title="store.showNav ? 'Collapse or expand the navigation pane' : 'Show the navigation pane (Ctrl+B)'" @click="toggleSidebar"><Icon name="menu" /></button>
      <div class="brand" data-tauri-drag-region>Joinery</div>
      <template v-if="store.view.name === 'editor' && currentProject">
        <span class="crumb-sep">/</span>
        <button class="crumb" @click="openProject(currentProject.id)">{{ currentProject.name }}</button>
      </template>
    </div>
    <div class="caption">
      <button aria-label="Minimize" @click="win('minimize')"><svg class="cap" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5h10" /></svg></button>
      <button :aria-label="maximized ? 'Restore' : 'Maximize'" @click="win('toggleMaximize')">
        <svg v-if="maximized" class="cap" viewBox="0 0 10 10" aria-hidden="true"><rect x=".5" y="2.5" width="7" height="7" rx="1.2" /><path d="M2.5 2.5V1.7A1.2 1.2 0 0 1 3.7.5h4.6a1.2 1.2 0 0 1 1.2 1.2v4.6a1.2 1.2 0 0 1-1.2 1.2H7.5" /></svg>
        <svg v-else class="cap" viewBox="0 0 10 10" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9" rx="1.5" /></svg>
      </button>
      <button class="close" aria-label="Close" @click="win('close')"><svg class="cap" viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0 0 10" /></svg></button>
    </div>
  </header>
</template>
