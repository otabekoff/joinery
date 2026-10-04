<script setup lang="ts">
import { computed } from "vue";

// Icons drawn on a 14px grid always render at 12px; the rest default to 16px.
const SMALL: Record<string, string> = {
  back: '<path d="M8.5 3.5 5 7l3.5 3.5"/>',
  chevron: '<path d="M3.5 5.5 7 9l3.5-3.5"/>',
  check: '<path d="M2.5 7.5l3 3 6-7"/>',
  key: '<circle cx="4.2" cy="7" r="2.6"/><path d="M6.8 7h5.7M10.6 7v2.2M12.5 7v1.6"/>',
  link: '<path d="M5.6 8.4 8.4 5.6"/><path d="M6.3 3.9 7.2 3a2.4 2.4 0 0 1 3.4 3.4l-.9.9M7.7 10.1l-.9.9A2.4 2.4 0 0 1 3.4 7.6l.9-.9"/>',
};
const ICONS: Record<string, string> = {
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  folder: '<path d="M1.5 4.5a1 1 0 0 1 1-1h3.3l1.5 1.5h6.2a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/>',
  project: '<path d="M2 3.5h12v9H2z"/><path d="M2 6.5h12"/>',
  settings: '<circle cx="8" cy="8" r="2"/><path d="M8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05"/>',
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  minus: '<path d="M3.5 8h9"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>',
  database: '<ellipse cx="8" cy="3.8" rx="5" ry="1.8"/><path d="M3 3.8v8.4c0 1 2.2 1.8 5 1.8s5-.8 5-1.8V3.8M3 8c0 1 2.2 1.8 5 1.8s5-.8 5-1.8"/>',
  addTable: '<rect x="1.5" y="2.5" width="10" height="9" rx="1.5"/><path d="M1.5 5.75h10M5.25 5.75v5.75M13 9.5v5M10.5 12h5"/>',
  undo: '<path d="M5.5 3.5 2.5 6.5l3 3"/><path d="M2.5 6.5h7a3.75 3.75 0 0 1 0 7.5H7"/>',
  redo: '<path d="M10.5 3.5l3 3-3 3"/><path d="M13.5 6.5h-7a3.75 3.75 0 0 0 0 7.5H9"/>',
  layout: '<rect x="1.5" y="2" width="5" height="4" rx="1"/><rect x="9.5" y="2" width="5" height="4" rx="1"/><rect x="9.5" y="10" width="5" height="4" rx="1"/><path d="M6.5 4h3M12 6v4"/>',
  fit: '<path d="M2 5.5V3a1 1 0 0 1 1-1h2.5M10.5 2H13a1 1 0 0 1 1 1v2.5M14 10.5V13a1 1 0 0 1-1 1h-2.5M5.5 14H3a1 1 0 0 1-1-1v-2.5"/>',
  table: '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12M6.5 6v7.5"/>',
  column: '<path d="M3 4h10M3 8h10M3 12h6"/>',
  panel: '<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M10 2.5v11"/>',
  more: '<circle cx="3.5" cy="8" r=".6"/><circle cx="8" cy="8" r=".6"/><circle cx="12.5" cy="8" r=".6"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  up: '<path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7"/>',
  down: '<path d="M8 3.5v9M4.5 9 8 12.5 11.5 9"/>',
  types: '<path d="M5.5 2.5H5A1.5 1.5 0 0 0 3.5 4v2.5L2 8l1.5 1.5V12A1.5 1.5 0 0 0 5 13.5h.5M10.5 2.5h.5A1.5 1.5 0 0 1 12.5 4v2.5L14 8l-1.5 1.5V12a1.5 1.5 0 0 1-1.5 1.5h-.5"/>',
  file: '<path d="M4 1.5h5l3.5 3.5v9.5H4z"/><path d="M9 1.5V5h3.5"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/>',
};

const props = defineProps<{ name: string; size?: 14 }>();
const small = computed(() => props.name in SMALL);
</script>

<template>
  <svg class="i" :class="{ s12: small, s14: size === 14 }" :viewBox="small ? '0 0 14 14' : '0 0 16 16'" aria-hidden="true" v-html="small ? SMALL[name] : ICONS[name]"></svg>
</template>
