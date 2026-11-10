<script setup lang="ts">
import LoginView from './extensions/auth/LoginView.vue'
const login=window.location.pathname==='/fastaiui/login'
const navigate=(path:string)=>window.location.assign(path)
import ChatImageView from './extensions/chat-image/ChatImageView.vue'
import RechargeView from './extensions/recharge/RechargeView.vue'
import RechargeStats from './extensions/recharge/RechargeStats.vue'
import ClientReleases from './extensions/client-updates/ClientReleases.vue'
const clientReleases = /^\/fastaiui\/(admin\/client-releases|downloads\/(codexplus|manju))\/?$/.test(window.location.pathname)
const recharge = /^\/fastaiui\/recharge\/?$/.test(window.location.pathname)
const rechargeStats = /^\/fastaiui\/admin\/recharge-stats\/?$/.test(window.location.pathname)
</script>
<template><LoginView v-if="login" @authenticated="navigate"/><ClientReleases v-else-if="clientReleases"/><RechargeStats v-else-if="rechargeStats"/><RechargeView v-else-if="recharge"/><ChatImageView v-else/></template>
