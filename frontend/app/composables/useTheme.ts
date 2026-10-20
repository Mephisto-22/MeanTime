export const useTheme = () => {
  const isDark = useState('theme-dark', () => false)

  const toggleTheme = () => {
    isDark.value = !isDark.value
    if (import.meta.client) {
      document.documentElement.classList.toggle('dark', isDark.value)
    }
  }

  return {
    isDark,
    toggleTheme,
  }
}
