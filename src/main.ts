import { createApp } from "vue";
import App from "./App.vue";
import { init } from "./store";
import "./styles.css";

// The webview's own right-click menu only makes sense in text fields.
window.addEventListener("contextmenu", (e) => {
  if (!(e.target as HTMLElement).closest("input, textarea, pre")) e.preventDefault();
});

createApp(App).mount("#app");
init();
