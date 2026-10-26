import type { Metadata } from "next";
import { AdminApp } from "@/components/admin";
import { adminConfigured } from "@/lib/admin-auth";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <AdminApp configured={adminConfigured()} />;
}
