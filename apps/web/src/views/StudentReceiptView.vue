<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { api, type StudentReceipt } from '../api/client'
import { describeError } from '../api/error-messages'

const props = defineProps<{ receiptCode: string }>()
const receipt = ref<StudentReceipt | null>(null)
const loading = ref(true)
const errorMessage = ref('')
// C1：按文件粒度记录下载中状态，多个附件各自独立，不互相覆盖。
const downloading = reactive<Record<string, boolean>>({})
const history = computed(() => receipt.value?.versions ?? [])

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    receipt.value = await api.receipt(props.receiptCode)
  } catch (error) {
    errorMessage.value = describeError(error, '回执暂时无法读取。')
  } finally {
    loading.value = false
  }
}

async function download(fileId: string): Promise<void> {
  if (downloading[fileId]) return
  downloading[fileId] = true
  errorMessage.value = ''
  try {
    await api.download(fileId, props.receiptCode)
  } catch (error) {
    errorMessage.value = describeError(error, '文件暂时无法下载，请稍后重试；若持续失败，请联系教师。')
  } finally {
    delete downloading[fileId]
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
        <ul class="download-list"><li v-for="file in receipt.files" :key="file.id"><button class="button quiet" type="button" :disabled="!!downloading[file.id]" @click="download(file.id)">{{ !!downloading[file.id] ? '正在下载…' : `下载 ${file.originalName}` }}</button><span class="student-number">{{ (file.sizeBytes / 1024 / 1024).toFixed(1) }} MB</span></li></ul>
      </div>
      <p v-else class="field-note">当前提交版本没有附件。</p>
      <details v-if="history.length > 1" class="submission-detail version-history">
        <summary>查看历次修改（共 {{ history.length }} 版）</summary>
        <div v-for="version in history" :key="version.version" class="version-item">
          <p class="version-label">第 {{ version.version }} 版<span v-if="version.version === receipt.version"> · 当前版本</span> · {{ new Date(version.submittedAt).toLocaleString('zh-CN') }}</p>
          <pre v-if="version.textContent" class="submission-text">{{ version.textContent }}</pre>
          <p v-else class="version-note">此版本没有文本内容。</p>
          <ul v-if="version.files.length" class="submission-files">
            <li v-for="file in version.files" :key="file.id">
              <button class="button quiet" type="button" :disabled="!!downloading[file.id]" @click="download(file.id)">{{ !!downloading[file.id] ? '正在下载…' : file.originalName }}</button>
              <small>{{ (file.sizeBytes / 1024).toFixed(1) }} KB</small>
            </li>
          </ul>
        </div>
      </details>
      <div class="receipt-feedback"><strong>教师反馈</strong><p v-if="receipt.feedback">{{ receipt.feedback.score == null ? '' : `分数：${receipt.feedback.score}　` }}{{ receipt.feedback.feedbackText || '老师已查看。' }}</p><p v-else>老师尚未添加反馈，稍后可以使用此回执链接再查看。</p></div>
      <p v-if="errorMessage" class="field-message error-text" role="alert">{{ errorMessage }}</p>
      <div style="margin-top:18px"><span class="receipt-copy">回执码</span><br /><code class="receipt-code">{{ receiptCode }}</code></div>
    </section>
    <footer class="public-footer">请保存此页面链接，以便查看提交内容和教师反馈。</footer>
  </main>
</template>
