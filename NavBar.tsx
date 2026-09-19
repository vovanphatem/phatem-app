"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NavBar({ initialCredits, isAdmin }: { initialCredits: number; isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [credits, setCredits] = useState(initialCredits);

  useEffect(() => {
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getUser().then(({ data }) => {
      userId = data.user?.id ?? null;
      if (!userId) return;
      channel = supabase
        .channel("profile-credits")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
          (payload) => setCredits((payload.new as { credits: number }).credits)
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [supabase]);

  const tabs = [
    { href: "/dashboard", label: "Trang chủ" },
    { href: "/create", label: "Tạo QR" },
    { href: "/topup", label: "Nạp lượt" },
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="max-w-4xl mx-auto px-4 pt-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="text-xl font-extrabold logo-gradient">⚡ PHÁT EM</div>
        <div className="flex items-center gap-3">
          <div
            className="font-bold px-4 py-2 rounded-xl text-sm"
            style={{
              background: "linear-gradient(135deg,var(--panel2),var(--panel))",
              border: "1px solid var(--purple)",
              color: "var(--pink)",
              boxShadow: "0 0 18px rgba(168,85,247,.35)",
            }}
          >
            {credits} lượt
          </div>
          <button onClick={logout} className="btn-outline btn-sm">
            Đăng xuất
          </button>
        </div>
      </div>
      <nav className="flex gap-2 flex-wrap mb-6">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="px-4 py-2 rounded-xl text-sm font-semibold"
            style={
              pathname === t.href
                ? { background: "linear-gradient(135deg,var(--purple2),var(--purple))", color: "#fff" }
                : { background: "var(--panel)", color: "var(--sub)", border: "1px solid var(--line)" }
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
