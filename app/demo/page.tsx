import type { Metadata } from "next"
import { messages } from "@/lib/i18n"
import { DemoApp } from "./_components/demo-app"

export const metadata: Metadata = {
  title: messages.demo.meta.title,
  description: messages.demo.meta.description,
}

export default function DemoPage() {
  return <DemoApp />
}
