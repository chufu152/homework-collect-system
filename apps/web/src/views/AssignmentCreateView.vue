<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type AssignmentListItem } from '../api/client'

type AssignmentType = AssignmentListItem['type']
const title = ref('')
const type = ref<AssignmentType>('online')
const instructions = ref('')
const dueLocal = ref('')
const targetMode = ref<'all' | 'groups' | 'students'>('all')
const submissionMode = ref<'text' | 'file' | 'both'>('both')
const selectedGroupIds = ref<string[]>([])
const selectedStudentIds = ref<string[]>([])
const classInfo = ref<{ classId: string; name: string; studentCount: number } | null>(null)
const groups = ref<Array<{ id: string; name: string; memberCount: number }>>([])
const students = ref<Array<{ id: string; studentNo: string; name: string }>>([])
const publishNow = ref(true)
const saving = ref(false)
const errorMessage = ref('')
const published = ref<AssignmentListItem | null>(null)
const copied = ref(false)

const chosenCount = computed(() => targetMode.value === 'all'
  ? classInfo.value?.studentCount ?? 0
  : targetMode.value === 'groups'
    ? groups.value.filter((group) => selectedGroupIds.value.includes(group.id)).reduce((sum, group) => sum + group.memberCount, 0)
    : selectedStudentIds.value.length)

const typeLabels: Record<AssignmentType, { title: string; description: string }> = {
  online: { title: '线上作业', description: '收文字、文件，或两者都收。' },
  offline: { title: '线下完成', description: '老师在后台点名登记谁已完成。' },
  checkin: { title: '签到', description: '同学通过班级分享页签到。' },
  relay: { title: '接龙', description: '同学按顺序加入接龙名单。' },
}

async function loadClass(): Promise<void> {
  try {
    classInfo.value = await api.currentClass()
    if (!classInfo.value) return
    const [groupResult, studentResult] = await Promise.all([
      api.listGroups(classInfo.value.classId),
      api.listStudents(classInfo.value.classId),
    ])
    groups.value = groupResult
    students.value = studentResult.items
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无法读取班级名单。'
  }
}

async function create(): Promise<void> {
  errorMessage.value = ''
  published.value = null
  if (!title.value.trim()) { errorMessage.value = '请填写作业名称。'; return }
  if (targetMode.value === 'groups' && !selectedGroupIds.value.length) { errorMessage.value = '请选择至少一个分组。'; return }
  if (targetMode.value === 'students' && !selectedStudentIds.value.length) { errorMessage.value = '请选择至少一位学生。'; return }
  if (!chosenCount.value) { errorMessage.value = '当前目标名单没有学生，请先整理班级名单。'; return }

  saving.value = true
  try {
    const result = await api.createAssignment({
      title: title.value.trim(),
      type: type.value,
      instructions: instructions.value.trim(),
      dueAt: dueLocal.value ? new Date(dueLocal.value).toISOString() : null,
      submissionMode: type.value === 'online' ? submissionMode.value : 'text',
      target: {
        mode: targetMode.value,
        ...(targetMode.value === 'groups' ? { groupIds: selectedGroupIds.value } : {}),
        ...(targetMode.value === 'students' ? { studentIds: selectedStudentIds.value } : {}),
      },
      publishNow: publishNow.value,
    })
    published.value = result
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '作业未能创建，请检查信息后重试。'
  } finally {
    saving.value = false
  }
}

async function copyLink(): Promise<void> {
  if (!published.value) return
  try {
    await navigator.clipboard.writeText(published.value.shareUrl)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 2400)
  } catch {
    errorMessage.value = '剪贴板不可用，请复制下面的链接。'
  }
}

onMounted(loadClass)
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand-lockup"><span class="brand-mark">收</span><span>班级工作台</span></RouterLink>
      <nav aria-label="主导航"><RouterLink class="nav-link" to="/">作业</RouterLink><RouterLink class="nav-link" to="/class/setup">班级名单</RouterLink></nav>
      <span class="topbar-action">新建作业</span>
    </header>

    <main class="page-wrap">
      <div class="page-heading"><div><p class="eyebrow">发布到 {{ classInfo?.name ?? '当前班级' }}</p><h1>新建作业</h1><p>选择作业类型和对象，发布后即可分享。</p></div></div>
      <div v-if="!classInfo && !errorMessage" class="surface empty-state">正在读取班级名单…</div>
      <div v-else-if="!classInfo" class="surface empty-state" role="alert"><h2>先建立班级名单</h2><p>{{ errorMessage || '发布作业前需要设置一个班级和学生名单。' }}</p><RouterLink class="button primary" to="/class/setup">设置班级</RouterLink></div>

      <form v-else class="surface panel form-grid" @submit.prevent="create">
        <label class="field-block"><span>作业名称</span><input v-model="title" maxlength="120" placeholder="例如：周五数学练习" required /></label>
        <label class="field-block"><span>作业说明 <small>选填</small></span><textarea v-model="instructions" rows="4" maxlength="5000" placeholder="告诉同学要完成什么、怎么提交。" /></label>

        <fieldset style="border:0; padding:0; margin:0">
          <legend class="field-block" style="margin-bottom:9px">作业类型</legend>
          <div class="radio-grid">
            <label v-for="(description, value) in typeLabels" :key="value" class="radio-option">
              <input v-model="type" type="radio" :value="value" />
              <span><strong>{{ description.title }}</strong><span>{{ description.description }}</span></span>
            </label>
          </div>
        </fieldset>

        <fieldset style="border:0; padding:0; margin:0">
          <legend class="field-block" style="margin-bottom:9px">发给哪些同学</legend>
          <div class="radio-grid">
            <label class="radio-option"><input v-model="targetMode" type="radio" value="all" /><span><strong>全班</strong><span>{{ classInfo.studentCount }} 位学生</span></span></label>
            <label class="radio-option"><input v-model="targetMode" type="radio" value="groups" /><span><strong>按分组</strong><span>选择一个或多个组</span></span></label>
            <label class="radio-option"><input v-model="targetMode" type="radio" value="students" /><span><strong>指定同学</strong><span>自己选择名单</span></span></label>
          </div>
        </fieldset>

        <div v-if="targetMode === 'groups'" class="field-stack">
          <label v-for="group in groups" :key="group.id" class="check-option"><input v-model="selectedGroupIds" type="checkbox" :value="group.id" /><span>{{ group.name }}（{{ group.memberCount }} 人）</span></label>
          <p v-if="!groups.length" class="field-note">还没有分组，请先到“班级名单”创建分组。</p>
        </div>
        <div v-if="targetMode === 'students'" class="roster-preview field-stack">
          <label v-for="student in students" :key="student.id" class="check-option"><input v-model="selectedStudentIds" type="checkbox" :value="student.id" /><span>{{ student.studentNo }}　{{ student.name }}</span></label>
        </div>
        <p class="field-note">本次作业将固定 {{ chosenCount }} 位目标同学，不会随之后的分组变动而改变。</p>

        <label v-if="type === 'online'" class="field-block"><span>收取内容</span><select v-model="submissionMode"><option value="both">文字和文件都可以</option><option value="text">只收文字</option><option value="file">只收文件</option></select></label>
        <div v-if="type === 'online' && submissionMode !== 'text'" class="field-note">可上传 PDF、Word、图片、TXT 或 ZIP；单个文件最大 20 MB，最多 5 个。</div>
        <label class="field-block"><span>截止时间 <small>选填</small></span><input v-model="dueLocal" type="datetime-local" /><small>截止后仍可以提交，但教师看板会标记为迟交。</small></label>
        <label class="check-option"><input v-model="publishNow" type="checkbox" /><span>保存后立即发布，并生成学生分享链接</span></label>

        <p v-if="errorMessage" class="field-message error-text" role="alert">{{ errorMessage }}</p>
        <div v-if="published" class="field-message success-text" role="status">
          <strong>{{ published.state === 'published' ? '作业已发布' : '作业已保存为草稿' }}</strong>
          <p>已设定 {{ published.expectedCount }} 位同学。</p>
          <div v-if="published.state === 'published'" class="copy-field"><input :value="published.shareUrl" readonly aria-label="学生分享链接" /><button class="button secondary" type="button" @click="copyLink">{{ copied ? '已复制' : '复制链接' }}</button></div>
          <RouterLink class="button secondary" :to="`/assignments/${published.id}`" style="margin-top:9px">打开教师看板</RouterLink>
        </div>
        <div v-if="!published" class="form-actions"><button class="button primary" type="submit" :disabled="saving">{{ saving ? '正在保存…' : publishNow ? '发布作业' : '保存草稿' }}</button><RouterLink class="button secondary" to="/">取消</RouterLink></div>
      </form>
    </main>
  </div>
</template>
