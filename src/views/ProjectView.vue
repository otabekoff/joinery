<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "../components/Icon.vue";
import { ENGINES } from "../engines";
import { createDesign, deleteDesign, designMono, designName, duplicateDesign, formatModified, moveDesign, openDesign, openProjects, plural, renameDesign, sortDesignsBy, sortedDesigns, store } from "../store";
import type { Design, DesignSortKey, Project } from "../types";

const props = defineProps<{ project: Project; creating?: boolean }>();

const q = ref("");
const creating = ref(false);
const newName = ref("");
const newEngine = ref(props.project.engine || store.defaultEngine);
const menuFor = ref("");
const renaming = ref("");
const renameText = ref("");
const deleting = ref("");

const rows = computed(() => {
  const s = q.value.trim().toLowerCase();
  return sortedDesigns(props.project).filter((d) => !s || d.name.toLowerCase().includes(s));
});

const HEADS: { key: DesignSortKey; label: string; right?: boolean }[] = [{ key: "name", label: "Name" }, { key: "engine", label: "Engine" }, { key: "tables", label: "Tables", right: true }, { key: "modified", label: "Last modified", right: true }];
const sortKey = computed(() => (props.project.sort ? props.project.sort.key : "custom"));

/* Drag a row up or down to put the designs in an order of your own. */
const drag = ref<{ id: string; to: number } | null>(null);
let dragStart: { id: string; y: number } | null = null;
let justDragged = false;
function rowDown(e: MouseEvent, d: Design) {
  if (e.button !== 0 || q.value.trim()) return;
  dragStart = { id: d.id, y: e.clientY };
  window.addEventListener("mousemove", rowMove);
  window.addEventListener("mouseup", rowUp);
}
function rowMove(e: MouseEvent) {
  if (!dragStart) return;
  if (!drag.value && Math.abs(e.clientY - dragStart.y) < 5) return;
  const els = Array.from(document.querySelectorAll<HTMLElement>(".lrow[data-did]"));
  // The gap the pointer is nearest to: before row 0, between rows, or after the last.
  let to = els.length;
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { to = i; break; }
  }
  drag.value = { id: dragStart.id, to };
}
function rowUp() {
  window.removeEventListener("mousemove", rowMove);
  window.removeEventListener("mouseup", rowUp);
  const d = drag.value;
  dragStart = null; drag.value = null;
  if (!d) return;
  moveDesign(props.project, d.id, d.to);
  // The mouseup that ends a drag would otherwise open the design.
  justDragged = true;
  setTimeout(() => { justDragged = false; }, 0);
}
function open(d: Design) {
  if (!justDragged) openDesign(props.project.id, d.id);
}
const focus = (sel: string) => nextTick(() => { const el = document.querySelector<HTMLInputElement>(sel); el?.focus(); el?.select(); });

function startNew() {
  creating.value = true;
  newName.value = "";
  focus("#new-design");
}
function confirmNew() {
  const n = designName(newName.value);
  if (!n) return;
  const d = createDesign(props.project, n, newEngine.value);
  openDesign(props.project.id, d.id);
}
function startRename(d: Design) {
  menuFor.value = "";
  renaming.value = d.id;
  renameText.value = d.name;
  focus("#rename-design");
}
function confirmRename(d: Design) {
  if (renaming.value !== d.id) return;
  const n = designName(renameText.value);
  if (n && n !== d.name) renameDesign(props.project, d, n);
  renaming.value = "";
}
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") { e.preventDefault(); startNew(); }
  else if (e.key === "Escape") { menuFor.value = ""; deleting.value = ""; }
}
function onDocDown(e: MouseEvent) {
  if (menuFor.value && !(e.target as HTMLElement).closest(".lact")) menuFor.value = "";
}
onMounted(() => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("mousedown", onDocDown, true);
  if (props.creating) startNew();
});
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDocDown, true); });
</script>

<template>
  <main class="main">
    <div class="page-h sub">
      <button class="back" @click="openProjects"><Icon name="back" />Projects</button>
      <span class="slash">/</span>
      <h1 class="page-t">{{ project.name }} <span class="n">{{ plural(project.designs.length, "design") }}</span></h1>
      <div class="grow"></div>
      <div class="search">
        <Icon name="search" class="s-ico" />
        <input v-model="q" class="tf" type="text" placeholder="Search designs" aria-label="Search designs" />
      </div>
      <button class="btn primary" title="New database design (Ctrl+N)" @click="startNew"><Icon name="plus" />New design</button>
    </div>
    <div class="list" aria-label="Database designs">
      <div class="lgrid designs lhead">
        <button v-for="h in HEADS" :key="h.key" class="hsort" :class="{ r: h.right, on: sortKey === h.key }" :title="'Sort by ' + h.label.toLowerCase() + '. A third click returns to your own order.'" @click="sortDesignsBy(project, h.key)">{{ h.label }}<Icon v-if="sortKey === h.key" name="chevron" :class="{ flip: !project.sort!.desc }" /></button>
        <span></span>
      </div>
      <div v-if="creating" class="lgrid designs lrow newrow">
        <span class="lname"><span class="mono-ic">+</span><input id="new-design" v-model="newName" class="tf" aria-label="New design name" placeholder="design_name" spellcheck="false" @keydown.enter.prevent="confirmNew" @keydown.esc.prevent="creating = false" /></span>
        <select v-model="newEngine" class="selbox" aria-label="Database engine"><option v-for="e in ENGINES" :key="e" :value="e">{{ e }}</option></select>
        <span class="r hint">Enter to open</span>
        <span class="r hint">Esc to cancel</span>
        <span></span>
      </div>
      <template v-for="d in rows" :key="d.id">
        <div v-if="deleting === d.id" class="lgrid designs lrow newrow">
          <span class="confirm"><span class="q">Delete “{{ d.name }}” and its {{ plural(d.tables.length, "table") }}? This cannot be undone.</span><button class="btn danger" @click="deleteDesign(project, d); deleting = ''">Delete</button><button class="btn" @click="deleting = ''">Cancel</button></span>
        </div>
        <div v-else-if="renaming === d.id" class="lgrid designs lrow newrow">
          <span class="lname"><span class="mono-ic">{{ designMono(d.name) }}</span><input id="rename-design" v-model="renameText" class="tf" aria-label="Design name" spellcheck="false" @keydown.enter.prevent="confirmRename(d)" @keydown.esc.prevent="renaming = ''" @blur="confirmRename(d)" /></span>
          <span class="eng">{{ d.engine }}</span>
          <span class="r hint">Enter to rename</span>
          <span class="r hint">Esc to cancel</span>
          <span></span>
        </div>
        <div v-else class="lgrid designs lrow" :class="{ dragging: drag && drag.id === d.id, 'drop-before': drag && rows[drag.to] === d, 'drop-after': drag && drag.to === rows.length && rows[rows.length - 1] === d }" :data-did="d.id" @mousedown="rowDown($event, d)">
          <button class="lname lopen" :title="'Open ' + d.name + ' in the editor. Drag to reorder.'" @click="open(d)"><span class="mono-ic">{{ designMono(d.name) }}</span><span class="t">{{ d.name }}</span></button>
          <span class="eng">{{ d.engine }}</span>
          <span class="r num">{{ d.tables.length }}</span>
          <span class="r num">{{ formatModified(d.modified, store.now) }}</span>
          <span class="lact" :class="{ open: menuFor === d.id }">
            <button class="ibtn" :aria-label="'Actions for ' + d.name" title="More actions" aria-haspopup="menu" :aria-expanded="menuFor === d.id" @click="menuFor = menuFor === d.id ? '' : d.id"><Icon name="more" /></button>
            <div v-if="menuFor === d.id" class="pop rowpop" role="menu">
              <button class="pi" role="menuitem" @click="startRename(d)">Rename</button>
              <button class="pi" role="menuitem" @click="menuFor = ''; duplicateDesign(project, d)">Duplicate</button>
              <div class="psep"></div>
              <button class="pi danger" role="menuitem" @click="menuFor = ''; deleting = d.id">Delete design</button>
            </div>
          </span>
        </div>
      </template>
      <div v-if="!rows.length && q.trim()" class="empty">No designs match “{{ q }}”.</div>
      <div v-else-if="!rows.length && !creating" class="empty">No designs yet. Choose New design to create one.</div>
    </div>
  </main>
</template>
