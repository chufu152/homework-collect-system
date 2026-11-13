<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, type AssignmentListItem, getActiveClass } from '../api/client'
import { describeError } from '../api/error-messages'
import { copyToClipboard } from '../utils/clipboard'

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
const loading = ref(true)
const loadError = ref('')
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
  leave: { title: '假条', description: '同学上传假条并选日期，导出按日期分组。' },
}

async function loadClass(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    // 多班级：活动班级保存在本浏览器；未导入任何班级时给出可见指引。
    const active = getActiveClass()
    if (!active) {
      classInfo.value = null
      groups.value = []
      students.value = []
      loadError.value = '尚未导入班级：请先到「班级名单」页填写班级名称与班级密钥完成导入。'
      return
    }
    classInfo.value = { classId: active.classId, name: active.name, studentCount: active.studentCount ?? 0 }
    const [groupResult, studentResult] = await Promise.all([
      api.listGroups(classInfo.value.classId),
      api.listStudents(classInfo.value.classId),
    ])
    groups.value = groupResult
    students.value = studentResult.items
    classInfo.value = { ...classInfo.value, studentCount: studentResult.total }
  } catch (error) {
    classInfo.value = null
    groups.value = []
    students.value = []
    loadError.value = describeError(error, '无法读取班级名单。')
  } finally {
    loading.value = false
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
      classId: classInfo.value!.classId,
      title: title.value.trim(),
      type: type.value,
      instructions: instructions.value.trim(),
      dueAt: dueLocal.value ? new Date(dueLocal.value).toISOString() : null,
      submissionMode: type.value === 'online' ? submissionMode.value : type.value === 'leave' ? 'file' : 'text',
      target: {
        mode: targetMode.value,
        ...(targetMode.value === 'groups' ? { groupIds: selectedGroupIds.value } : {}),
        ...(targetMode.value === 'students' ? { studentIds: selectedStudentIds.value } : {}),
      },
      publishNow: publishNow.value,
    })
    published.value = result
  } catch (error) {
    errorMessage.value = describeError(error, '作业未能创建，请检查信息后重试。')
  } finally {
    saving.value = false
  }
}

async function copyLink(): Promise<void> {
  if (!published.value) return
  try {
    await copyToClipboard(published.value.shareUrl)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 2400)
  } catch {
    errorMessage.value = '剪贴板不可用，请复制下面的链接。'
  }
}

onMounted(loadClass)
</script>

<template>
  <div class="shell create-shell">
    <header class="topbar">
      <RouterLink to="/" class="brand-lockup"><span class="brand-mark">收</span><span>班级工作台</span></RouterLink>
      <nav aria-label="主导航"><RouterLink class="nav-link" to="/">作业</RouterLink><RouterLink class="nav-link" to="/class/setup">班级名单</RouterLink></nav>
      <RouterLink class="topbar-action" to="/">返回</RouterLink>
    </header>

    <main class="page-wrap create-page">
      <div v-if="loading" class="surface empty-state" aria-live="polite">正在读取班级名单…</div>
      <div v-else-if="loadError" class="surface empty-state" role="alert"><h2>暂时无法读取班级信息</h2><p>{{ loadError }}</p><button class="button secondary" type="button" @click="loadClass">重新读取</button></div>
      <div v-else-if="!classInfo" class="surface empty-state"><h2>先建立班级名单</h2><p>当前班级还未初始化。发布作业前需要先建立一个班级，并导入学生名单。</p><RouterLink class="button primary" to="/class/setup">设置班级</RouterLink></div>

      <form v-else class="create-paper" @submit.prevent="create">
        <div class="create-col">
          <header class="create-head">
            <p class="create-eyebrow">发布到 {{ classInfo?.name ?? '当前班级' }}</p>
            <h1>新建作业</h1>
            <p class="create-sub">选择作业类型和对象，发布后即可分享。</p>
          </header>

          <section class="create-section">
            <label class="create-label" for="create-title">作业名称</label>
            <input id="create-title" v-model="title" maxlength="120" placeholder="例如：周五数学练习" required />
          </section>

          <section class="create-section">
            <label class="create-label" for="create-instructions">作业说明 <em>选填</em></label>
            <textarea id="create-instructions" v-model="instructions" rows="6" maxlength="5000" placeholder="告诉同学要完成什么、怎么提交。" />
          </section>
        </div>

        <div class="create-col">
          <section class="create-section">
            <p class="create-label">作业类型</p>
            <div role="radiogroup" aria-label="作业类型" class="create-choices">
              <label v-for="(description, value) in typeLabels" :key="value" class="create-choice">
                <input v-model="type" type="radio" :value="value" />
                <span class="choice-dot" aria-hidden="true" />
                <span class="choice-copy"><strong>{{ description.title }}</strong><span>{{ description.description }}</span></span>
              </label>
            </div>
            <Transition name="create-reveal">
              <div v-if="type === 'online'" class="create-subfield">
                <label class="create-inline-label">收取内容
                  <select v-model="submissionMode"><option value="both">文字和文件都可以</option><option value="text">只收文字</option><option value="file">只收文件</option></select>
                </label>
                <p v-if="submissionMode !== 'text'" class="field-note">可上传 PDF、Word、图片、TXT 或 ZIP；单个文件最大 20 MB，最多 5 个。</p>
              </div>
            </Transition>
          </section>

          <section class="create-section">
            <p class="create-label">发给哪些同学</p>
            <div role="radiogroup" aria-label="发给哪些同学" class="create-choices">
              <label class="create-choice"><input v-model="targetMode" type="radio" value="all" /><span class="choice-dot" aria-hidden="true" /><span class="choice-copy"><strong>全班</strong><span>{{ classInfo.studentCount }} 位学生</span></span></label>
              <label class="create-choice"><input v-model="targetMode" type="radio" value="groups" /><span class="choice-dot" aria-hidden="true" /><span class="choice-copy"><strong>按分组</strong><span>选择一个或多个组</span></span></label>
              <label class="create-choice"><input v-model="targetMode" type="radio" value="students" /><span class="choice-dot" aria-hidden="true" /><span class="choice-copy"><strong>指定同学</strong><span>自己选择名单</span></span></label>
            </div>
            <Transition name="create-reveal">
              <div v-if="targetMode === 'groups'" class="create-subfield">
                <div class="field-stack">
                  <label v-for="group in groups" :key="group.id" class="check-option"><input v-model="selectedGroupIds" type="checkbox" :value="group.id" /><span>{{ group.name }}（{{ group.memberCount }} 人）</span></label>
                </div>
                <p v-if="!groups.length" class="field-note">还没有分组，请先到“班级名单”创建分组。</p>
              </div>
            </Transition>
            <Transition name="create-reveal">
              <div v-if="targetMode === 'students'" class="create-subfield">
                <div class="roster-preview field-stack">
                  <label v-for="student in students" :key="student.id" class="check-option"><input v-model="selectedStudentIds" type="checkbox" :value="student.id" /><span>{{ student.studentNo }}　{{ student.name }}</span></label>
                </div>
                <p v-if="!students.length" class="field-note">名单为空，请先到「班级名单」导入学生。</p>
              </div>
            </Transition>
            <p class="field-note create-count-note">本次作业将固定 {{ chosenCount }} 位目标同学，不会随之后的分组变动而改变。</p>
            <p v-if="!students.length" class="field-note" role="status">班级名单还是空的；当前没有可发布的对象，请先导入学生再发布作业。</p>
          </section>

          <section class="create-section">
            <label class="create-label" for="create-due">截止时间 <em>选填</em></label>
            <input id="create-due" v-model="dueLocal" type="datetime-local" />
            <p class="field-note">截止后仍可以提交，但教师看板会标记为迟交。</p>
          </section>

          <section class="create-section">
            <label class="create-check"><input v-model="publishNow" type="checkbox" /><span>保存后立即发布，并生成学生分享链接</span></label>
          </section>

          <p v-if="errorMessage" class="field-message error-text" role="alert">{{ errorMessage }}</p>
          <div v-if="published" class="field-message success-text" role="status">
            <strong>{{ published.state === 'published' ? '作业已发布' : '作业已保存为草稿' }}</strong>
            <p>已设定 {{ published.expectedCount }} 位同学。</p>
            <div v-if="published.state === 'published'" class="copy-field"><input :value="published.shareUrl" readonly aria-label="学生分享链接" /><button class="button secondary" type="button" @click="copyLink">{{ copied ? '已复制' : '复制链接' }}</button></div>
            <RouterLink class="button secondary" :to="`/assignments/${published.id}`" style="margin-top:9px">打开教师看板</RouterLink>
          </div>
          <div v-if="!published" class="form-actions"><button class="button primary" type="submit" :disabled="saving">{{ saving ? '正在保存…' : publishNow ? '发布作业' : '保存草稿' }}</button><RouterLink class="button secondary" to="/">取消</RouterLink></div>
        </div>
      </form>
    </main>
  </div>
</template>
