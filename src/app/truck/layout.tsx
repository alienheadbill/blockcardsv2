import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell ws="truck">
      <Suspense>{children}</Suspense>
    </AppShell>
  );
}
