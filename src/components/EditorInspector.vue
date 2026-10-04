<script setup lang="ts">
import { computed } from "vue";
import type { Editor } from "../editor/useEditor";
import { family } from "../engines";
import { FK_ACTIONS, type Rel, type Table } from "../types";
import Icon from "./Icon.vue";
import TypePicker from "./TypePicker.vue";

const props = defineProps<{ ed: Editor }>();
const st = props.ed.st;

const table = computed(() => props.ed.selTable.value);
const column = computed(() => props.ed.selColumnRef.value);
const rel = computed(() => props.ed.relView.value);
const multi = computed(() => props.ed.multi.value);
const pickOpen = computed(() => !!st.picker && st.picker.where === "insp");
const columnRef = computed(() => {
  const x = column.value;
  const r = x && props.ed.fkOf(x.t, x.c);
  const T = r && props.ed.design.tables.find((t) => t.id === r.to.t);
  if (!r || !T) return null;
  const c = T.cols.find((y) => y.id === r.to.c);
  return { rel: r, text: T.name + "." + (c ? c.name : "") };
});

const value = (e: Event) => (e.target as HTMLInputElement).value;

// The four endpoint dropdowns of a relationship: table and column on each side.
const ends = computed(() => {
  const v = rel.value;
  if (!v) return [];
  const side = (label: string, which: "from" | "to", key: string, t: Table, colName: string, r: Rel) => ({
    label,
    dds: [
      { key: key + "T", aria: (which === "from" ? "Source" : "Target") + " table", value: t.name,
        items: props.ed.design.tables.map((x) => ({ id: x.id, label: x.name, meta: "", hi: x.id === t.id, pick: () => props.ed.setRelEnd(r, which, "t", x.id) })) },
      { key: key + "C", aria: (which === "from" ? "Source" : "Target") + " column", value: colName,
        items: t.cols.map((c) => ({ id: c.id, label: c.name, meta: c.type, hi: c.id === r[which].c, pick: () => props.ed.setRelEnd(r, which, "c", c.id) })) },
    ],
  });
  const action = (key: "onDelete" | "onUpdate", aria: string) => ({
    key, aria, value: v.rel[key] || "NO ACTION",
    items: FK_ACTIONS.map((a) => ({ id: a, label: a, meta: "", hi: a === (v.rel[key] || "NO ACTION"), pick: () => props.ed.setRelAction(v.rel, key, a) })),
  });
  return [
    side("Source · foreign key", "from", "src", v.S, v.srcCol, v.rel),
    side("Target · referenced key", "to", "tgt", v.T, v.tgtCol, v.rel),
    { label: "On delete · On update", dds: [action("onDelete", "On delete"), action("onUpdate", "On update")] },
    { label: "Type", dds: [{ key: "kind", aria: "Relationship type", value: v.rel.one ? "One to one" : "One to many",
      items: [
        { id: "many", label: "One to many", meta: "one " + v.T.name + ", many " + v.S.name, hi: !v.rel.one, pick: () => props.ed.setRelOne(v.rel, false) },
        { id: "one", label: "One to one", meta: "foreign key is unique", hi: !!v.rel.one, pick: () => props.ed.setRelOne(v.rel, true) },
        { id: "m2m", label: "Many to many", meta: "adds a junction table", hi: false, pick: () => props.ed.toManyToMany(v.rel) },
      ] }] },
  ];
});
</script>

<template>
  <aside class="insp" :class="{ overlay: ed.inspOver.value }" aria-label="Inspector">
    <template v-if="table">
      <div class="insp-h">
        <span class="insp-k">Table</span><span class="grow"></span>
        <button class="ibtn sm" aria-label="Delete table" title="Delete table (Del)" @click="ed.deleteSel"><Icon name="trash" :size="14" /></button>
        <button class="ibtn sm" aria-label="Collapse inspector" title="Collapse inspector" @click="ed.closeInsp"><Icon name="panel" :size="14" /></button>
      </div>
      <div class="insp-b">
        <div class="field"><label for="ti-name">Name</label><input id="ti-name" class="tf mono" spellcheck="false" :value="table.name" @input="ed.setTableName(table, value($event))" /></div>
        <div class="field"><label for="ti-comment">Comment</label><input id="ti-comment" class="tf" placeholder="None" :value="table.comment || ''" @input="ed.edit(table, { comment: value($event) })" /></div>
        <div class="sec">
          <div class="sec-h">Columns <span class="n">{{ table.cols.length }}</span><button class="ibtn sm" aria-label="Add column" title="Add column (Ctrl+Enter)" @click="ed.addColumn(table.id)"><Icon name="plus" :size="14" /></button></div>
          <div class="cgrid chead"><span></span><span>Name</span><span>Type</span><span class="flags"><span class="flh" title="Primary key">PK</span><span class="flh" title="Nullable">?</span><span class="flh" title="Unique">U</span></span></div>
          <div v-for="c in table.cols" :key="c.id" class="cgrid crow">
            <span class="ico" :class="c.pk ? 'pk' : ed.fkOf(table, c) ? 'fk' : ''"><Icon v-if="c.pk" name="key" /><Icon v-else-if="ed.fkOf(table, c)" name="link" /></span>
            <button class="cbtn" :class="{ b: c.pk }" :title="'Edit ' + c.name" @click="st.sel = { kind: 'column', t: table.id, c: c.id }; st.picker = null">{{ c.name }}</button>
            <span class="t" :title="c.type">{{ c.type }}</span>
            <span class="flags">
              <button class="fl" :class="{ on: c.pk }" aria-label="Primary key" title="Primary key" :aria-pressed="c.pk" @click="ed.toggleFlag(c, 'pk')">PK</button>
              <button class="fl" :class="{ on: c.nullable }" aria-label="Nullable" title="Nullable" :aria-pressed="c.nullable" @click="ed.toggleFlag(c, 'nullable')">?</button>
              <button class="fl" :class="{ on: c.unique }" aria-label="Unique" title="Unique" :aria-pressed="c.unique" @click="ed.toggleFlag(c, 'unique')">U</button>
            </span>
          </div>
          <button class="addrow" @click="ed.addColumn(table.id)"><Icon name="plus" :size="14" />Add column<span class="kbd" style="margin-left: auto">Ctrl+Enter</span></button>
        </div>
        <div class="sec">
          <div class="sec-h">Indexes <span class="n">{{ ed.indexes(table).length }}</span><button class="ibtn sm" aria-label="Add index" title="Add index" @click="ed.addIndex(table)"><Icon name="plus" :size="14" /></button></div>
          <template v-for="x in ed.indexes(table)" :key="x.key">
            <div class="irow" :class="{ click: x.def }" :title="x.def ? 'Edit index' : 'Created automatically'" @click="x.def && (st.idxEdit = st.idxEdit === x.def.id ? null : x.def.id)"><span class="nm">{{ x.name }}</span><span class="cl">({{ x.cols }})</span><span v-if="x.kind" class="badge">{{ x.kind }}</span></div>
            <div v-if="x.def && st.idxEdit === x.def.id" class="idxedit">
              <input class="tf mono" aria-label="Index name" spellcheck="false" :value="x.def.name" @input="ed.edit(x.def, { name: value($event) })" />
              <div class="idxcols"><button v-for="c in table.cols" :key="c.id" class="chip" :class="{ on: x.def.cols.includes(c.id) }" :aria-pressed="x.def.cols.includes(c.id)" @click="ed.toggleIndexCol(x.def, c.id)">{{ c.name }}</button></div>
              <div style="display: flex; align-items: center; gap: 8px"><label class="chk" style="flex: 1"><input type="checkbox" :checked="x.def.unique" @change="ed.toggleIndexUnique(x.def)" />Unique</label><button class="linkbtn" style="color: var(--danger)" @click="ed.removeIndex(table, x.def)">Delete index</button></div>
            </div>
          </template>
        </div>
      </div>
    </template>

    <template v-else-if="column">
      <div class="insp-h">
        <button class="crumbbtn" title="Back to table" @click="st.sel = { kind: 'tables', ids: [column.t.id] }; st.picker = null"><Icon name="back" />{{ column.t.name }}</button>
        <span class="insp-k"><span class="sub">/</span> Column</span><span class="grow"></span>
        <button class="ibtn sm" aria-label="Move column up" title="Move up (Alt+↑)" @click="ed.moveColumn(column.t, column.c, -1)"><Icon name="up" :size="14" /></button>
        <button class="ibtn sm" aria-label="Move column down" title="Move down (Alt+↓)" @click="ed.moveColumn(column.t, column.c, 1)"><Icon name="down" :size="14" /></button>
        <button class="ibtn sm" aria-label="Delete column" title="Delete column (Del)" @click="ed.deleteSel"><Icon name="trash" :size="14" /></button>
        <button class="ibtn sm" aria-label="Collapse inspector" title="Collapse inspector" @click="ed.closeInsp"><Icon name="panel" :size="14" /></button>
      </div>
      <div class="insp-b">
        <div class="field"><label for="ci-name">Name</label><input id="ci-name" class="tf mono" spellcheck="false" :value="column.c.name" @input="ed.edit(column.c, { name: value($event) })" /></div>
        <div class="field combo">
          <label for="ci-type">Data type</label>
          <input id="ci-type" class="tf mono" :class="{ focus: pickOpen }" role="combobox" :aria-expanded="pickOpen" aria-autocomplete="list" autocomplete="off" spellcheck="false" :value="pickOpen ? st.picker!.q : column.c.type" @focus="ed.openInspPicker(column.c.type)" @blur="st.picker = null" @input="st.picker = { where: 'insp', q: value($event), hi: 0 }" @keydown="ed.pickerKey($event, 'insp')" />
          <Icon name="chevron" class="chev" />
          <TypePicker v-if="pickOpen" :ed="ed" enter-label="Select" class="inpick" />
        </div>
        <div class="field"><label for="ci-def">Default value</label><input id="ci-def" class="tf mono" placeholder="None" spellcheck="false" :value="column.c.def" @input="ed.edit(column.c, { def: value($event) })" /></div>
        <div class="field"><label for="ci-comment">Comment</label><input id="ci-comment" class="tf" placeholder="None" :value="column.c.comment || ''" @input="ed.edit(column.c, { comment: value($event) })" /></div>
        <div class="sec">
          <label class="chk"><input type="checkbox" :checked="column.c.pk" @change="ed.toggleFlag(column.c, 'pk')" />Primary key</label>
          <label class="chk"><input type="checkbox" :checked="column.c.nullable" @change="ed.toggleFlag(column.c, 'nullable')" />Nullable</label>
          <label class="chk"><input type="checkbox" :checked="column.c.unique" @change="ed.toggleFlag(column.c, 'unique')" />Unique</label>
          <label v-if="family(ed.design.engine) !== 'postgres' || column.c.autoInc" class="chk"><input type="checkbox" :checked="!!column.c.autoInc" @change="ed.toggleFlag(column.c, 'autoInc')" />Auto increment</label>
        </div>
        <div v-if="columnRef" class="field">
          <span class="flabel">References</span>
          <div class="refline"><Icon name="link" /><button class="reflink" title="Select relationship" @click="st.sel = { kind: 'rel', id: columnRef.rel.id }">{{ columnRef.text }}</button></div>
        </div>
      </div>
    </template>

    <template v-else-if="rel">
      <div class="insp-h">
        <span class="insp-k">Relationship</span><span class="grow"></span>
        <button class="ibtn sm" aria-label="Delete relationship" title="Delete relationship (Del)" @click="ed.deleteSel"><Icon name="trash" :size="14" /></button>
        <button class="ibtn sm" aria-label="Collapse inspector" title="Collapse inspector" @click="ed.closeInsp"><Icon name="panel" :size="14" /></button>
      </div>
      <div class="insp-b">
        <div class="relsum"><span>{{ rel.srcText }}</span><span class="arr">→</span><span>{{ rel.tgtText }}</span></div>
        <div v-for="side in ends" :key="side.label" class="field">
          <span class="flabel">{{ side.label }}</span>
          <div class="pair">
            <div v-for="dd in side.dds" :key="dd.key" class="ddw">
              <button class="dd" :aria-label="dd.aria" aria-haspopup="listbox" :aria-expanded="st.dd === dd.key" @click="st.dd = st.dd === dd.key ? null : dd.key"><span class="v">{{ dd.value }}</span><Icon name="chevron" class="chev" /></button>
              <div v-if="st.dd === dd.key" class="pop ddpop" role="listbox">
                <div class="pop-scroll">
                  <button v-for="o in dd.items" :key="o.id" class="pi mono" :class="{ hi: o.hi }" role="option" :aria-selected="o.hi" @click="o.pick"><span class="pi-n">{{ o.label }}</span><span class="pi-k">{{ o.meta }}</span></button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="muted">{{ rel.card }}</div>
        <div class="muted">To reconnect, drag either round handle at the ends of the line onto another column.</div>

      </div>
    </template>

    <template v-else-if="multi.length">
      <div class="insp-h">
        <span class="insp-k">{{ multi.length }} tables selected</span><span class="grow"></span>
        <button class="ibtn sm" aria-label="Delete selected tables" title="Delete (Del)" @click="ed.deleteSel"><Icon name="trash" :size="14" /></button>
        <button class="ibtn sm" aria-label="Collapse inspector" title="Collapse inspector" @click="ed.closeInsp"><Icon name="panel" :size="14" /></button>
      </div>
      <div class="insp-b">
        <div class="mlist"><div v-for="t in multi" :key="t.id" class="irow"><span class="nm">{{ t.name }}</span><span class="cl">{{ t.cols.length }} cols</span></div></div>
        <div class="muted">Drag any selected table to move them together. Arrow keys nudge.</div>
      </div>
    </template>
  </aside>
</template>
