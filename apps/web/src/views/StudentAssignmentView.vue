<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type PublicAssignment } from '../api/client'
import { describeError } from '../api/error-messages'

const props = defineProps<{ shareCode: string }>()
const assignment = ref<PublicAssignment | null>(null)
const loading = ref(true)
const sending = ref(false)
const errorMessage = ref('')
const confirmation = ref('')
// 学生端只填写姓名；服务端按名单自动匹配学号（重名时由服务端拒绝并提示）。
const studentName = ref('')
const textContent = ref('')
const selectedFiles = ref<File[]>([])
// 假条：每张假条单独选择日期，与 selectedFiles 顺序一一对应。
const slipDates = ref<string[]>([])
const relayContent = ref('')
const relayEntries = ref<Array<{ position: number; displayName: string; content: string }>>([])
const relayError = ref('')
const receiptCode = ref('')
const showForm = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)
const latestVersion = ref(0)

const fileAccept = computed(() => (assignment.value?.allowedFileTypes ?? []).map((type) => `.${type}`).join(','))
const maxFileCount = computed(() => Number.isFinite(assignment.value?.maxFileCount) ? assignment.value!.maxFileCount : 5)
const maxFileSizeMB = computed(() => Number.isFinite(assignment.value?.maxFileSizeMB) ? assignment.value!.maxFileSizeMB : 20)

async function load(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    assignment.value = await api.getPublicAssignment(props.shareCode)
    if (assignment.value.type === 'relay') await refreshRelay()
  } catch (error) {
    errorMessage.value = describeError(error, '无法读取这项作业。')
  } finally {
    loading.value = false
  }
}

async function refreshRelay(): Promise<void> {
  // C1：接龙名单读取失败只影响名单区，不应把整页误报成「作业打不开」，
  // 也不能覆盖刚刚加入接龙的成功回执。
  try {
    const result = await api.getRelayEntries(props.shareCode)
    relayEntries.value = result.items
    relayError.value = ''
  } catch (error) {
    relayError.value = describeError(error, '接龙名单暂时无法读取。')
  }
}

function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function onFileChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const picked = Array.from(target.files ?? [])
  // 假条：多次选择是「追加」而不是「替换」，方便分多次挑选假条；
  // 按 文件名+大小 去重，避免重复添加同一张。选择后清空 input，才能再次选中同一个文件。
  if (assignment.value?.type === 'leave') {
    const existingKeys = new Set(selectedFiles.value.map((file) => `${file.name}-${file.size}`))
    const additions = picked.filter((file) => !existingKeys.has(`${file.name}-${file.size}`))
    selectedFiles.value = [...selectedFiles.value, ...additions].slice(0, maxFileCount.value)
    slipDates.value = selectedFiles.value.map((_, index) => slipDates.value[index] ?? todayISO())
  } else {
    selectedFiles.value = picked
  }
  target.value = ''
}

function removeSlipFile(index: number): void {
  selectedFiles.value = selectedFiles.value.filter((_, current) => current !== index)
  slipDates.value = slipDates.value.filter((_, current) => current !== index)
  if (fileInput.value) fileInput.value.value = ''
}

async function checkIn(): Promise<void> {
  await perform(async () => {
    const result = await api.checkIn(props.shareCode, {
      studentName: studentName.value.trim() || undefined,
    })
    confirmation.value = result.alreadyCheckedIn
      ? `${result.displayName} 已签到，记录时间 ${new Date(result.checkedInAt).toLocaleString('zh-CN')}`
      : `签到成功：${result.displayName}`
  })
}

async function joinRelay(): Promise<void> {
  await perform(async () => {
    const result = await api.joinRelay(props.shareCode, {
      studentName: studentName.value.trim() || undefined,
      content: relayContent.value.trim() || undefined,
    })
    confirmation.value = `接龙成功，你排在第 ${result.position} 位。`
    await refreshRelay()
  }, '你已经加入过这次接龙了；刷新下方名单即可看到自己的位置。')
}

async function submitOnline(): Promise<void> {
  if (!assignment.value) return
  // C1：公开作业的配置字段若缺失，退回接口默认值，不让 NaN 把校验悄悄绕过。
  const maxSizeMB = maxFileSizeMB.value
  const maxCount = maxFileCount.value
  const maxBytes = maxSizeMB * 1024 * 1024
  if (selectedFiles.value.some((file) => file.size > maxBytes)) {
    errorMessage.value = `每个文件不能超过 ${maxSizeMB} MB。`
    return
  }
  if (selectedFiles.value.length > maxCount) {
    errorMessage.value = `最多选择 ${maxCount} 个文件。`
    return
  }
  const isLeave = assignment.value.type === 'leave'
  if (isLeave) {
    if (!selectedFiles.value.length) {
      errorMessage.value = '请至少上传一张假条。'
      return
    }
    if (slipDates.value.length !== selectedFiles.value.length || slipDates.value.some((value) => !value)) {
      errorMessage.value = '请为每张假条选择日期。'
      return
    }
  }
  await perform(async () => {
    const result = await api.submitAssignment(props.shareCode, {
      studentName: studentName.value.trim(),
      textContent: textContent.value,
      files: selectedFiles.value,
      fileDates: isLeave ? [...slipDates.value] : undefined,
    })
    receiptCode.value = result.receiptCode
    latestVersion.value = result.version
    showForm.value = false
    confirmation.value = '提交成功，已为你生成回执。'
    selectedFiles.value = []
    slipDates.value = []
    if (fileInput.value) fileInput.value.value = ''
  })
}

function resubmit(): void {
  showForm.value = true
  confirmation.value = ''
  errorMessage.value = ''
}

async function perform(action: () => Promise<void>, conflictHint?: string): Promise<void> {
  sending.value = true
  errorMessage.value = ''
  confirmation.value = ''
  try {
    await action()
  } catch (error) {
    const detail = describeError(error, '操作未完成，请检查信息后重试。')
    // 服务端对重名学生的拒绝没有独立错误码，只返回英文提示；这里转成学生可操作的中文引导。
    errorMessage.value = detail.includes('More than one student')
      ? '班级里有多位同名同学，无法自动确认是你的提交，请联系老师处理。'
      : detail
    // C1：409 在接龙场景有明确语义（重复占位），给出可核对的恢复动作。
    if (conflictHint && (error as { status?: number })?.status === 409) errorMessage.value = conflictHint
  } finally {
    sending.value = false
  }
}

function dueLabel(value: string | null): string {
  if (!value) return '未设置截止时间'
  return `截止 ${new Date(value).toLocaleString('zh-CN')}`
}

onMounted(load)
</script>

<template>
  <main class="public-frame student-wall">
    <header class="student-topbar">
      <span class="paper-tag" aria-hidden="true">收</span>
      <span>班级作业</span>
    </header>

    <section v-if="loading" class="student-paper student-paper-status" aria-live="polite">正在打开作业…</section>
    <section v-else-if="errorMessage && !assignment" class="student-paper student-paper-status" role="alert">
      <h1>暂时无法打开</h1>
      <p>{{ errorMessage }}</p>
      <button class="button secondary" type="button" @click="load">重新加载</button>
    </section>

    <article v-else-if="assignment" class="student-paper">
      <header class="student-paper-head">
        <p class="eyebrow">{{ assignment.type === 'checkin' ? '班级签到' : assignment.type === 'relay' ? '班级接龙' : assignment.type === 'leave' ? '请假条' : assignment.type === 'offline' ? '线下完成登记' : '线上作业' }}</p>
        <h1>{{ assignment.title }}</h1>
        <p class="assignment-meta">{{ dueLabel(assignment.dueAt) }}</p>
        <p v-if="assignment.instructions" class="assignment-instructions">{{ assignment.instructions }}</p>
      </header>

      <section v-if="assignment.type === 'checkin' || assignment.type === 'relay' || assignment.type === 'online' || assignment.type === 'leave'" class="student-paper-body">
        <form v-if="showForm" @submit.prevent="assignment.type === 'checkin' ? checkIn() : assignment.type === 'relay' ? joinRelay() : submitOnline()">
          <label class="field-block">
            <span>姓名</span>
            <input v-model="studentName" aria-label="姓名" name="studentName" autocomplete="name" placeholder="请输入姓名" :required="assignment.type === 'online' || assignment.type === 'leave'" />
            <small>系统会按班级名单自动匹配你的学号。</small>
          </label>

          <label v-if="assignment.type === 'online' && assignment.submissionMode !== 'file'" class="field-block">
            <span>作业内容</span>
            <textarea v-model="textContent" rows="7" maxlength="100000" placeholder="在这里输入作业内容" :required="assignment.submissionMode === 'text'" />
          </label>

          <label v-if="assignment.type === 'online' && assignment.submissionMode !== 'text'" class="field-block file-field">
            <span>添加附件</span>
            <input ref="fileInput" type="file" :accept="fileAccept" :multiple="maxFileCount > 1" @change="onFileChange" />
            <small>支持 {{ (assignment.allowedFileTypes ?? []).join('、') || '服务端允许的附件类型' }}，最多 {{ maxFileCount }} 个，每个不超过 {{ maxFileSizeMB }} MB</small>
            <ul v-if="selectedFiles.length" class="file-list">
              <li v-for="file in selectedFiles" :key="`${file.name}-${file.size}`">{{ file.name }} <small>{{ (file.size / 1024 / 1024).toFixed(1) }} MB</small></li>
            </ul>
          </label>

          <div v-if="assignment.type === 'leave'" class="field-block file-field">
            <span>上传假条</span>
            <input ref="fileInput" type="file" :accept="fileAccept" multiple @change="onFileChange" />
            <small>可一次上传多张假条，每张单独选择请假日期，最多 {{ maxFileCount }} 张，每张不超过 {{ maxFileSizeMB }} MB</small>
            <ul v-if="selectedFiles.length" class="file-list slip-list">
              <li v-for="(file, index) in selectedFiles" :key="`${file.name}-${file.size}`" class="slip-row">
                <span class="slip-name" :title="file.name">{{ file.name }} <small>{{ (file.size / 1024 / 1024).toFixed(1) }} MB</small></span>
                <label class="slip-date">
                  <span>请假日期</span>
                  <input v-model="slipDates[index]" type="date" :max="todayISO()" required aria-label="请假日期" />
                </label>
                <button class="button quiet slip-remove" type="button" @click="removeSlipFile(index)">移除</button>
              </li>
            </ul>
          </div>

          <label v-if="assignment.type === 'relay'" class="field-block">
            <span>接龙内容 <small>选填</small></span>
            <input v-model="relayContent" maxlength="1000" placeholder="例如：我可以参加" />
          </label>

          <p v-if="errorMessage" class="form-message error-text" role="alert">{{ errorMessage }}</p>
          <p v-if="confirmation" class="form-message success-text" role="status">{{ confirmation }}</p>
          <div class="form-actions">
            <button class="button primary" type="submit" :disabled="sending">
              {{ sending ? '正在处理…' : assignment.type === 'checkin' ? '签到' : assignment.type === 'relay' ? '加入接龙' : '提交作业' }}
            </button>
            <RouterLink v-if="receiptCode" class="button secondary" :to="`/receipt/${receiptCode}`">查看提交回执</RouterLink>
          </div>
        </form>
        <div v-else class="receipt-link-block" role="status">
          <p class="success-text">{{ confirmation }}</p>
          <p class="muted-copy">当前为第 {{ latestVersion }} 版。重新提交会保存新版本，并清除老师已给出的反馈。</p>
          <div class="form-actions">
            <RouterLink class="button primary" :to="`/receipt/${receiptCode}`">查看提交回执</RouterLink>
            <button class="button secondary" type="button" @click="resubmit">再次提交 / 修改</button>
          </div>
        </div>
      </section>

      <section v-if="assignment.type === 'relay'" class="student-paper-body relay-body">
        <div class="section-heading">
          <div><p class="eyebrow">接龙名单</p><h2>已经加入的同学</h2></div>
          <span class="count-chip">{{ relayEntries.length }} 人</span>
        </div>
        <ol class="relay-list">
          <li v-for="entry in relayEntries" :key="entry.position">
            <span class="relay-position">{{ String(entry.position).padStart(2, '0') }}</span>
            <span class="relay-person">{{ entry.displayName }}</span>
            <span v-if="entry.content" class="relay-content">{{ entry.content }}</span>
          </li>
          <li v-if="!relayEntries.length && !relayError" class="empty-row">还没有同学加入，从你开始。</li>
        </ol>
        <p v-if="relayError" class="form-message error-text" role="alert">{{ relayError }} <button class="button quiet" type="button" @click="refreshRelay">重试读取名单</button></p>
      </section>

      <section v-if="assignment.type === 'offline'" class="student-paper-body">
        <h2>线下作业</h2>
        <p class="offline-note">这项作业由老师在线下登记完成情况，请按老师说明参加。</p>
      </section>

      <footer class="paper-footnote">请确认姓名与班级名单一致。</footer>
    </article>
  </main>
</template>
