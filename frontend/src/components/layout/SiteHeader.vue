<script setup lang="ts">
// 官网统一页眉，样式来自 public/brand.css（与静态页面共用）。
defineProps<{ section?: string, current?: 'codexplus' | 'manju' | 'help' | 'recharge' | 'login' }>()
const links = [
  { key: 'products', href: '/hub/home/#products', label: '产品' },
  { key: 'codexplus', href: '/hub/home/downloads/codexplus', label: 'Codex++' },
  { key: 'manju', href: '/hub/home/downloads/manju', label: '笑笑漫剧' },
  { key: 'help', href: '/hub/home/help/', label: '帮助' },
  { key: 'recharge', href: '/hub/home/recharge', label: '充值' },
] as const
</script>
<template>
  <header class="fa-header"><div class="fa-header-inner">
    <a class="fa-brand" href="/hub/home/"><span class="fa-mark">F</span>FastAiApi<small v-if="section">{{ section }}</small></a>
    <nav class="fa-nav" aria-label="主导航">
      <a v-for="link in links" :key="link.key" :href="link.href" :aria-current="current === link.key ? 'page' : undefined">{{ link.label }}</a>
      <slot><a class="fa-nav-cta" href="/hub/home/login" :aria-current="current === 'login' ? 'page' : undefined">登录</a></slot>
    </nav>
  </div></header>
</template>
