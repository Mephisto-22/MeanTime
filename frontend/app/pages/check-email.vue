<template>
  <div class="auth-card-container">
    <Card class="auth-card">
      <template #title><h1 class="auth-title">Check your email</h1></template>
      <template #content><EmailVerificationNotice :initial-email="email" /></template>
    </Card>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ public: true, layout: 'headless' })
const email = useState('verification-email', () => '')
</script>
