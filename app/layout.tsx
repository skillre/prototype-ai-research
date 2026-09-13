import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { DEFAULT_LOCALE } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "原型工作台 Prototype Starter", template: "%s · 原型工作台" },
  description:
    "面向 AI Agent 的高保真交互原型 Starter：Next.js + shadcn/ui + Motion + Zustand + Playwright。",
};

// 在水合前应用主题 class，避免闪烁。
// 由 Server Component 输出 <script>（客户端组件内渲染 script 会有 React 告警）。
const themeScript = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={DEFAULT_LOCALE}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {/* 语言环境：默认 zh-CN。所有界面文案经 useMessages() 读取，见 lib/i18n。 */}
          <LocaleProvider locale={DEFAULT_LOCALE}>
            <TooltipProvider delay={300}>{children}</TooltipProvider>
            {/*
              通知固定在右下角：顶栏右上是账户菜单、通知铃铛与演示控制，
              top-right 的 toast 会直接盖住这些全局控件并拦截点击。
            */}
            <Toaster
              richColors
              position="bottom-right"
              closeButton
              toastOptions={{ className: "font-sans" }}
            />
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
