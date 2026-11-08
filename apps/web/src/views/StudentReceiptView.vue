<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type StudentReceipt } from '../api/client'

const props = defineProps<{ receiptCode: string }>()
const receipt = ref<StudentReceipt | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const downloadingId = ref<string | null>(null)

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    receipt.value = await api.receipt(props.receiptCode)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '回执暂时无法读取。'
  } finally {
    loading.value = false
  }
}

async function download(fileId: string): Promise<void> {
  downloadingId.value = fileId
  errorMessage.value = ''
  try {
    await api.download(fileId, props.receiptCode)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '文件暂时无法下载。'
  } finally {
    downloadingId.value = null
  }
}

onMounted(load)
</script>

<template>
  <main class="public-frame">
    <header class="public-brand"><RouterLink to="/" class="brand-mark" aria-label="回到班级工作台">收</RouterLink><span>提交回执</span></header>
    <div v-if="loading" class="public-panel status-panel" aria-live="polite">正在读取回执…</div>
    <section v-else-if="errorMessage && !receipt" class="public-panel status-panel" role="alert"><h1>回执暂时无法打开</h1><p>{{ errorMessage }}</p><button class="button secondary" type="button" @click="load">重新加载</button></section>
    <section v-else-if="receipt" class="public-panel receipt-card">
      <div class="receipt-head"><p class="eyebrow">{{ receipt.assignment.title }}</p><h1>提交成功</h1><span class="receipt-copy">提交时间：{{ new Date(receipt.submittedAt).toLocaleString('zh-CN') }} · 第 {{ receipt.version }} 版</span></div>
      <div v-if="receipt.textContent" class="receipt-content">{{ receipt.textContent }}</div>
      <div v-if="receipt.files.length">
        <p class="eyebrow">已提交附件</p>
        <ul class="download-list"><li v-for="file in receipt.files" :key="file.id"><button class="button quiet" type="button" :disabled="downloadingId === file.id" @click="download(file.id)">{{ downloadingId === file.id ? '正在下载…' : `下载 ${file.originalName}` }}</button><span class="student-number">{{ (file.sizeBytes / 1024 / 1024).toFixed(1) }} MB</span></li></ul>
      </div>
      <div class="receipt-feedback"><strong>教师反馈</strong><p v-if="receipt.feedback">{{ receipt.feedback.score == null ? '' : `分数：${receipt.feedback.score}　` }}{{ receipt.feedback.feedbackText || '老师已查看。' }}</p><p v-else>老师尚未添加反馈，稍后可以使用此回执链接再查看。</p></div>
      <p v-if="errorMessage" class="field-message error-text" role="alert">{{ errorMessage }}</p>
      <div style="margin-top:18px"><span class="receipt-copy">回执码</span><br /><code class="receipt-code">{{ receiptCode }}</code></div>
    </section>
    <footer class="public-footer">请保存此页面链接，以便查看提交内容和教师反馈。</footer>
  </main>
</template>
