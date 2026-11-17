import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource-variable/plus-jakarta-sans'
import './assets/styles/tokens.css'
import './assets/styles/base.css'
import App from './App.vue'
import { router } from './router'

import { initPwa } from './pwa/pwa'

initPwa()
const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

if (import.meta.env.DEV) {
  // Dev-only hooks for performance testing from the console / browser tools.
  void import('./dev/devtools').then((m) => m.installDevTools())
}
