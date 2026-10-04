<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ENGINES } from "../engines";
import { moveProject, onDisk, pickFolder, renameProject, sortDesignsTo, store } from "../store";
import type { DesignSortKey } from "../types";
import Icon from "./Icon.vue";

const project = computed(() => store.projects.find((p) => p.id === store.projectSettingsId) || null);
const name = ref(project.value ? project.value.name : "");
const close = () => { store.projectSettingsId = ""; };

const ORDERS: { value: string; label: string }[] = [
  { value: "custom", label: "My own order (drag to arrange)" },
  { value: "name", label: "Name, A to Z" }, { value: "name-desc", label: "Name, Z to A" },
  { value: "modified-desc", label: "Last modified, newest first" }, { value: "modified", label: "Last modified, oldest first" },
  { value: "tables-desc", label: "Most tables first" }, { value: "engine", label: "Engine" },
];
const order = computed(() => { const s = project.value && project.value.sort; return !s || s.key === "custom" ? "custom" : s.key + (s.desc ? "-desc" : ""); });

function applyName() {
  const p = project.value, n = name.value.trim();
  if (p && n && n !== p.name) void renameProject(p, n);
}
function setEngine(e: Event) {
  const p = project.value;
  if (p) { p.engine = (e.target as HTMLSelectElement).value || undefined; p.modified = Date.now(); }
}
function setOrder(e: Event) {
  const [key, desc] = (e.target as HTMLSelectElement).value.split("-");
  if (project.value) sortDesignsTo(project.value, key as DesignSortKey, desc === "desc");
}
async function move() {
  const p = project.value;
  if (!p) return;
  const dir = await pickFolder(p.path);
  if (dir) await moveProject(p, dir);
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") { e.stopPropagation(); close(); }
}
onMounted(() => window.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
</script>

<template>
  <div v-if="project" class="modal-back" @mousedown.self="close">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Project settings" style="width: min(560px, 100%)">
      <div class="modal-h"><span>Project settings</span><span class="sub">{{ project.name }}</span><span class="grow"></span><button class="ibtn" aria-label="Close" @click="close"><Icon name="close" /></button></div>
      <div class="modal-b prefs">
        <label class="pref"><span>Name</span><input v-model="name" class="tf" style="width: 260px" aria-label="Project name" @change="applyName" @keydown.enter="applyName" /></label>
        <label class="pref"><span>Database engine for new designs</span>
          <select class="selbox" :value="project.engine || ''" @change="setEngine"><option value="">App default ({{ store.defaultEngine }})</option><option v-for="e in ENGINES" :key="e" :value="e">{{ e }}</option></select>
        </label>
        <label class="pref"><span>Order of designs</span>
          <select class="selbox" :value="order" @change="setOrder"><option v-for="o in ORDERS" :key="o.value" :value="o.value">{{ o.label }}</option></select>
        </label>
        <div v-if="onDisk" class="pref"><span>Folder<span class="path" :title="project.path">{{ project.path }}</span></span><button class="btn" @click="move">Move…</button></div>
        <p class="muted" style="margin: 8px 0 0">These settings are saved in the project file and travel with the project.</p>
      </div>
    </div>
  </div>
</template>
