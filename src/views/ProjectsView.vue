<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "../components/Icon.vue";
import { keyOf } from "../keys";
import { createProject, deleteProject, formatModified, moveProject, onDisk, openProject, openProjectFolder, pickFolder, plural, previewPath, projectsSorted, renameProject, sortProjectsBy, store } from "../store";
import type { Project, ProjectSortKey } from "../types";

const q = ref("");
const creating = ref(false);
const newName = ref("");
// Folder the new project goes into; empty means the default projects folder.
const newParent = ref("");
const menuFor = ref("");
const renaming = ref("");
const renameText = ref("");
const deleting = ref("");

const HEADS: { key: ProjectSortKey; label: string; right?: boolean }[] = [{ key: "name", label: "Name" }, { key: "designs", label: "Designs", right: true }, { key: "modified", label: "Last modified", right: true }];

const rows = computed(() => {
  const s = q.value.trim().toLowerCase();
  return projectsSorted.value.filter((p) => !s || p.name.toLowerCase().includes(s));
});
const focus = (sel: string) => nextTick(() => { const el = document.querySelector<HTMLInputElement>(sel); el?.focus(); el?.select(); });

function startNew() {
  creating.value = true;
  newName.value = "";
  newParent.value = "";
  focus("#new-project");
}
function cancelNew() { creating.value = false; }
async function chooseNewFolder() {
  const dir = await pickFolder(newParent.value || store.root);
  if (dir) newParent.value = dir;
  focus("#new-project");
}
async function confirmNew() {
  const n = newName.value.trim();
  if (!n) return;
  await createProject(n, newParent.value || undefined);
  cancelNew();
}
function startRename(p: Project) {
  menuFor.value = "";
  renaming.value = p.id;
  renameText.value = p.name;
  focus("#rename-project");
}
function confirmRename(p: Project) {
  if (renaming.value !== p.id) return;
  const n = renameText.value.trim();
  renaming.value = "";
  if (n && n !== p.name) void renameProject(p, n);
}
async function changeFolder(p: Project) {
  menuFor.value = "";
  const dir = await pickFolder(p.path);
  if (dir) await moveProject(p, dir);
}
async function confirmDelete(p: Project) {
  deleting.value = "";
  await deleteProject(p);
}
function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && keyOf(e) === "n") { e.preventDefault(); startNew(); }
  else if (e.key === "Escape") { menuFor.value = ""; deleting.value = ""; }
}
function onDocDown(e: MouseEvent) {
  if (menuFor.value && !(e.target as HTMLElement).closest(".lact")) menuFor.value = "";
}
onMounted(() => { window.addEventListener("keydown", onKey); window.addEventListener("mousedown", onDocDown, true); });
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDocDown, true); });
</script>

<template>
  <main class="main">
    <div class="page-h">
      <h1 class="page-t">Projects <span class="n">{{ store.projects.length }}</span></h1>
      <div class="grow"></div>
      <div class="search">
        <Icon name="search" class="s-ico" />
        <input v-model="q" class="tf" type="text" placeholder="Search projects" aria-label="Search projects" />
      </div>
      <button v-if="onDisk" class="btn" title="Open a project from another folder" @click="openProjectFolder">Open…</button>
      <button class="btn primary" title="New project (Ctrl+N)" @click="startNew"><Icon name="plus" />New project</button>
    </div>
    <div class="list" aria-label="Projects">
      <div class="lgrid lhead">
        <button v-for="h in HEADS" :key="h.key" class="hsort" :class="{ r: h.right, on: store.projectSort.key === h.key }" :title="'Sort by ' + h.label.toLowerCase()" @click="sortProjectsBy(h.key)">{{ h.label }}<Icon v-if="store.projectSort.key === h.key" name="chevron" :class="{ flip: !store.projectSort.desc }" /></button>
        <span></span>
      </div>
      <template v-if="creating">
        <div class="lgrid lrow newrow" :style="onDisk ? 'border-bottom: 0' : ''">
          <span class="lname"><Icon name="project" class="ic" /><input id="new-project" v-model="newName" class="tf" aria-label="New project name" placeholder="Project name" @keydown.enter.prevent="confirmNew" @keydown.esc.prevent="cancelNew" /></span>
          <span class="r hint">Enter to create</span>
          <span class="r hint">Esc to cancel</span>
          <span></span>
        </div>
        <div v-if="onDisk" class="newpath"><span>Saves to</span><span class="p" :title="previewPath(newParent || store.root, newName)">{{ previewPath(newParent || store.root, newName) }}</span><button class="linkbtn" @click="chooseNewFolder">Choose another folder…</button></div>
      </template>
      <template v-for="p in rows" :key="p.id">
        <div v-if="deleting === p.id" class="lgrid lrow newrow">
          <span class="confirm"><span class="q">Delete “{{ p.name }}” and its {{ plural(p.designs.length, "design") }}? This cannot be undone.</span><button class="btn danger" @click="confirmDelete(p)">Delete</button><button class="btn" @click="deleting = ''">Cancel</button></span>
        </div>
        <div v-else-if="renaming === p.id" class="lgrid lrow newrow">
          <span class="lname"><Icon name="project" class="ic" /><input id="rename-project" v-model="renameText" class="tf" aria-label="Project name" @keydown.enter.prevent="confirmRename(p)" @keydown.esc.prevent="renaming = ''" @blur="confirmRename(p)" /></span>
          <span class="r hint">Enter to rename</span>
          <span class="r hint">Esc to cancel</span>
          <span></span>
        </div>
        <div v-else class="lgrid lrow" :title="p.path">
          <button class="lname lopen" @click="openProject(p.id)"><Icon name="project" class="ic" /><span class="t">{{ p.name }}</span></button>
          <span class="r num">{{ p.designs.length }}</span>
          <span class="r num">{{ formatModified(p.modified, store.now) }}</span>
          <span class="lact" :class="{ open: menuFor === p.id }">
            <button class="ibtn" :aria-label="'Actions for ' + p.name" title="More actions" aria-haspopup="menu" :aria-expanded="menuFor === p.id" @click="menuFor = menuFor === p.id ? '' : p.id"><Icon name="more" /></button>
            <div v-if="menuFor === p.id" class="pop rowpop" role="menu">
              <button class="pi" role="menuitem" @click="startRename(p)">Rename</button>
              <button class="pi" role="menuitem" @click="menuFor = ''; store.projectSettingsId = p.id">Project settings…</button>
              <template v-if="onDisk">
                <button class="pi" role="menuitem" @click="changeFolder(p)">Move to another folder…</button>
                <div class="pathline" :title="p.path">&lrm;{{ p.path }}</div>
              </template>
              <div class="psep"></div>
              <button class="pi danger" role="menuitem" @click="menuFor = ''; deleting = p.id">Delete project</button>
            </div>
          </span>
        </div>
      </template>
      <div v-if="!rows.length && q.trim()" class="empty">No projects match “{{ q }}”.</div>
      <div v-else-if="!rows.length && !creating" class="empty">No projects yet. Choose New project to create one.</div>
    </div>
  </main>
</template>
