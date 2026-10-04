<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { convertDesign } from "../convert";
import type { Editor } from "../editor/useEditor";
import type { Design } from "../types";
import { ENGINES } from "../engines";
import { generateSql } from "../sql/export";
import { highlightSql } from "../sql/highlight";
import { plural } from "../store";
import { saveFile } from "../storage";
import Icon from "./Icon.vue";

const props = defineProps<{ ed: Editor; mode: "export" | "import" }>();
const emit = defineEmits<{ close: [] }>();

// The script can be generated for another engine without changing the design itself.
const engine = ref(props.ed.design.engine);
const sql = computed(() => {
  if (props.mode !== "export") return "";
  const copy = JSON.parse(JSON.stringify(props.ed.design)) as Design;
  convertDesign(copy, engine.value);
  return generateSql(copy);
});
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") { e.stopPropagation(); emit("close"); }
}
onMounted(() => window.addEventListener("keydown", onKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey, true));
const text = ref("");
const note = ref("");

async function copy() {
  await navigator.clipboard.writeText(sql.value);
  note.value = "Copied to the clipboard";
}
async function saveSql() {
  if (await saveFile(props.ed.design.name + ".sql", "sql", "SQL script", sql.value)) note.value = "Saved";
}
async function openFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) text.value = await f.text();
}
function runImport() {
  const r = props.ed.importSql(text.value);
  if (!r.tables && !r.rels && !r.enums) { note.value = "No CREATE TABLE statements were found."; return; }
  const parts = [plural(r.tables, "table"), plural(r.rels, "relationship")];
  if (r.enums) parts.push(plural(r.enums, "enum"));
  props.ed.st.notice = "Imported " + parts.join(", ") + (r.skipped ? " · " + plural(r.skipped, "statement") + " skipped" : "");
  emit("close");
}
</script>

<template>
  <div class="modal-back" @mousedown.self="emit('close')">
    <div class="modal" role="dialog" aria-modal="true" :aria-label="mode === 'export' ? 'Export SQL' : 'Import SQL'">
      <div class="modal-h">
        <span>{{ mode === "export" ? "Export SQL" : "Import SQL" }}</span><span class="sub">{{ ed.design.name }}<template v-if="mode === 'import'"> · {{ ed.design.engine }}</template></span>
        <select v-if="mode === 'export'" v-model="engine" class="selbox" aria-label="Export for engine" title="Engine to generate SQL for"><option v-for="e in ENGINES" :key="e" :value="e">{{ e }}</option></select>
        <span class="grow"></span>
        <button class="ibtn" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
      </div>
      <div class="modal-b">
        <pre v-if="mode === 'export'" class="code" v-html="highlightSql(sql)"></pre>
        <textarea v-else v-model="text" class="code" spellcheck="false" aria-label="SQL to import" placeholder="Paste CREATE TABLE statements here, or open a .sql file"></textarea>
      </div>
      <div class="modal-f">
        <span>{{ note }}</span><span class="grow"></span>
        <template v-if="mode === 'export'">
          <button class="btn" @click="copy">Copy</button>
          <button class="btn primary" @click="saveSql">Save as…</button>
        </template>
        <template v-else>
          <label class="btn">Open file…<input type="file" accept=".sql,.txt" hidden @change="openFile" /></label>
          <button class="btn primary" :disabled="!text.trim()" @click="runImport">Import</button>
        </template>
      </div>
    </div>
  </div>
</template>
