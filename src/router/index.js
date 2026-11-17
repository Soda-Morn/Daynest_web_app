import { createRouter, createWebHistory } from 'vue-router'
import TodayPage from '@/pages/TodayPage.vue'
import { cloudEnabled } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'

// Today is the landing page and ships in the main bundle; the rest load on demand.
const routes = [
  { path: '/', redirect: '/today' },
  { path: '/today', name: 'today', component: TodayPage, meta: { title: 'Today' } },
  { path: '/tasks', name: 'tasks', component: () => import('@/pages/TasksPage.vue'), meta: { title: 'My Tasks' } },
  { path: '/calendar', name: 'calendar', component: () => import('@/pages/CalendarPage.vue'), meta: { title: 'Calendar' } },
  { path: '/upcoming', name: 'upcoming', component: () => import('@/pages/UpcomingPage.vue'), meta: { title: 'Upcoming' } },
  { path: '/completed', name: 'completed', component: () => import('@/pages/CompletedPage.vue'), meta: { title: 'Completed' } },
  { path: '/search', name: 'search', component: () => import('@/pages/SearchPage.vue'), meta: { title: 'Search' } },
  { path: '/more', name: 'more', component: () => import('@/pages/MorePage.vue'), meta: { title: 'More' } },
  { path: '/account', name: 'account', component: () => import('@/pages/AccountPage.vue'), meta: { title: 'Account' } },

  // Authentication (cloud mode)
  {
    path: '/login',
    name: 'login',
    component: () => import('@/pages/auth/LoginPage.vue'),
    meta: { title: 'Sign in', auth: true, public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/pages/auth/RegisterPage.vue'),
    meta: { title: 'Create account', auth: true, public: true },
  },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: () => import('@/pages/auth/ForgotPasswordPage.vue'),
    meta: { title: 'Reset password', auth: true, public: true },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: () => import('@/pages/auth/ResetPasswordPage.vue'),
    meta: { title: 'Choose a new password', auth: true, public: true },
  },

  { path: '/:pathMatch(.*)*', redirect: '/today' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  if (!cloudEnabled) {
    // Local-only mode has no accounts.
    return to.meta.auth || to.name === 'account' ? { name: 'today' } : true
  }
  const auth = useAuthStore()
  await auth.init()
  const signedIn = !!auth.user
  if (to.name === 'reset-password') return true // needs the recovery session from the email link
  if (!signedIn && !to.meta.public) return { name: 'login', query: to.fullPath !== '/today' ? { redirect: to.fullPath } : {} }
  if (signedIn && to.meta.auth)
    return { path: typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/') ? to.query.redirect : '/today' }
  return true
})

router.afterEach((to) => {
  const t = to.meta.title
  document.title = t ? `${t} · Daynest` : 'Daynest'
})
