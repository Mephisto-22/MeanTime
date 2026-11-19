export default defineNuxtPlugin(() => {
  if (import.meta.client) {
    document.documentElement.classList.add('dark')
  }
})
