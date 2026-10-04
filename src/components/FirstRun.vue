<script setup lang="ts">
import { ref } from "vue";
import { finishFirstRun, pickFolder, store } from "../store";

// Starts on Documents/Joinery; continuing without choosing keeps that default.
const path = ref(store.defaultRoot);
const busy = ref(false);

async function choose() {
  const dir = await pickFolder(path.value);
  if (dir) path.value = dir;
}
async function finish() {
  busy.value = true;
  await finishFirstRun(path.value);
  busy.value = false;
}
</script>

<template>
  <main class="main first">
    <div class="first-card">
      <h1>Where should Joinery keep your projects?</h1>
      <p>Each project is saved in its own folder inside this one. You can change the default later in Settings, and move any single project to another folder.</p>
      <div class="pathbox">{{ path }}</div>
      <div class="first-actions">
        <button class="btn" :disabled="busy" @click="choose">Choose another folder…</button>
        <button class="btn primary" :disabled="busy" @click="finish">Use this folder</button>
      </div>
    </div>
  </main>
</template>
