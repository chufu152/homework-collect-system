import { createRouter, createWebHistory } from 'vue-router'
import TeacherHomeView from './views/TeacherHomeView.vue'
import ClassSetupView from './views/ClassSetupView.vue'
import AssignmentCreateView from './views/AssignmentCreateView.vue'
import AssignmentDashboardView from './views/AssignmentDashboardView.vue'
import StudentAssignmentView from './views/StudentAssignmentView.vue'
import StudentReceiptView from './views/StudentReceiptView.vue'

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    { path: '/', name: 'home', component: TeacherHomeView },
    { path: '/class/setup', name: 'class-setup', component: ClassSetupView },
    { path: '/assignments/new', name: 'assignment-create', component: AssignmentCreateView },
    { path: '/assignments/:assignmentId', name: 'assignment-dashboard', component: AssignmentDashboardView, props: true },
    { path: '/a/:shareCode', name: 'student-assignment', component: StudentAssignmentView, props: true },
    { path: '/receipt/:receiptCode', name: 'student-receipt', component: StudentReceiptView, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
