"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { BanIcon, CopyIcon, PlusIcon, RotateCcwIcon } from "lucide-react"
import { FilterBar } from "@/components/prototype/filter-bar"
import { DataTable, type TableColumn } from "@/components/prototype/data-table"
import { EmptyState } from "@/components/prototype/empty-state"
import { DetailDrawer } from "@/components/prototype/detail-drawer"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useMessages } from "@/components/i18n/locale-provider"
import {
  useDashboardStore,
  selectFilteredCustomers,
  type PlanFilter,
  type SortKey,
  type StatusFilter,
} from "@/stores/dashboard-store"
import type { Customer, CustomerStatus, Plan } from "@/lib/mock-data"
import { formatCurrency, personInitials } from "@/lib/format"
import { cn } from "@/lib/utils"

/** 语义色优先于图表色——与 CRM 的状态视觉保持一致。 */
const STATUS_TONE: Record<CustomerStatus, { dot: string; text: string }> = {
  活跃: { dot: "bg-success", text: "text-success" },
  试用: { dot: "bg-info", text: "text-info" },
  逾期: { dot: "bg-warning", text: "text-warning" },
  已流失: { dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
}

const STATUS_OPTIONS: CustomerStatus[] = ["活跃", "试用", "逾期", "已流失"]
const PLAN_OPTIONS: Plan[] = ["基础版", "专业版", "企业版"]

export function CustomersSection({
  addOpen,
  onAddOpenChange,
}: {
  addOpen: boolean
  onAddOpenChange: (open: boolean) => void
}) {
  const t = useMessages()
  const copy = t.demo.customers

  const customers = useDashboardStore((s) => s.customers)
  const search = useDashboardStore((s) => s.search)
  const statusFilter = useDashboardStore((s) => s.statusFilter)
  const planFilter = useDashboardStore((s) => s.planFilter)
  const sortKey = useDashboardStore((s) => s.sortKey)
  const sortDir = useDashboardStore((s) => s.sortDir)
  const setSearch = useDashboardStore((s) => s.setSearch)
  const setStatusFilter = useDashboardStore((s) => s.setStatusFilter)
  const setPlanFilter = useDashboardStore((s) => s.setPlanFilter)
  const setSortKey = useDashboardStore((s) => s.setSortKey)
  const closeCustomerAccount = useDashboardStore((s) => s.closeCustomerAccount)
  const reopenCustomerAccount = useDashboardStore((s) => s.reopenCustomerAccount)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      selectFilteredCustomers({
        customers,
        search,
        statusFilter,
        planFilter,
        sortKey,
        sortDir,
      } as Parameters<typeof selectFilteredCustomers>[0]),
    [customers, search, statusFilter, planFilter, sortKey, sortDir]
  )

  const selected = selectedId ? (customers.find((c) => c.id === selectedId) ?? null) : null
  const hasActiveFilters = search !== "" || statusFilter !== "all" || planFilter !== "all"

  const resetFilters = () => {
    setSearch("")
    setStatusFilter("all")
    setPlanFilter("all")
  }

  const copyEmail = async () => {
    if (!selected) return
    try {
      await navigator.clipboard.writeText(selected.email)
      toast.success(t.toast.emailCopied, { description: selected.email })
    } catch {
      toast.error(t.toast.clipboardUnavailable, {
        description: t.toast.clipboardUnavailableDescription,
      })
    }
  }

  const columns: TableColumn<Customer>[] = [
    {
      key: "customer",
      header: copy.columns.customer,
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <Avatar size="sm">
            <AvatarFallback className="text-label">{personInitials(row.name, 1)}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-body-sm font-medium">{row.name}</span>
            <span className="truncate text-label text-muted-foreground">{row.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: "plan",
      header: copy.columns.plan,
      cell: (row) => <Badge variant="outline">{row.plan}</Badge>,
    },
    {
      key: "status",
      header: copy.columns.status,
      cell: (row) => {
        const tone = STATUS_TONE[row.status]
        return (
          <span className={cn("inline-flex items-center gap-1.5 text-body-sm", tone.text)}>
            <span className={cn("size-1.5 rounded-full", tone.dot)} />
            {row.status}
          </span>
        )
      },
    },
    {
      key: "mrr",
      header: copy.columns.mrr,
      className: "text-right",
      cell: (row) => (
        <span className={cn("numeric text-body-sm", row.mrr === 0 && "text-muted-foreground")}>
          {row.mrr > 0 ? formatCurrency(row.mrr) : "—"}
        </span>
      ),
    },
    {
      key: "region",
      header: copy.columns.region,
      className: "hidden md:table-cell",
      cell: (row) => <span className="text-body-sm text-muted-foreground">{row.region}</span>,
    },
    {
      key: "lastActive",
      header: copy.columns.lastActive,
      cell: (row) => (
        <span className="text-body-sm whitespace-nowrap text-muted-foreground">
          {row.lastActive}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={copy.searchPlaceholder}
        searchTestId="customer-search"
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        resultCaption={copy.resultCaption(filtered.length, customers.length)}
        actions={
          <Button
            type="button"
            size="sm"
            onClick={() => onAddOpenChange(true)}
            data-testid="add-customer"
          >
            <PlusIcon />
            {copy.addCustomer}
          </Button>
        }
      >
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger size="sm" className="w-32" data-testid="filter-status">
            <SelectValue>
              {(value) => (
                <span className="truncate">
                  {value && value !== "all" ? String(value) : copy.allStatuses}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.allStatuses}</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={planFilter} onValueChange={(value) => setPlanFilter(value as PlanFilter)}>
          <SelectTrigger size="sm" className="w-32" data-testid="filter-plan">
            <SelectValue>
              {(value) => (
                <span className="truncate">
                  {value && value !== "all" ? String(value) : copy.allPlans}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{copy.allPlans}</SelectItem>
            {PLAN_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
          <SelectTrigger size="sm" className="w-40" data-testid="filter-sort">
            <SelectValue>
              {(value) => (
                <span className="truncate">
                  {copy.sortPrefix}
                  {copy.sort[(value as SortKey) ?? "lastActiveHours"]}
                  {sortDir === "desc" ? " ↓" : " ↑"}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(copy.sort) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {copy.sort[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        testId="customers-table"
        columns={columns}
        rows={filtered}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelectedId(row.id)}
        emptyState={
          <EmptyState
            title={copy.empty.title}
            description={search ? copy.empty.withSearch(search) : copy.empty.noSearch}
            action={
              <Button variant="outline" size="sm" onClick={resetFilters}>
                <RotateCcwIcon />
                {copy.clearFilters}
              </Button>
            }
          />
        }
      />

      <AddCustomerDialog open={addOpen} onOpenChange={onAddOpenChange} />

      {selected ? (
        <DetailDrawer
          testId="customer-drawer"
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null)
          }}
          title={selected.name}
          description={selected.email}
          footer={
            <>
              <Button type="button" variant="outline" className="flex-1" onClick={copyEmail}>
                <CopyIcon />
                {copy.drawer.copyEmail}
              </Button>
              {selected.status === "已流失" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    reopenCustomerAccount(selected.id)
                    toast.success(copy.toast.reopened, {
                      description: copy.toast.reopenedDescription(
                        selected.name,
                        formatCurrency(selected.mrr)
                      ),
                    })
                  }}
                >
                  <RotateCcwIcon />
                  {copy.drawer.reopen}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    closeCustomerAccount(selected.id)
                    toast.success(copy.toast.closed, {
                      description: copy.toast.closedDescription(selected.name),
                    })
                  }}
                >
                  <BanIcon />
                  {copy.drawer.closeAccount}
                </Button>
              )}
            </>
          }
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <InfoRow label={copy.drawer.contact} value={selected.contact} />
            <InfoRow label={copy.drawer.plan} value={selected.plan} />
            <InfoRow label={copy.drawer.status} value={selected.status} />
            <InfoRow
              label={copy.drawer.mrr}
              value={selected.mrr > 0 ? formatCurrency(selected.mrr) : "—"}
            />
            <InfoRow
              label={copy.drawer.seats}
              value={selected.seats > 0 ? String(selected.seats) : "—"}
            />
            <InfoRow label={copy.drawer.region} value={selected.region} />
            <InfoRow label={copy.drawer.since} value={selected.since} />
            <InfoRow label={copy.drawer.lastActive} value={selected.lastActive} />
          </div>

          <Separator className="my-5" />

          <div className="flex flex-col gap-1">
            <span className="text-label text-muted-foreground">{copy.drawer.noteLabel}</span>
            <p className="text-body-sm leading-relaxed text-muted-foreground">
              {copy.drawer.note(selected.contact, selected.since)}
            </p>
          </div>
        </DetailDrawer>
      ) : null}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-label text-muted-foreground">{label}</span>
      <span className="truncate text-body-sm font-medium">{value}</span>
    </div>
  )
}

const EMAIL_RE = /^\S+@\S+\.\S+$/

function AddCustomerDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useMessages()
  const copy = t.demo.customers.dialog

  const addCustomer = useDashboardStore((s) => s.addCustomer)
  const setSearch = useDashboardStore((s) => s.setSearch)

  const [name, setName] = useState("")
  const [contact, setContact] = useState("")
  const [email, setEmail] = useState("")
  const [region, setRegion] = useState("")
  const [plan, setPlan] = useState<Plan>("专业版")
  const [status, setStatus] = useState<CustomerStatus>("活跃")
  const [mrr, setMrr] = useState("8600")
  const [seats, setSeats] = useState("12")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = copy.validation.company
    if (!contact.trim()) next.contact = copy.validation.contact
    if (!EMAIL_RE.test(email.trim())) next.email = copy.validation.email
    if (Number.isNaN(Number(mrr)) || Number(mrr) < 0) next.mrr = copy.validation.mrr
    if (Number.isNaN(Number(seats)) || Number(seats) < 1) next.seats = copy.validation.seats
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = () => {
    if (!validate()) return
    addCustomer({
      name,
      contact,
      email,
      plan,
      status,
      mrr: Number(mrr),
      seats: Number(seats),
      region: region.trim() || copy.placeholderRegion,
    })
    setSearch("")
    toast.success(t.demo.customers.toast.added(name.trim()), {
      description: t.demo.customers.toast.addedDescription(plan, formatCurrency(Number(mrr))),
    })
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setErrors({})
        }
        onOpenChange(next)
      }}
    >
      <DialogContent data-testid="add-customer-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label={copy.company} error={errors.name} className="col-span-2">
            <Input
              data-testid="add-customer-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={copy.placeholderCompany}
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label={copy.contact} error={errors.contact}>
            <Input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder={copy.placeholderContact}
              aria-invalid={Boolean(errors.contact)}
            />
          </Field>
          <Field label={copy.email} error={errors.email}>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={copy.placeholderEmail}
              aria-invalid={Boolean(errors.email)}
            />
          </Field>
          <Field label={copy.plan}>
            <Select value={plan} onValueChange={(value) => setPlan(value as Plan)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={copy.status}>
            <Select value={status} onValueChange={(value) => setStatus(value as CustomerStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={copy.mrr} error={errors.mrr}>
            <Input
              type="number"
              min={0}
              value={mrr}
              onChange={(event) => setMrr(event.target.value)}
              aria-invalid={Boolean(errors.mrr)}
            />
          </Field>
          <Field label={copy.seats} error={errors.seats}>
            <Input
              type="number"
              min={1}
              value={seats}
              onChange={(event) => setSeats(event.target.value)}
              aria-invalid={Boolean(errors.seats)}
            />
          </Field>
          <Field label={copy.region} className="col-span-2">
            <Input
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder={copy.placeholderRegion}
            />
          </Field>
        </div>

        <DialogFooter showCloseButton={false}>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t.common.cancel}
          </DialogClose>
          <Button type="button" onClick={submit} data-testid="add-customer-submit">
            <PlusIcon />
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-label font-medium text-muted-foreground">{label}</label>
      {children}
      {error ? (
        <span role="alert" className="text-label text-danger">
          {error}
        </span>
      ) : null}
    </div>
  )
}
