"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import NavBar from "@/components/NavBar";
import { createClient } from "@/lib/supabase/client";
import { COST_PER_CREDIT } from "@/lib/vietqr";

type Bill = {
  id: string;
  credits_requested: number;
  amount_vnd: number;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  image_path: string | null;
  imageUrl?: string | null;
};

const STATUS_LABEL: Record<string, string> = { pending: "Chờ duyệt", approved: "Đã duyệt", rejected: "Từ chối" };
const BUCKET = "bill-images";

export default function TopupPage() {
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [credits, setCredits] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [wantCredits, setWantCredits] = useState(10);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBills = useCallback(
    async (uid: string) => {
      const { data } = await supabase
        .from("bills")
        .select("id, credits_requested, amount_vnd, status, created_at, image_path")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as Bill[];
      const withUrls = await Promise.all(
        rows.map(async (b) => {
          if (!b.image_path) return b;
          const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(b.image_path, 3600);
          return { ...b, imageUrl: signed?.signedUrl ?? null };
        })
      );
      setBills(withUrls);
    },
    [supabase]
  );

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("credits, is_admin")
        .eq("id", data.user.id)
        .single();
      setCredits(profile?.credits ?? 0);
      setIsAdmin(!!profile?.is_admin);
      loadBills(data.user.id);
    });
  }, [supabase, loadBills]);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (!userId) return;
    if (!file) {
      setError("Vui lòng chọn ảnh bill chuyển khoản trước khi gửi");
      return;
    }
    if (!note.trim()) {
      setError("Vui lòng nhập nội dung chuyển khoản để admin đối chiếu");
      return;
    }
    setSubmitting(true);

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
    if (uploadError) {
      setSubmitting(false);
      setError("Lỗi upload ảnh: " + uploadError.message);
      return;
    }

    const { error: insertError } = await supabase.from("bills").insert({
      user_id: userId,
      credits_requested: wantCredits,
      amount_vnd: wantCredits * COST_PER_CREDIT,
      note: note.trim(),
      image_path: path,
      status: "pending",
    });
    setSubmitting(false);
    if (insertError) {
      setError("Lỗi gửi yêu cầu: " + insertError.message);
      return;
    }
    setMsg("Đã gửi yêu cầu kèm ảnh bill — chờ admin duyệt");
    setNote("");
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadBills(userId);
  }

  function copyText(t: string) {
    navigator.clipboard?.writeText(t);
    setMsg("Đã copy: " + t);
  }

  return (
    <>
      <NavBar initialCredits={credits} isAdmin={isAdmin} />
      <main className="max-w-4xl mx-auto px-4 pb-16">
        <div className="card mb-4">
          <h2 className="text-lg font-bold mb-3">Thông tin chuyển khoản nạp lượt</h2>
          {[
            ["Ngân hàng", "VPBank"],
            ["Số tài khoản", "0382238621"],
            ["Chủ tài khoản", "VÕ VĂN PHÁT EM"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-2 text-sm" style={{ borderBottom: "1px dashed var(--line)" }}>
              <span style={{ color: "var(--sub)" }}>{k}</span>
              <b className={k === "Số tài khoản" ? "cursor-pointer" : ""} onClick={() => k === "Số tài khoản" && copyText(v)}>
                {v}
                {k === "Số tài khoản" ? " 📋" : ""}
              </b>
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="card mb-4">
          <h2 className="text-lg font-bold mb-1">Đăng ký nạp lượt</h2>
          <label>Số lượt muốn nạp</label>
          <input type="number" min={1} value={wantCredits} onChange={(e) => setWantCredits(Math.max(1, Number(e.target.value) || 1))} />
          <p className="text-xs mt-1" style={{ color: "var(--sub)" }}>Đơn giá: {COST_PER_CREDIT.toLocaleString("vi-VN")}đ / lượt</p>
          <div className="flex justify-between py-2 mt-2 text-sm">
            <span style={{ color: "var(--sub)" }}>Tổng tiền cần chuyển</span>
            <b style={{ color: "var(--pink)", fontFamily: "Orbitron" }}>{(wantCredits * COST_PER_CREDIT).toLocaleString("vi-VN")}đ</b>
          </div>

          <label>Ảnh bill chuyển khoản (bắt buộc)</label>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickFile} required />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Xem trước bill" className="mt-3 rounded-lg max-h-64 object-contain" style={{ border: "1px solid var(--line)" }} />
          )}

          <label>Nội dung chuyển khoản bạn đã dùng (để admin dò khớp)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: NAP LUOT NGUYEN VAN A" />

          {error && <p className="text-sm mt-3" style={{ color: "var(--danger)" }}>{error}</p>}
          {msg && <p className="text-sm mt-3" style={{ color: "var(--cyan)" }}>{msg}</p>}
          <button type="submit" className="btn mt-4" disabled={submitting}>
            {submitting ? "Đang gửi..." : "✅ Đã chuyển — Gửi yêu cầu duyệt"}
          </button>
        </form>

        <div className="card">
          <h2 className="text-lg font-bold mb-3">Lịch sử yêu cầu của bạn</h2>
          {bills.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--sub)" }}>Chưa có yêu cầu nào</p>
          ) : (
            <div className="flex flex-col gap-3">
              {bills.map((b) => (
                <div key={b.id} className="flex gap-3 items-center py-2 text-sm" style={{ borderBottom: "1px dashed var(--line)" }}>
                  {b.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.imageUrl} alt="bill" className="w-14 h-14 object-cover rounded-lg" style={{ border: "1px solid var(--line)" }} />
                  ) : (
                    <div className="w-14 h-14 rounded-lg flex items-center justify-center text-xs" style={{ background: "#0a0418", color: "var(--sub)" }}>—</div>
                  )}
                  <div className="flex-1">
                    <div>{new Date(b.created_at).toLocaleString("vi-VN")} · +{b.credits_requested} lượt · {b.amount_vnd.toLocaleString("vi-VN")}đ</div>
                  </div>
                  <span className={`badge badge-${b.status}`}>{STATUS_LABEL[b.status]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
