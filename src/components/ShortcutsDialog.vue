<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import Icon from "./Icon.vue";

const emit = defineEmits<{ close: [] }>();

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Tables", items: [["T", "Add table"], ["Ctrl+Enter", "Add column to selected table"], ["F2", "Rename selection"], ["Del", "Delete selection"], ["Ctrl+D", "Duplicate tables"], ["Ctrl+C / Ctrl+X / Ctrl+V", "Copy, cut, paste tables"], ["Alt+↑ / Alt+↓", "Move selected column"], ["Arrows", "Nudge tables (Shift for bigger steps)"], ["N", "Add note at the pointer"]] },
  { title: "Selection", items: [["Click", "Select table, column or relationship"], ["Ctrl+Click", "Add or remove a table"], ["Shift+Drag", "Select tables in a box"], ["Ctrl+A", "Select all tables"], ["Esc", "Clear selection"]] },
  { title: "View", items: [["Drag canvas", "Pan"], ["Ctrl+Scroll", "Zoom"], ["Ctrl+= / Ctrl+−", "Zoom in / out"], ["Ctrl+0", "Zoom to 100%"], ["Shift+1", "Fit entire schema"], ["Ctrl+Shift+L", "Auto layout"], ["Ctrl+K", "Search tables and columns"]] },
  { title: "Window", items: [["F11", "Full screen"], ["Ctrl+Shift+/", "Hide or show the whole interface"], ["Ctrl+B", "Navigation pane"], ["Ctrl+Shift+T", "Toolbar"], ["Ctrl+.", "Inspector"], ["Ctrl+Shift+S", "Status bar"], ["M", "Minimap"], ["Ctrl+,", "Settings"]] },
  { title: "General", items: [["Ctrl+Z / Ctrl+Y", "Undo / redo"], ["Ctrl+N", "New design or project"], ["?", "Show this list"]] },
];

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") { e.stopPropagation(); emit("close"); }
}
onMounted(() => window.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <div class="modal-back" @mousedown.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" style="width: min(680px, 100%)">
      <div class="modal-h"><span>Keyboard shortcuts</span><span class="grow"></span><button class="ibtn" aria-label="Close" @click="emit('close')"><Icon name="close" /></button></div>
      <div class="modal-b keys">
        <section v-for="g in GROUPS" :key="g.title">
          <h2>{{ g.title }}</h2>
          <div v-for="it in g.items" :key="it[0]" class="keyrow"><span>{{ it[1] }}</span><span class="kbd">{{ it[0] }}</span></div>
        </section>
      </div>
    </div>
  </div>
</template>
