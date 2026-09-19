# PHÁT EM — Hướng dẫn deploy (miễn phí, ~15 phút)

Web đăng ký tài khoản thật (email + mật khẩu), mỗi người có lượt riêng, tạo QR chuyển khoản
VietQR theo mẫu, nạp lượt qua chuyển khoản + admin duyệt. Dữ liệu lưu trong database Postgres
thật (Supabase), không có dữ liệu giả.

Bạn **không cần biết code**, chỉ cần làm theo đúng các bước dưới đây.

---

## Bước 1 — Tạo project Supabase (database + đăng nhập)

1. Vào https://supabase.com → **Start your project** → đăng nhập bằng GitHub/Google (miễn phí).
2. **New project** → đặt tên (vd `phatem`), đặt mật khẩu database bất kỳ, chọn khu vực gần VN
   (Singapore), bấm **Create new project**. Đợi ~2 phút để khởi tạo.
3. Vào menu bên trái **SQL Editor** → **New query**.
4. Mở file `supabase/schema.sql` trong bộ mã nguồn này, copy **toàn bộ nội dung**, dán vào ô
   query → bấm **Run**. Nếu chạy thành công sẽ không có báo lỗi đỏ.
5. Vào menu **Project Settings** (biểu tượng bánh răng) → **Data API**. Ghi lại 2 giá trị:
   - **Project URL** (dạng `https://xxxx.supabase.co`)
   - **anon public key** (chuỗi dài bắt đầu `eyJ...`)
   → Đây chính là 2 biến môi trường bạn sẽ cần ở Bước 3.
6. Vào **Authentication → Providers**, đảm bảo **Email** đang bật (mặc định đã bật sẵn).
   Có thể tắt "Confirm email" nếu muốn người dùng đăng ký xong dùng được ngay (không cần xác
   nhận email) — tuỳ bạn.

## Bước 2 — Đưa code lên GitHub

1. Vào https://github.com → **New repository** → đặt tên `phatem-app` → **Create repository**
   (để Public hoặc Private đều được).
2. Trong trang repo vừa tạo, chọn **uploading an existing file** → kéo thả **toàn bộ** các file/
   thư mục trong bộ mã nguồn này vào (trừ `node_modules` và `.next` nếu có — bản tải về đã
   không kèm 2 thư mục này) → **Commit changes**.

   *(Nếu bạn biết dùng git/terminal, cách nhanh hơn: `git init && git add . && git commit -m init`
   rồi `git remote add origin <url repo>` và `git push`.)*

## Bước 3 — Deploy lên Vercel

1. Vào https://vercel.com → đăng nhập bằng GitHub (miễn phí).
2. **Add New → Project** → chọn repo `phatem-app` vừa tạo → **Import**.
3. Ở mục **Environment Variables**, thêm đúng 2 dòng (dán giá trị đã lấy ở Bước 1.5):
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
4. Bấm **Deploy**. Đợi 1–2 phút, Vercel build xong sẽ cho bạn 1 link dạng
   `phatem-app-xxxx.vercel.app`.

### Đổi tên miền thành `phatem.vercel.app`
Vào project trên Vercel → **Settings → Domains**, hoặc **Settings → General → Project Name**,
đổi tên project thành `phatem`. Nếu tên `phatem.vercel.app` chưa ai lấy, domain của bạn sẽ tự
thành đúng `phatem.vercel.app`. Nếu đã có người dùng tên đó, Vercel sẽ báo và bạn cần chọn tên
khác (vd `phatem-em.vercel.app`).

## Bước 4 — Tự phong Admin cho tài khoản của bạn

1. Mở link web vừa deploy → **Đăng ký** một tài khoản bằng email của bạn.
2. Quay lại Supabase → **SQL Editor** → chạy lệnh (đổi đúng email bạn vừa đăng ký):
   ```sql
   update public.profiles set is_admin = true where email = 'ban@gmail.com';
   ```
3. Đăng nhập lại vào web → vào tab **Admin** → bạn sẽ thấy đầy đủ danh sách user/bill để duyệt.

---

## Cấu trúc & những gì đã làm thật

- **Đăng ký/đăng nhập**: Supabase Auth (email + mật khẩu thật, mã hoá, có thể bật xác nhận email).
- **Lượt của mỗi người**: bảng `profiles.credits`, mặc định tặng 3 lượt khi đăng ký (trigger SQL).
- **Tạo QR**: sinh mã theo đúng chuẩn **VietQR/EMVCo** (napas), quét được bằng app ngân hàng thật.
  Trừ lượt qua hàm SQL `consume_credit` (atomic, không thể tạo QR khi hết lượt kể cả bấm nhanh
  nhiều lần).
- **Nạp lượt**: người dùng gửi yêu cầu (bảng `bills`, trạng thái `pending`) kèm nội dung chuyển
  khoản để admin đối chiếu; admin **Duyệt** sẽ tự cộng đúng số lượt qua hàm SQL `approve_bill`.
- **Bảo mật dữ liệu**: dùng Row Level Security (RLS) của Supabase — người dùng chỉ đọc được dữ
  liệu của chính mình; các thao tác nhạy cảm (duyệt bill, cộng lượt) chỉ chạy được nếu tài khoản
  có `is_admin = true`, kiểm tra ngay trong hàm SQL phía server, không thể giả mạo từ trình duyệt.

## Ảnh bill nạp lượt

- Khi nạp lượt, người dùng **bắt buộc** chọn ảnh bill chuyển khoản trước khi gửi yêu cầu.
- Ảnh được upload lên **Supabase Storage**, bucket `bill-images` (bucket này được tự tạo khi
  bạn chạy `supabase/schema.sql` ở Bước 1 — không cần thao tác gì thêm).
- Bucket ở chế độ **private**: mỗi người chỉ đọc được ảnh của chính mình; admin đọc được ảnh của
  tất cả mọi người (kiểm tra qua RLS ngay ở tầng database, không lộ ảnh ra ngoài).
- Trong trang **Admin**, mỗi yêu cầu chờ duyệt hiện kèm ảnh thu nhỏ (bấm vào xem full); ở bảng
  "Toàn bộ giao dịch" có link "Xem ảnh".

## Giới hạn hiện tại (có thể nhờ mình bổ sung sau)

- Mẫu QR hiện có 3 mẫu dựng bằng CSS (Neon Grid / Glass Purple / Minimal Dark). Muốn thêm mẫu
  theo ảnh logo/thiết kế riêng của bạn, gửi mình ảnh mẫu, mình chỉnh code theo đúng mẫu đó.
- Gói miễn phí của Supabase/Vercel đủ dùng cho quy mô nhỏ-vừa; khi có nhiều người dùng thật, cân
  nhắc nâng cấp gói trả phí của Supabase để tránh giới hạn băng thông/kết nối.
