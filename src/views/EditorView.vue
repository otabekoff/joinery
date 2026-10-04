<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import EditorInspector from "../components/EditorInspector.vue";
import Icon from "../components/Icon.vue";
import ShortcutsDialog from "../components/ShortcutsDialog.vue";
import SqlDialog from "../components/SqlDialog.vue";
import TypePicker from "../components/TypePicker.vue";
import { diagramPng, diagramSvg } from "../editor/image";
import { W, tableHeight } from "../editor/geometry";
import { useEditor } from "../editor/useEditor";
import { ENGINES } from "../engines";
import { keyOf } from "../keys";
import { saveFile } from "../storage";
import { mode, statusVisible } from "../store";
import { deleteDesign, designMono, designName, duplicateDesign, openDesign, openProject, plural, renameDesign, store } from "../store";
import type { Design, EnumType, Project } from "../types";

const props = defineProps<{ project: Project; design: Design }>();
const ed = useEditor(props.design);
const st = ed.st;
const { searchModel, ghostView, menu, edges } = ed;
const setVp = (el: unknown) => { ed.vpEl.value = el as HTMLElement | null; };

const value = (e: Event) => (e.target as HTMLInputElement).value;

function onNameKey(e: KeyboardEvent) {
  if (e.key === "Enter") { e.preventDefault(); (document.querySelector(".entry .e-name") as HTMLElement | null)?.focus(); }
  else if (e.key === "Escape") { e.preventDefault(); ed.finishDraft(); }
}
function onEntryNameKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    if (!st.entry || !st.entry.name.trim()) ed.finishDraft();
    else if (st.entry.type.trim()) ed.commitEntry();
    else (document.querySelector(".entry .e-type") as HTMLElement | null)?.focus();
  } else if (e.key === "Escape") { e.preventDefault(); ed.finishDraft(); }
}
function runMenu(act: () => void) {
  st.cm = null;
  act();
}

/* design menu */
const renaming = ref(false);
const renameText = ref("");
const engineOpen = ref(false);
const confirmDelete = ref(false);
const dialog = ref<"export" | "import" | null>(null);

function toggleMenu(m: "design" | "types" | "file" | "issues") {
  st.menu = st.menu === m ? null : m;
  engineOpen.value = false;
  confirmDelete.value = false;
}
function startRename() {
  st.menu = null;
  renameText.value = props.design.name;
  renaming.value = true;
  nextTick(() => { const el = document.querySelector<HTMLInputElement>(".dname-in"); el?.focus(); el?.select(); });
}
function finishRename(apply: boolean) {
  if (!renaming.value) return;
  renaming.value = false;
  const n = designName(renameText.value);
  if (apply && n && n !== props.design.name) renameDesign(props.project, props.design, n);
}
function onShortcut(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && keyOf(e) === "n" && !document.querySelector(".modal-back")) { e.preventDefault(); openProject(props.project.id, true); }
}
onMounted(() => window.addEventListener("keydown", onShortcut));
onBeforeUnmount(() => window.removeEventListener("keydown", onShortcut));
function duplicate() {
  const d = duplicateDesign(props.project, props.design);
  openDesign(props.project.id, d.id);
}

/* enum types */
function renameEnum(e: EnumType, v: string) {
  const name = designName(v);
  props.design.tables.forEach((t) => t.cols.forEach((c) => { if (c.type === e.name) c.type = name; }));
  ed.edit(e, { name });
}
function setEnumValues(e: EnumType, v: string) {
  ed.edit(e, { values: v.split(",").map((x) => x.trim()).filter(Boolean) });
}

/* file menu */
async function exportImage(kind: "png" | "svg") {
  st.menu = null;
  try {
    const data = kind === "png" ? await diagramPng(props.design) : diagramSvg(props.design).svg;
    if (await saveFile(props.design.name + "." + kind, kind, kind === "png" ? "PNG image" : "SVG image", data)) st.notice = "Exported " + props.design.name + "." + kind;
  } catch (e) {
    st.notice = "Export failed: " + (e instanceof Error ? e.message : String(e));
  }
}
function openDialog(d: "export" | "import") {
  st.menu = null;
  dialog.value = d;
}
</script>

<template>
  <main class="main">
    <div class="toolbar" role="toolbar" aria-label="Design tools">
      <div class="tb-menu">
        <input v-if="renaming" v-model="renameText" class="dname-in" aria-label="Design name" spellcheck="false" @keydown.enter.prevent="finishRename(true)" @keydown.esc.prevent.stop="finishRename(false)" @blur="finishRename(true)" />
        <button v-else class="dname" title="Design menu" aria-haspopup="menu" :aria-expanded="st.menu === 'design'" @click="toggleMenu('design')"><Icon name="database" class="ic" /><span>{{ design.name }}</span><span class="eng">{{ design.engine }}</span><Icon name="chevron" class="ic" /></button>
        <div v-if="st.menu === 'design'" class="pop dpop" role="menu" aria-label="Design menu">
          <div class="pop-scroll" style="max-height: 420px">
            <div class="pg">{{ project.name }}</div>
            <button v-for="d in project.designs" :key="d.id" class="pi mono" :class="{ hi: d.id === design.id }" role="menuitem" @click="openDesign(project.id, d.id)"><span class="mono-ic">{{ designMono(d.name) }}</span><span class="pi-n">{{ d.name }}</span><span class="pi-k">{{ plural(d.tables.length, "table") }}</span></button>
            <div class="psep"></div>
            <button class="pi" role="menuitem" @click="startRename">Rename<span class="pi-k">{{ design.name }}</span></button>
            <button class="pi" role="menuitem" :aria-expanded="engineOpen" @click="engineOpen = !engineOpen">Change engine<span class="pi-k">{{ design.engine }}</span></button>
            <template v-if="engineOpen">
              <button v-for="e in ENGINES" :key="e" class="pi" role="menuitemradio" :aria-checked="e === design.engine" @click="ed.changeEngine(e)"><span class="check"><Icon v-if="e === design.engine" name="check" /></span>{{ e }}</button>
              <div class="pempty">Column types and defaults are converted where the new engine has an equivalent. Undo history is cleared.</div>
            </template>
            <button class="pi" role="menuitem" @click="duplicate">Duplicate</button>
            <button class="pi" role="menuitem" @click="openProject(project.id, true)">New design<span class="pi-k">Ctrl+N</span></button>
            <div class="psep"></div>
            <button v-if="!confirmDelete" class="pi danger" role="menuitem" @click="confirmDelete = true">Delete design</button>
            <div v-else class="confirm" style="padding: 4px 8px"><span class="q">Delete “{{ design.name }}”?</span><button class="btn danger" @click="deleteDesign(project, design)">Delete</button><button class="btn" @click="confirmDelete = false">Cancel</button></div>
          </div>
        </div>
      </div>
      <div class="vsep"></div>
      <button class="btn primary" title="Add table (T)" aria-label="Add table" @click="ed.addTable()"><Icon name="addTable" /><span class="tb-lbl">Add table</span></button>
      <button class="ibtn" aria-label="Undo" title="Undo (Ctrl+Z)" :disabled="!st.past.length" @click="ed.undo"><Icon name="undo" /></button>
      <button class="ibtn" aria-label="Redo" title="Redo (Ctrl+Y)" :disabled="!st.future.length" @click="ed.redo"><Icon name="redo" /></button>
      <div class="vsep"></div>
      <button class="btn subtle" title="Auto layout — tidy spacing and reduce crossings (Ctrl+Shift+L)" aria-label="Auto layout" @click="ed.autoLayout"><Icon name="layout" /><span class="tb-lbl">Auto layout</span></button>
      <div class="tb-menu">
        <button class="btn subtle" title="Enum types in this design" aria-haspopup="dialog" :aria-expanded="st.menu === 'types'" @click="toggleMenu('types')"><Icon name="types" /><span class="tb-lbl">Types</span></button>
        <div v-if="st.menu === 'types'" class="pop typespop" role="dialog" aria-label="Enum types">
          <div class="pg" style="padding: 0 0 6px">Enums in this design</div>
          <div v-for="(e, i) in design.enums" :key="i" class="enumrow">
            <input class="tf mono" aria-label="Enum name" spellcheck="false" :value="e.name" @change="renameEnum(e, value($event))" />
            <input class="tf" aria-label="Enum values, separated by commas" placeholder="value, value, …" spellcheck="false" :value="e.values.join(', ')" @change="setEnumValues(e, value($event))" />
            <button class="ibtn sm" :aria-label="'Delete ' + e.name" title="Delete enum" @click="ed.removeEnum(i)"><Icon name="trash" :size="14" /></button>
          </div>
          <div v-if="!design.enums.length" class="pempty">No enum types yet. Columns can use any enum defined here as their data type.</div>
          <button class="addrow" @click="ed.addEnum"><Icon name="plus" :size="14" />Add enum</button>
        </div>
      </div>
      <div class="tb-menu">
        <button class="btn subtle" title="Import and export" aria-haspopup="menu" :aria-expanded="st.menu === 'file'" @click="toggleMenu('file')"><Icon name="file" /><span class="tb-lbl">File</span></button>
        <div v-if="st.menu === 'file'" class="pop" role="menu" aria-label="Import and export" style="min-width: 200px">
          <button class="pi" role="menuitem" @click="openDialog('import')">Import SQL…</button>
          <div class="psep"></div>
          <button class="pi" role="menuitem" @click="openDialog('export')">Export SQL…</button>
          <button class="pi" role="menuitem" @click="exportImage('png')">Export PNG image…</button>
          <button class="pi" role="menuitem" @click="exportImage('svg')">Export SVG image…</button>
          <div class="psep"></div>
          <button class="pi" role="menuitem" @click="st.menu = null; st.help = true">Keyboard shortcuts<span class="pi-k">?</span></button>
        </div>
      </div>
      <div class="grow"></div>
      <div class="search">
        <Icon name="search" class="s-ico" />
        <input id="ed-search" class="tf" :class="{ focus: st.search.open }" type="text" placeholder="Search tables and columns" aria-label="Search tables and columns" role="combobox" :aria-expanded="st.search.open" autocomplete="off" spellcheck="false" :value="st.search.q" @focus="ed.searchFocus" @blur="st.search.open = false" @input="ed.searchInput(value($event))" @keydown="ed.searchKey" />
        <span class="kbd s-kbd">Ctrl+K</span>
        <div v-if="st.search.open" class="pop spop" role="listbox" aria-label="Search results">
          <template v-if="searchModel.tabs.length">
            <div class="pg">Tables</div>
            <button v-for="(t, i) in searchModel.tabs" :key="t.id" class="pi" :class="{ hi: i === st.search.hi }" role="option" :aria-selected="i === st.search.hi" @mousedown.prevent @click="ed.goResult({ t: t.id })">
              <Icon name="table" class="ic" /><span class="pi-n">{{ ed.matchParts(t.name || t.id).pre }}<span class="mk">{{ ed.matchParts(t.name || t.id).mid }}</span>{{ ed.matchParts(t.name || t.id).post }}</span><span class="pi-k">{{ plural(t.cols.length, "column") }}</span>
            </button>
          </template>
          <template v-if="searchModel.cols.length">
            <div class="pg">Columns</div>
            <button v-for="(x, i) in searchModel.cols" :key="x.t.id + '.' + x.c.id" class="pi" :class="{ hi: i + searchModel.tabs.length === st.search.hi }" role="option" :aria-selected="i + searchModel.tabs.length === st.search.hi" @mousedown.prevent @click="ed.goResult({ t: x.t.id, c: x.c.id })">
              <Icon name="column" class="ic" /><span class="pi-n"><span class="pi-sub">{{ x.t.name }}.</span>{{ ed.matchParts(x.c.name).pre }}<span class="mk">{{ ed.matchParts(x.c.name).mid }}</span>{{ ed.matchParts(x.c.name).post }}</span><span class="pi-k mono">{{ x.c.type }}</span>
            </button>
          </template>
          <div v-if="!searchModel.flat.length" class="pempty">{{ st.search.q.trim() ? `No tables or columns match “${st.search.q}”` : "This design has no tables yet" }}</div>
          <div class="pfoot"><span>↑↓ Navigate</span><span>Enter Go to</span><span>Esc Close</span></div>
        </div>
      </div>
      <div class="vsep"></div>
      <button class="ibtn" aria-label="Zoom out" title="Zoom out (Ctrl+−)" @click="ed.zoomBy(1 / 1.2)"><Icon name="minus" /></button>
      <button class="zoomval" title="Reset zoom to 100% (Ctrl+0)" @click="ed.resetZoom">{{ Math.round(st.zoom * 100) }}%</button>
      <button class="ibtn" aria-label="Zoom in" title="Zoom in (Ctrl+=)" @click="ed.zoomBy(1.2)"><Icon name="plus" /></button>
      <button class="ibtn" aria-label="Fit view" title="Fit entire schema (Shift+1)" @click="ed.fit()"><Icon name="fit" /></button>
    </div>

    <div class="work">
      <div :ref="setVp" class="viewport" tabindex="0" aria-label="Schema canvas. Drag to pan, Shift+drag to select, Ctrl+scroll to zoom." :style="{ backgroundSize: ed.gridSize.value + 'px ' + ed.gridSize.value + 'px', backgroundPosition: st.panX + 'px ' + st.panY + 'px' }" @mousedown="ed.vpDown" @wheel.prevent="ed.vpWheel" @contextmenu.prevent="ed.vpMenu" @pointerdown="ed.onPointerDown" @pointermove="ed.onPointerMove" @pointerup="ed.onPointerUp" @pointercancel="ed.onPointerUp">
        <div class="world" :style="{ transform: `translate(${st.panX}px, ${st.panY}px) scale(${st.zoom})` }">
          <svg v-for="r in edges" :key="r.id" class="edge" :class="r.cls" width="1" height="1" aria-hidden="true">
            <path class="e-hit" :d="r.d" @mousedown.stop="ed.selectRel($event, r.id)" @contextmenu.prevent.stop="ed.relMenu($event, r.id)" /><path class="e-line" :d="r.d" /><path class="e-mark" :d="r.marks" /><path class="e-opt" :d="r.opt" />
          </svg>
          <div v-for="n in design.notes || []" :key="n.id" class="note" :data-nid="n.id" :style="{ left: n.x + 'px', top: n.y + 'px' }" @mousedown.stop @contextmenu.stop>
            <div class="note-h" title="Drag to move" @mousedown.stop="ed.onNoteDown($event, n)"><button class="note-x" aria-label="Delete note" title="Delete note" @mousedown.stop @click="ed.removeNote(n)"><Icon name="close" :size="14" /></button></div>
            <textarea aria-label="Note" placeholder="Note" spellcheck="false" :value="n.text" @input="ed.edit(n, { text: value($event) })" @wheel.stop></textarea>
          </div>
          <svg v-if="ghostView" class="edge" width="1" height="1" aria-hidden="true"><path class="ghost" :d="ghostView.d" /><circle class="ghost-end" :cx="ghostView.ex" :cy="ghostView.ey" r="3.5" /></svg>

          <div v-for="t in design.tables" :key="t.id" class="tn" :class="ed.tableCls(t)" tabindex="0" :data-tid="t.id" :aria-label="'Table ' + t.name" :style="{ left: t.x + 'px', top: t.y + 'px', width: W + 'px' }" @contextmenu.prevent.stop="ed.tableMenu($event, t.id)">
            <div class="tn-h" @mousedown.stop="ed.onHeadDown($event, t.id)">
              <input v-if="t.draft" class="tn-name-in" aria-label="Table name" placeholder="table_name" spellcheck="false" :value="t.name" @input="ed.setTableName(t, value($event))" @keydown="onNameKey" />
              <template v-else><span class="tn-name">{{ t.name }}</span><span class="tn-count">{{ t.cols.length }}</span></template>
            </div>
            <div class="tn-rows">
              <div v-for="c in t.cols" :key="c.id" class="row" :class="ed.colCls(t, c)" :title="ed.colTip(t, c)" @mousedown.stop="ed.onRowDown($event, t, c)" @mouseenter="ed.onRowEnter(t, c)" @mouseleave="ed.onRowLeave(t, c)">
                <span class="ico" :class="c.pk ? 'pk' : ed.fkOf(t, c) ? 'fk' : ''"><Icon v-if="c.pk" name="key" /><Icon v-else-if="ed.fkOf(t, c)" name="link" /></span>
                <span class="cname" :class="{ b: c.pk }">{{ c.name }}</span>
                <span class="ctype">{{ c.type }}</span>
                <span class="flag">{{ c.nullable ? "?" : "" }}</span>
                <span class="uqs"><span v-if="c.unique && !c.pk" class="uq">U</span></span>
                <span class="handle" title="Drag to a column in another table to create a relationship" @mousedown.stop.prevent="ed.onHandleDown($event, t, c)"></span>
              </div>
            </div>
            <template v-if="st.entry && st.entry.tid === t.id">
              <div class="entry" @mousedown.stop>
                <input v-model="st.entry.name" class="e-name" aria-label="New column name" placeholder="column_name" spellcheck="false" @keydown="onEntryNameKey" />
                <input class="e-type" :class="{ focus: st.picker && st.picker.where === 'draft' }" aria-label="New column data type" placeholder="type" role="combobox" :aria-expanded="!!st.picker && st.picker.where === 'draft'" autocomplete="off" spellcheck="false" :value="st.entry.type" @focus="ed.openDraftPicker" @blur="st.picker = null" @input="ed.setEntryType(value($event))" @keydown="ed.pickerKey($event, 'draft')" />
                <TypePicker v-if="st.picker && st.picker.where === 'draft'" :ed="ed" enter-label="Add column" class="typepick" :class="{ up: ed.draftPickUp(t) }" />
              </div>
              <div class="entry-hint" @mousedown.stop><span>Enter adds column · Tab to type</span><button @click="ed.finishDraft">Done</button></div>
            </template>
          </div>

          <template v-if="ed.selEnds.value">
            <div class="e-end" title="Drag to another column to reconnect this end" :style="{ left: ed.selEnds.value.a[0] - 6 + 'px', top: ed.selEnds.value.a[1] - 6 + 'px' }" @mousedown.stop.prevent="ed.onEndDown($event, ed.selEnds.value.rel, 'from')"></div>
            <div class="e-end" title="Drag to another column to reconnect this end" :style="{ left: ed.selEnds.value.b[0] - 6 + 'px', top: ed.selEnds.value.b[1] - 6 + 'px' }" @mousedown.stop.prevent="ed.onEndDown($event, ed.selEnds.value.rel, 'to')"></div>
          </template>
          <div v-if="ghostView && ghostView.tip" class="ghost-tip" :style="{ left: ghostView.tx + 'px', top: ghostView.ty + 'px' }"><span class="m">{{ ghostView.label }}</span><span :class="{ ok: ghostView.ok }">{{ ghostView.match }}</span></div>
        </div>

        <div v-if="!design.tables.length" class="canvas-empty">No tables yet. Press T or choose Add table to start.</div>
        <svg v-if="design.tables.length && store.showMinimap && !store.zen" class="minimap" :style="{ right: ((mode !== 'wide' || store.zen) && ed.showInsp.value ? 312 : 12) + 'px' }" :viewBox="ed.miniBox.value.x + ' ' + ed.miniBox.value.y + ' ' + ed.miniBox.value.w + ' ' + ed.miniBox.value.h" preserveAspectRatio="none" aria-label="Overview. Click or drag to move the view." @mousedown.stop.prevent="ed.miniDown" @wheel.stop @contextmenu.prevent.stop>
          <rect v-for="t in design.tables" :key="t.id" class="mm-t" :class="{ on: ed.isSelected(t) }" :x="t.x" :y="t.y" :width="W" :height="tableHeight(t)" rx="8" />
          <rect class="mm-v" :x="ed.miniView.value.x" :y="ed.miniView.value.y" :width="ed.miniView.value.w" :height="ed.miniView.value.h" />
        </svg>
        <div v-if="st.marquee" class="marquee" :style="{ left: st.marquee.x + 'px', top: st.marquee.y + 'px', width: st.marquee.w + 'px', height: st.marquee.h + 'px' }"></div>
        <div v-if="menu" class="pop cmenu" role="menu" :aria-label="menu.label" :style="{ left: menu.x + 'px', top: menu.y + 'px' }" @mousedown.stop @wheel.stop @contextmenu.prevent.stop>
          <template v-for="(m, i) in menu.items" :key="i">
            <div v-if="m.sep" class="psep"></div>
            <button v-else class="pi" :class="{ danger: m.danger }" role="menuitem" @click="runMenu(m.act)"><span>{{ m.label }}</span><span class="pi-k">{{ m.kbd }}</span></button>
          </template>
        </div>
      </div>

      <div v-if="ed.showRail.value" class="insp-rail"><button class="ibtn" aria-label="Show inspector" title="Show inspector" @click="ed.openInsp"><Icon name="panel" /></button></div>
      <EditorInspector v-if="ed.showInsp.value" :ed="ed" />
    </div>

    <div v-if="st.menu === 'issues'" class="pop issues tb-menu" role="menu" aria-label="Issues">
      <div class="pop-scroll"><button v-for="(p, i) in ed.problems.value" :key="i" class="pi" role="menuitem" @click="st.menu = null; ed.goProblem(p)">{{ p.text }}</button></div>
    </div>
    <footer v-if="statusVisible" class="status">
      <span>{{ ed.stats.value }}</span>
      <template v-if="ed.selText.value"><span class="vsep"></span><span>{{ ed.selText.value }}</span></template>
      <template v-if="st.notice"><span class="vsep"></span><span>{{ st.notice }}</span></template>
      <template v-if="ed.problems.value.length"><span class="vsep"></span><span class="tb-menu"><button class="linkbtn warn" title="Things that would make the exported SQL wrong" @click="toggleMenu('issues')">{{ plural(ed.problems.value.length, "issue") }}</button></span></template>
      <span class="grow"></span>
      <div class="legend" aria-label="Legend">
        <span class="lg"><span class="ico pk"><Icon name="key" /></span>Primary key</span>
        <span class="lg"><span class="ico fk"><Icon name="link" /></span>Foreign key</span>
        <span class="lg"><span class="m">?</span>Nullable</span>
        <span class="lg"><span class="uq">U</span>Unique</span>
      </div>
      <span class="vsep"></span>
      <span class="saved"><span class="dot" :class="{ pending: !store.saved }"></span>{{ store.saved ? "Saved" : "Saving…" }}</span>
    </footer>
    <ShortcutsDialog v-if="st.help" @close="st.help = false" />
    <SqlDialog v-if="dialog" :ed="ed" :mode="dialog" @close="dialog = null" />
  </main>
</template>
