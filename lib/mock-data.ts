/**
 * 内置演示工作区（/demo）的真实感 mock 数据——B2B 增长分析产品「云图分析」。
 *
 * 这里放的是**记录内容**而不是界面文案：公司名、联系人、金额、时间线都需要
 * 具体、自然，因此直接以中文写成数据；界面文案一律走 lib/i18n。
 */

export type Plan = "基础版" | "专业版" | "企业版"
export type CustomerStatus = "活跃" | "试用" | "逾期" | "已流失"

export interface Customer {
  id: string
  name: string
  contact: string
  email: string
  plan: Plan
  status: CustomerStatus
  /** 月经常性收入（元）。 */
  mrr: number
  region: string
  lastActive: string
  /** 距上次活跃的小时数——用于排序（不直接展示）。 */
  lastActiveHours: number
  since: string
  seats: number
}

export const CUSTOMERS: Customer[] = [
  { id: "hanzhou",    name: "瀚舟数据",  contact: "张启明", email: "zhangqiming@hanzhou-data.cn",  plan: "专业版", status: "活跃",   mrr: 8600,   region: "上海", lastActive: "2小时前",  lastActiveHours: 2,   since: "2025年1月",  seats: 42 },
  { id: "julang",     name: "巨浪云",    contact: "陆文轩", email: "luwenxuan@julang-cloud.cn",    plan: "企业版", status: "活跃",   mrr: 68000,  region: "北京", lastActive: "12分钟前", lastActiveHours: 0.2, since: "2024年3月",  seats: 240 },
  { id: "tiangong",   name: "天工智能",  contact: "何静宜", email: "hejingyi@tiangong-ai.cn",      plan: "企业版", status: "活跃",   mrr: 42000,  region: "杭州", lastActive: "26分钟前", lastActiveHours: 0.4, since: "2024年9月",  seats: 130 },
  { id: "mingchuan",  name: "茗川健康",  contact: "苏航",   email: "suhang@mingchuan-health.cn",   plan: "企业版", status: "活跃",   mrr: 55000,  region: "上海", lastActive: "1小时前",  lastActiveHours: 1,   since: "2024年11月", seats: 175 },
  { id: "xingcha",    name: "星槎出行",  contact: "郑一诺", email: "zhengyinuo@xingcha-mobility.cn", plan: "专业版", status: "活跃", mrr: 18600,  region: "深圳", lastActive: "4分钟前",  lastActiveHours: 0.1, since: "2025年2月",  seats: 68 },
  { id: "shiguang",   name: "拾光教育",  contact: "方雅琴", email: "fangyaqin@shiguang-edu.cn",    plan: "专业版", status: "活跃",   mrr: 15200,  region: "成都", lastActive: "1天前",   lastActiveHours: 26,  since: "2025年4月",  seats: 51 },
  { id: "changfeng",  name: "长风物流",  contact: "邵振宇", email: "shaozhenyu@changfeng-logi.cn", plan: "专业版", status: "活跃",   mrr: 26400,  region: "广州", lastActive: "55分钟前", lastActiveHours: 0.9, since: "2024年6月",  seats: 88 },
  { id: "mushi",      name: "木石家居",  contact: "崔明哲", email: "cuimingzhe@mushi-home.cn",     plan: "基础版", status: "活跃",   mrr: 1980,   region: "苏州", lastActive: "6小时前",  lastActiveHours: 6,   since: "2025年8月",  seats: 6 },
  { id: "qihuang",    name: "岐黄生物",  contact: "唐雨薇", email: "tangyuwei@qihuang-bio.cn",     plan: "专业版", status: "试用",   mrr: 0,      region: "南京", lastActive: "3天前",   lastActiveHours: 72,  since: "2026年9月",  seats: 0 },
  { id: "wangjiang",  name: "望江纺织",  contact: "蒋立诚", email: "jianglicheng@wangjiang-tex.cn", plan: "企业版", status: "试用",  mrr: 0,      region: "武汉", lastActive: "2天前",   lastActiveHours: 48,  since: "2026年9月",  seats: 0 },
  { id: "mingtang",   name: "明堂建筑",  contact: "康雨萌", email: "kangyumeng@mingtang-arch.cn",  plan: "专业版", status: "逾期",   mrr: 11400,  region: "西安", lastActive: "5天前",   lastActiveHours: 120, since: "2024年12月", seats: 54 },
  { id: "jialan",     name: "珈蓝食品",  contact: "秦致远", email: "qinzhiyuan@jialan-food.cn",    plan: "基础版", status: "逾期",   mrr: 1380,   region: "重庆", lastActive: "9天前",   lastActiveHours: 216, since: "2025年7月",  seats: 8 },
  { id: "bailu",      name: "白鹿文创",  contact: "罗晓彤", email: "luoxiaotong@bailu-culture.cn", plan: "基础版", status: "已流失", mrr: 0,      region: "长沙", lastActive: "32天前",  lastActiveHours: 768, since: "2024年5月",  seats: 0 },
  { id: "dingfeng",   name: "鼎峰重工",  contact: "段天成", email: "duantiancheng@dingfeng-hi.cn", plan: "基础版", status: "已流失", mrr: 0,      region: "青岛", lastActive: "41天前",  lastActiveHours: 984, since: "2024年1月",  seats: 0 },
]

export interface RevenuePoint {
  month: string
  revenue: number
  expenses: number
}

/**
 * 近 12 个月（10月 → 9月）的收入与支出，单位：元。
 * 最后一个月与 KPIS.mrr 对齐，避免「指标」和「图表」讲两个不同的故事。
 */
export const REVENUE_SERIES: RevenuePoint[] = [
  { month: "10月", revenue: 118000, expenses: 82000 },
  { month: "11月", revenue: 126500, expenses: 84500 },
  { month: "12月", revenue: 134200, expenses: 86000 },
  { month: "1月",  revenue: 142800, expenses: 88300 },
  { month: "2月",  revenue: 151000, expenses: 90100 },
  { month: "3月",  revenue: 162400, expenses: 92600 },
  { month: "4月",  revenue: 174600, expenses: 95200 },
  { month: "5月",  revenue: 188300, expenses: 98400 },
  { month: "6月",  revenue: 203500, expenses: 101800 },
  { month: "7月",  revenue: 219700, expenses: 105300 },
  { month: "8月",  revenue: 233900, expenses: 108600 },
  { month: "9月",  revenue: 248560, expenses: 112400 },
]

export interface ChannelShare {
  name: string
  value: number
  color: string
}

export const CHANNEL_SHARE: ChannelShare[] = [
  { name: "自然搜索", value: 38, color: "var(--chart-1)" },
  { name: "付费广告", value: 24, color: "var(--chart-2)" },
  { name: "客户推荐", value: 19, color: "var(--chart-3)" },
  { name: "社交媒体", value: 12, color: "var(--chart-4)" },
  { name: "直接访问", value: 7,  color: "var(--chart-5)" },
]

export interface Priority {
  id: string
  title: string
  tag: string
  tagTone: "blue" | "violet" | "emerald" | "amber" | "rose"
}

export const PRIORITIES: Priority[] = [
  { id: "p1", title: "上线 2.0 版引导流程", tag: "产品", tagTone: "blue" },
  { id: "p2", title: "复盘第四季度增购管线", tag: "收入", tagTone: "emerald" },
  { id: "p3", title: "修复 iOS 端移动导航卡顿", tag: "缺陷", tagTone: "rose" },
  { id: "p4", title: "起草按席位计价的定价方案", tag: "定价", tagTone: "violet" },
  { id: "p5", title: "安排 5 场用户访谈", tag: "调研", tagTone: "amber" },
]

export interface AppNotification {
  id: string
  kind: "payment" | "trial" | "usage" | "report"
  title: string
  description: string
  time: string
  unread: boolean
}

export const NOTIFICATIONS: AppNotification[] = [
  { id: "n1", kind: "trial",   title: "新的企业试用",   description: "望江纺织开始了 14 天试用",       time: "2小时前", unread: true },
  { id: "n2", kind: "payment", title: "付款逾期",       description: "明堂建筑有一笔账单逾期",         time: "5小时前", unread: true },
  { id: "n3", kind: "usage",   title: "用量达到上限",   description: "巨浪云席位使用率达 90%",         time: "1天前",   unread: true },
  { id: "n4", kind: "report",  title: "每周报告已生成", description: "9月1日 – 9月7日 摘要已就绪",      time: "2天前",   unread: false },
  { id: "n5", kind: "usage",   title: "用量突增",       description: "星槎出行今日 API 调用翻倍",      time: "2天前",   unread: false },
]

export interface ActivityEvent {
  id: string
  actor: string
  action: string
  time: string
}

/** 头像文字由 personInitials(actor) 派生，不在这里重复存一份。 */
export const ACTIVITY: ActivityEvent[] = [
  { id: "a1", actor: "张启明", action: "将瀚舟数据升级到专业版",     time: "18分钟前" },
  { id: "a2", actor: "郑一诺", action: "邀请 12 位成员加入星槎出行",  time: "1小时前" },
  { id: "a3", actor: "蒋立诚", action: "在望江纺织开始试用",         time: "2小时前" },
  { id: "a4", actor: "康雨萌", action: "导出明堂建筑的账单历史",     time: "4小时前" },
  { id: "a5", actor: "崔明哲", action: "为木石家居新建了一个工作区", time: "6小时前" },
]

/** 总览页 KPIs。mrr 等于上面未流失账户的月经常性收入之和。 */
export const KPIS = {
  mrr: 248560,
  mrrDelta: 12.4,
  activeUsers: 8429,
  activeUsersDelta: 8.1,
  conversionRate: 3.42,
  conversionDelta: -0.4,
  avgSessionSeconds: 278,
  avgSessionDelta: 5.2,
} as const
