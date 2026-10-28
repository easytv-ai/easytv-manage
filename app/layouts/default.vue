<script setup lang="ts">
/** 全站仅保留控制台，未指定 layout 的页面也走控制台壳层。 */
</script>

<template>
  <NuxtLayout name="console">
    <slot />
  </NuxtLayout>
</template>
