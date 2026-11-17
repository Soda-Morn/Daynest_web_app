import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import TodayPage from '@/pages/TodayPage.vue'

// Today is the landing page and ships in the main bundle; the rest load on demand.
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/today' },
  { path: '/today', name: 'today', component: TodayPage, meta: { title: 'Today' } },
  { path: '/tasks', name: 'tasks', component: () => import('@/pages/TasksPage.vue'), meta: { title: 'My Tasks' } },
  { path: '/calendar', name: 'calendar', component: () => import('@/pages/CalendarPage.vue'), meta: { title: 'Calendar' } },
  { path: '/upcoming', name: 'upcoming', component: () => import('@/pages/UpcomingPage.vue'), meta: { title: 'Upcoming' } },
  { path: '/completed', name: 'completed', component: () => import('@/pages/CompletedPage.vue'), meta: { title: 'Completed' } },
  { path: '/search', name: 'search', component: () => import('@/pages/SearchPage.vue'), meta: { title: 'Search' } },
  { path: '/more', name: 'more', component: () => import('@/pages/MorePage.vue'), meta: { title: 'More' } },
  { path: '/:pathMatch(.*)*', redirect: '/today' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.afterEach((to) => {
  const t = to.meta.title as string | undefined
  document.title = t ? `${t} · Daynest` : 'Daynest'
})
