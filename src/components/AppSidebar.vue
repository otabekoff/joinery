<script setup lang="ts">
import { computed } from "vue";
import { useDragOrder } from "../dragOrder";
import { currentProject, designMono, mode, moveDesign, openDesign, openProject, openProjects, plural, projectsByRecent, sortedDesigns, store } from "../store";
import Icon from "./Icon.vue";

const rail = computed(() => (mode.value === "compact" ? !store.sbOverlay : store.sbCollapsed));
const overlay = computed(() => mode.value === "compact" && store.sbOverlay);
const recent = computed(() => projectsByRecent.value.slice(0, 3));
// Designs can be dragged into a different order here as well as on the project page.
const order = useDragOrder(".nav[data-did]", (id, to) => { if (currentProject.value) moveDesign(currentProject.value, id, to); });
const activeDesign = computed(() => (store.view.name === "editor" ? store.view.designId : ""));
</script>

<template>
  <nav class="sidebar" :class="{ rail, overlay }" aria-label="Projects and designs">
    <button class="nav" :class="store.view.name === 'projects' ? 'active' : 'dim'" title="All projects" @click="openProjects"><Icon name="folder" /><span class="lbl">All projects</span></button>
    <template v-if="currentProject">
      <div class="nav-label">{{ currentProject.name }}</div>
      <div class="nav-scroll">
        <button v-for="(d, i) in sortedDesigns(currentProject)" :key="d.id" class="nav" :class="[{ active: d.id === activeDesign }, order.rowClass(d.id, i, currentProject.designs.length)]" :data-did="d.id" :title="d.name + ' · ' + plural(d.tables.length, 'table') + '. Drag to reorder.'" @mousedown="order.down($event, d.id)" @click="order.wasDrag() || openDesign(currentProject.id, d.id)">
          <span class="mono-ic">{{ designMono(d.name) }}</span><span class="lbl">{{ d.name }}</span><span class="meta lbl">{{ d.tables.length }}</span>
        </button>
        <button v-if="store.view.name === 'editor'" class="nav dim" title="New database design (Ctrl+N)" @click="openProject(currentProject.id, true)"><Icon name="plus" /><span class="lbl">New design</span></button>
      </div>
    </template>
    <template v-else>
      <div class="nav-label">Recent</div>
      <button v-for="p in recent" :key="p.id" class="nav" :title="p.name" @click="openProject(p.id)"><Icon name="project" /><span class="lbl">{{ p.name }}</span></button>
    </template>
    <div class="grow"></div>
    <button class="nav" title="Settings (Ctrl+,)" @click="store.settingsOpen = true"><Icon name="settings" /><span class="lbl">Settings</span></button>
  </nav>
</template>
