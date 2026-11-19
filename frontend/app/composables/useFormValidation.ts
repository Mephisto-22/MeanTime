import { reactive, ref } from 'vue'

/**
 * Tracks per-field user interaction so required/invalid fields only display
 * red outlines, error messages, and `aria-invalid="true"` after the user has
 * modified and blurred a field or attempted to submit the form.
 */
export function useFormValidation() {
  const submitted = ref(false)
  const dirty = reactive<Record<string, boolean>>({})
  const blurred = reactive<Record<string, boolean>>({})

  function markDirty(field: string): void {
    dirty[field] = true
  }

  function markBlurred(field: string): void {
    // Only mark blurred once the user has actually edited the field so that
    // autofocused inputs or tabbing past untouched fields do not turn red.
    if (dirty[field]) {
      blurred[field] = true
    }
  }

  function markSubmitted(): void {
    submitted.value = true
  }

  function shouldShowError(field: string, isInvalid: boolean): boolean {
    if (!isInvalid) return false
    return submitted.value || (Boolean(dirty[field]) && Boolean(blurred[field]))
  }

  function reset(): void {
    submitted.value = false
    for (const key of Object.keys(dirty)) {
      delete dirty[key]
    }
    for (const key of Object.keys(blurred)) {
      delete blurred[key]
    }
  }

  function fieldHandlers(field: string) {
    return {
      onInput: () => markDirty(field),
      onBlur: () => markBlurred(field),
    }
  }

  return {
    submitted,
    markDirty,
    markBlurred,
    markSubmitted,
    shouldShowError,
    reset,
    fieldHandlers,
  }
}
