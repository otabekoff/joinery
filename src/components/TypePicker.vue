<script setup lang="ts">
import type { Editor } from "../editor/useEditor";

defineProps<{ ed: Editor; enterLabel: string }>();
</script>

<template>
  <div class="pop" role="listbox" aria-label="Data types" @mousedown.prevent.stop @wheel.stop>
    <div class="pop-scroll">
      <template v-for="g in ed.pickerView.value.groups" :key="g.label">
        <div class="pg">{{ g.label }}</div>
        <button v-for="it in g.items" :key="it.name" class="pi mono" :class="{ hi: it.hi }" role="option" :aria-selected="it.hi" @mousedown.prevent.stop @click="ed.chooseType(it.name)"><span class="pi-n">{{ it.name }}</span><span class="pi-k">{{ it.desc }}</span></button>
      </template>
      <div v-if="ed.pickerView.value.empty" class="pempty">No built-in type. Enter uses “{{ ed.pickerView.value.q }}”.</div>
    </div>
    <div class="pfoot"><span>↑↓ Navigate</span><span>Enter {{ enterLabel }}</span><span>Esc Close</span></div>
  </div>
</template>
