<script setup lang="ts">
import LoginView from './extensions/auth/LoginView.vue'
const pagePath=window.location.pathname.replace(/^\/hub\/home(?=\/)/,'/fastaiui')
const login=pagePath==='/fastaiui/login'
const navigate=(path:string)=>window.location.assign(path)
import ChatImageView from './extensions/chat-image/ChatImageView.vue'
import RechargeView from './extensions/recharge/RechargeView.vue'
import RechargeStats from './extensions/recharge/RechargeStats.vue'
import ClientReleases from './extensions/client-updates/ClientReleases.vue'
import SiteHeader from './components/layout/SiteHeader.vue'
import SiteFooter from './components/layout/SiteFooter.vue'
const clientReleases = /^\/fastaiui\/(admin\/client-releases|downloads\/(codexplus|manju))\/?$/.test(pagePath)
const recharge = /^\/fastaiui\/recharge\/?$/.test(pagePath)
const rechargeStats = /^\/fastaiui\/admin\/recharge-stats\/?$/.test(pagePath)
const pageTitle=login?'登录官网':rechargeStats?'充值统计':recharge?'充值中心':/admin\/client-releases/.test(pagePath)?'客户端发布':/downloads\/manju/.test(pagePath)?'':/downloads\/codexplus/.test(pagePath)?'下载 Codex++':''
if(pageTitle)document.title=pageTitle+' · FastAiApi'
</script>
<template><LoginView v-if="login" @authenticated="navigate"/><ClientReleases v-else-if="clientReleases"/><div v-else-if="rechargeStats" class="stats-page"><SiteHeader section="充值统计"/><main><RechargeStats/></main><SiteFooter/></div><RechargeView v-else-if="recharge"/><ChatImageView v-else/></template>
<style scoped>.stats-page{min-height:100vh;background:var(--fa-paper);font-family:var(--fa-font)}.stats-page main{max-width:1200px;margin:auto;padding:32px 24px 56px}@media(max-width:640px){.stats-page main{padding:16px 12px 40px}}</style>
