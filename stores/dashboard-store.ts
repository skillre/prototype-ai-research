"use client"

import { create } from "zustand"
import {
  ACTIVITY,
  CUSTOMERS,
  KPIS,
  NOTIFICATIONS,
  PRIORITIES,
  type ActivityEvent,
  type AppNotification,
  type Customer,
  type CustomerStatus,
  type Plan,
  type Priority,
} from "@/lib/mock-data"
import { messages as t } from "@/lib/i18n"

export type DataStatus = "loading" | "ready" | "error"
export type StatusFilter = CustomerStatus | "all"
export type PlanFilter = Plan | "all"
export type SortKey = "lastActiveHours" | "mrr" | "name" | "since"
export type SortDir = "asc" | "desc"

export interface NewCustomerInput {
  name: string
  contact: string
  email: string
  plan: Plan
  status: CustomerStatus
  mrr: number
  region: string
  seats: number
}

interface DashboardState {
  status: DataStatus
  errorMessage: string | null

  customers: Customer[]
  priorities: Priority[]
  notifications: AppNotification[]
  activities: ActivityEvent[]
  kpis: typeof KPIS

  search: string
  statusFilter: StatusFilter
  planFilter: PlanFilter
  sortKey: SortKey
  sortDir: SortDir

  initialize: () => void
  refresh: () => void
  simulateApiFailure: () => void
  resetDemo: () => void
  setSearch: (value: string) => void
  setStatusFilter: (value: StatusFilter) => void
  setPlanFilter: (value: PlanFilter) => void
  setSortKey: (key: SortKey) => void
  toggleSortDir: () => void
  addCustomer: (input: NewCustomerInput) => void
  closeCustomerAccount: (id: string) => void
  reopenCustomerAccount: (id: string) => void
  reorderPriorities: (ordered: Priority[]) => void
  markAllNotificationsRead: () => void
  markNotificationRead: (id: string) => void
}

const SIMULATED_LATENCY = 1100

export const useDashboardStore = create<DashboardState>((set, get) => ({
  status: "loading",
  errorMessage: null,

  customers: [],
  priorities: PRIORITIES,
  notifications: NOTIFICATIONS,
  activities: ACTIVITY,
  kpis: KPIS,

  search: "",
  statusFilter: "all",
  planFilter: "all",
  sortKey: "lastActiveHours",
  sortDir: "asc",

  initialize: () => {
    if (get().status === "ready") return
    set({ status: "loading", errorMessage: null })
    setTimeout(() => {
      set({ status: "ready", customers: [...CUSTOMERS] })
    }, SIMULATED_LATENCY)
  },

  refresh: () => {
    set({ status: "loading", errorMessage: null })
    setTimeout(() => {
      set({ status: "ready", customers: [...CUSTOMERS] })
    }, SIMULATED_LATENCY)
  },

  simulateApiFailure: () => {
    set({
      status: "error",
      errorMessage: "无法连接 api.yuntu-analytics.cn —— 请求在 10 秒后超时。",
    })
  },

  resetDemo: () => {
    set({
      status: "ready",
      errorMessage: null,
      customers: [...CUSTOMERS],
      priorities: [...PRIORITIES],
      notifications: NOTIFICATIONS.map((n) => ({ ...n })),
      search: "",
      statusFilter: "all",
      planFilter: "all",
      sortKey: "lastActiveHours",
      sortDir: "asc",
    })
  },

  setSearch: (value) => set({ search: value }),
  setStatusFilter: (value) => set({ statusFilter: value }),
  setPlanFilter: (value) => set({ planFilter: value }),
  setSortKey: (key) =>
    set((state) => ({
      sortKey: key,
      sortDir: state.sortKey === key ? (state.sortDir === "asc" ? "desc" : "asc") : "asc",
    })),
  toggleSortDir: () =>
    set((state) => ({ sortDir: state.sortDir === "asc" ? "desc" : "asc" })),

  addCustomer: (input) => {
    const customer: Customer = {
      id: `cus-${Date.now()}`,
      name: input.name.trim(),
      contact: input.contact.trim(),
      email: input.email.trim(),
      plan: input.plan,
      status: input.status,
      mrr: input.mrr,
      region: input.region.trim(),
      lastActive: t.data.justNow,
      lastActiveHours: 0,
      since: t.data.currentMonth,
      seats: input.seats,
    }
    set((state) => ({ customers: [customer, ...state.customers] }))
  },

  closeCustomerAccount: (id) =>
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === id
          ? { ...c, status: "已流失" as CustomerStatus, mrr: 0, lastActive: "刚刚", lastActiveHours: 0, seats: 0 }
          : c
      ),
    })),

  reopenCustomerAccount: (id) =>
    set((state) => ({
      customers: state.customers.map((c) =>
        c.id === id
          ? { ...c, status: "活跃" as CustomerStatus, lastActive: "刚刚", lastActiveHours: 0 }
          : c
      ),
    })),

  reorderPriorities: (ordered) => set({ priorities: ordered }),

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, unread: false })),
    })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, unread: false } : n
      ),
    })),
}))

/** Pure selector: apply the current filters + sort to the customer list. */
export function selectFilteredCustomers(state: DashboardState): Customer[] {
  const { customers, search, statusFilter, planFilter, sortKey, sortDir } = state
  const query = search.trim().toLowerCase()

  const filtered = customers.filter((c) => {
    if (query && !(`${c.name} ${c.contact} ${c.email} ${c.region}`.toLowerCase().includes(query))) {
      return false
    }
    if (statusFilter !== "all" && c.status !== statusFilter) return false
    if (planFilter !== "all" && c.plan !== planFilter) return false
    return true
  })

  const direction = sortDir === "asc" ? 1 : -1
  return [...filtered].sort((a, b) => {
    switch (sortKey) {
      case "mrr":
        return (a.mrr - b.mrr) * direction
      case "name":
        return a.name.localeCompare(b.name) * direction
      case "since":
        return a.since.localeCompare(b.since) * direction
      case "lastActiveHours":
      default:
        return (a.lastActiveHours - b.lastActiveHours) * direction
    }
  })
}