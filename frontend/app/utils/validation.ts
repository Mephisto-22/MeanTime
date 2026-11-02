export const requiredText = (value: string) => value.trim().length > 0
export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.trim().length <= 254
export const validPassword = (value: string) => requiredText(value) && value.length >= 8 && value.length <= 128
