<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, getAdminToken, setAdminToken } from '../api/client'

const className = ref('')
const adminToken = ref(getAdminToken())
const classInfo = ref<{ classId: string; name: string; studentCount: number } | null>(null)
const rosterText = ref('')
const loading = ref(false)
const savingKey = ref(false)
const importing = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const rejectedRows = ref<Array<{ row: number; reason: string }>>([])
const students = ref<Array<{ id: string; studentNo: string; name: string }>>([])
const groups = ref<Array<{ id: string; name: string; memberCount: number }>>([])
const groupName = ref('第 1 组')
const groupStrategy = ref<'manual' | 'balanced_random'>('balanced_random')
const groupCount = ref(4)
const selectedStudentIds = ref<string[]>([])
const savingGroup = ref(false)

const parsedRoster = computed(() => rosterText.value.split(/\r?\n/).map((line, index) => {
  const parts = line.trim().split(/[\t,， ]+/).filter(Boolean)
  if (!line.trim()) return null
  if (parts.length < 2) return { row: index + 1, studentNo: '', name: '', error: '请在学号后填写姓名。' }
  return { row: index + 1, studentNo: parts[0], name: parts.slice(1).join(' '), error: '' }
}).filter((entry): entry is NonNullable<typeof entry> => !!entry))

async function saveKey(): Promise<void> {
  savingKey.value = true
  setAdminToken(adminToken.value.trim())
  errorMessage.value = ''
  successMessage.value = '管理密钥已保存到当前浏览器会话。'
  try {
    await loadClass()
  } finally {
    savingKey.value = false
  }
}

async function loadClass(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    classInfo.value = await api.currentClass()
    if (classInfo.value) {
      const [roster, groupList] = await Promise.all([
        api.listStudents(classInfo.value.classId),
        api.listGroups(classInfo.value.classId),
      ])
      students.value = roster.items
      groups.value = groupList
      classInfo.value.studentCount = roster.total
    }
  } catch (error) {
    classInfo.value = null
    errorMessage.value = error instanceof Error ? error.message : '无法读取班级信息。'
  } finally {
    loading.value = false
  }
}

async function createClass(): Promise<void> {
  errorMessage.value = ''
  successMessage.value = ''
  if (!className.value.trim()) {
    errorMessage.value = '请填写班级名称。'
    return
  }
  savingKey.value = true
  setAdminToken(adminToken.value.trim())
  try {
    const created = await api.bootstrap(className.value.trim())
    classInfo.value = { classId: created.id, name: created.name, studentCount: 0 }
    successMessage.value = '班级已建立，可以导入学生名单。'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '班级暂时无法创建。'
  } finally {
    savingKey.value = false
  }
}

async function saveGroup(): Promise<void> {
  if (!classInfo.value) return
  errorMessage.value = ''
  successMessage.value = ''
  savingGroup.value = true
  try {
    if (groupStrategy.value === 'balanced_random') {
      await api.createGroups(classInfo.value.classId, {
        name: groupName.value.trim() || '小组',
        strategy: 'balanced_random',
        groupCount: groupCount.value,
      })
    } else {
      await api.createGroups(classInfo.value.classId, {
        name: groupName.value.trim(),
        strategy: 'manual',
        studentIds: selectedStudentIds.value,
      })
    }
    groups.value = await api.listGroups(classInfo.value.classId)
    selectedStudentIds.value = []
    successMessage.value = '分组已保存。'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '分组创建失败。'
  } finally {
    savingGroup.value = false
  }
}

async function importRoster(): Promise<void> {
  if (!classInfo.value) return
  errorMessage.value = ''
  successMessage.value = ''
  rejectedRows.value = []
  const validRows = parsedRoster.value.filter((row) => !row.error)
  if (!validRows.length) {
    errorMessage.value = parsedRoster.value.length ? '请修正名单格式后再导入。' : '请先填写学生名单。'
    return
  }
  importing.value = true
  try {
    const result = await api.importStudents(classInfo.value.classId, validRows.map((row) => ({ studentNo: row.studentNo, name: row.name })))
    rejectedRows.value = [...parsedRoster.value.filter((row) => row.error).map((row) => ({ row: row.row, reason: row.error })), ...result.rejected]
    classInfo.value.studentCount += result.created
    successMessage.value = `已新增 ${result.created} 人，更新 ${result.updated} 人。`
    if (rejectedRows.value.length) successMessage.value += ` 有 ${rejectedRows.value.length} 行未导入。`
    const roster = await api.listStudents(classInfo.value.classId)
    students.value = roster.items
    classInfo.value.studentCount = roster.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '名单导入失败。'
  } finally {
    importing.value = false
  }
}

onMounted(() => {
  if (adminToken.value) void loadClass()
})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/" class="brand-lockup"><span class="brand-mark">收</span><span>班级工作台</span></RouterLink>
      <nav aria-label="主导航"><RouterLink class="nav-link" to="/">作业</RouterLink><RouterLink class="nav-link router-link-active" to="/class/setup">班级名单</RouterLink></nav>
      <RouterLink class="topbar-action" to="/assignments/new">发布作业</RouterLink>
    </header>

    <main class="page-wrap">
      <div class="page-heading">
        <div><p class="eyebrow">一个班级 · 开始使用</p><h1>班级名单</h1><p>先设置管理密钥，再建立班级并整理学生名单。</p></div>
        <span v-if="classInfo" class="count-chip">{{ classInfo.studentCount }} 位学生</span>
      </div>

      <section class="surface panel form-grid">
        <div>
          <p class="eyebrow">教师管理</p>
          <h2 style="margin: 5px 0 8px; font-size: 18px">管理密钥</h2>
          <p class="muted-copy">本 demo 不设账号密码。管理密钥由项目运行环境提供，只保存在当前浏览器会话中。</p>
        </div>
        <form class="teacher-key-form" @submit.prevent="saveKey">
          <input v-model="adminToken" type="password" autocomplete="current-password" aria-label="管理密钥" placeholder="粘贴管理密钥" required />
          <button class="button secondary" type="submit" :disabled="savingKey">保存密钥</button>
        </form>
        <p v-if="errorMessage && !classInfo" class="field-message error-text" role="alert">{{ errorMessage }}</p>
        <p v-if="successMessage" class="field-message success-text" role="status">{{ successMessage }}</p>
      </section>

      <section v-if="!classInfo" class="surface panel form-grid" style="margin-top: 16px">
        <div><p class="eyebrow">建立班级</p><h2 style="margin: 5px 0 8px; font-size: 18px">创建唯一班级</h2><p class="muted-copy">demo 只支持一个班级；班级建好后可反复更新名单。</p></div>
        <label class="field-block"><span>班级名称</span><input v-model="className" placeholder="例如：三年级一班" maxlength="80" required /></label>
        <button class="button primary" type="button" :disabled="savingKey || loading" @click="createClass">{{ savingKey ? '正在创建…' : '建立班级' }}</button>
      </section>

      <section v-else class="surface panel form-grid" style="margin-top: 16px">
        <div><p class="eyebrow">{{ classInfo.name }}</p><h2 style="margin: 5px 0 8px; font-size: 18px">导入学生名单</h2><p class="muted-copy">每行一位学生，按“学号 姓名”填写；可用空格、逗号或 Tab 分隔。重复学号会更新姓名，不会另建重复名单。</p></div>
        <label class="field-block"><span>学号与姓名</span><textarea v-model="rosterText" class="roster-input" placeholder="2026001 张三&#10;2026002 李四&#10;2026003 王五" spellcheck="false" /></label>
        <div v-if="parsedRoster.length" class="field-stack">
          <span class="muted-copy">预览 {{ parsedRoster.length }} 行</span>
          <ul class="roster-preview"><li v-for="row in parsedRoster.slice(0, 8)" :key="row.row">{{ row.row }}. {{ row.error || `${row.studentNo}　${row.name}` }}</li><li v-if="parsedRoster.length > 8">另有 {{ parsedRoster.length - 8 }} 行…</li></ul>
        </div>
        <div class="button-row"><button class="button primary" type="button" :disabled="importing" @click="importRoster">{{ importing ? '正在导入…' : '导入名单' }}</button><RouterLink class="button secondary" to="/">返回作业首页</RouterLink></div>
        <div class="form-grid" style="padding-top:20px; border-top:1px solid var(--line)">
          <div><p class="eyebrow">小组</p><h2 style="margin:5px 0 8px; font-size:18px">整理分组</h2><p class="muted-copy">按名单顺序随机均分，或手动挑选成员；分组用于发布定向作业。</p></div>
          <label class="field-block"><span>分组名称</span><input v-model="groupName" maxlength="40" placeholder="例如：实验小组" /></label>
          <div class="radio-grid"><label class="radio-option"><input v-model="groupStrategy" type="radio" value="balanced_random" /><span><strong>均分随机</strong><span>自动把全班分入若干小组</span></span></label><label class="radio-option"><input v-model="groupStrategy" type="radio" value="manual" /><span><strong>手动分组</strong><span>为一组挑选成员</span></span></label></div>
          <label v-if="groupStrategy === 'balanced_random'" class="field-block"><span>小组数量</span><input v-model.number="groupCount" type="number" min="2" :max="students.length" /></label>
          <div v-else class="roster-preview field-stack"><label v-for="student in students" :key="student.id" class="check-option"><input v-model="selectedStudentIds" type="checkbox" :value="student.id" /><span>{{ student.studentNo }}　{{ student.name }}</span></label></div>
          <button class="button secondary" type="button" :disabled="savingGroup || !students.length" @click="saveGroup">{{ savingGroup ? '正在保存…' : groupStrategy === 'balanced_random' ? '随机分组' : '建立手动分组' }}</button>
          <ul v-if="groups.length" class="roster-preview"><li v-for="group in groups" :key="group.id">{{ group.name }}　{{ group.memberCount }} 人</li></ul>
        </div>
        <p v-if="errorMessage" class="field-message error-text" role="alert">{{ errorMessage }}</p>
        <p v-if="successMessage" class="field-message success-text" role="status">{{ successMessage }}</p>
        <ul v-if="rejectedRows.length" class="field-message error-text"><li v-for="row in rejectedRows" :key="row.row">第 {{ row.row }} 行：{{ row.reason }}</li></ul>
      </section>
    </main>
  </div>
</template>
