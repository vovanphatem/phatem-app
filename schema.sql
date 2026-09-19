-- ============================================================
-- PHÁT EM — Supabase schema
-- Chạy toàn bộ file này trong Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Bảng profiles (mở rộng auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  credits integer not null default 3,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: user can read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: admin can read all"
  on public.profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "profiles: user can update own non-sensitive fields"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. Trigger: tự tạo profile khi có user mới đăng ký
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, credits)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 3);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 3. Bảng bills (yêu cầu nạp lượt)
create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  credits_requested integer not null check (credits_requested > 0),
  amount_vnd integer not null,
  note text,
  image_path text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- nếu bảng bills đã tồn tại từ trước (chạy lại schema này), đảm bảo có cột ảnh bill
alter table public.bills add column if not exists image_path text;

alter table public.bills enable row level security;

create policy "bills: user can read own"
  on public.bills for select
  using (auth.uid() = user_id);

create policy "bills: admin can read all"
  on public.bills for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy "bills: user can insert own"
  on public.bills for insert
  with check (auth.uid() = user_id);

create policy "bills: admin can update"
  on public.bills for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- 4. Bảng qr_logs (lịch sử tạo QR, không bắt buộc nhưng hữu ích để đối soát)
create table if not exists public.qr_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bank_bin text not null,
  account_number text not null,
  account_name text not null,
  amount_vnd integer,
  template_id integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.qr_logs enable row level security;

create policy "qr_logs: user can read own"
  on public.qr_logs for select
  using (auth.uid() = user_id);

create policy "qr_logs: user can insert own"
  on public.qr_logs for insert
  with check (auth.uid() = user_id);

-- 5. RPC: trừ lượt an toàn (atomic), trả về credits còn lại
create or replace function public.consume_credit(p_bank_bin text, p_account text, p_name text, p_amount integer, p_template integer)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  remaining integer;
begin
  update public.profiles
    set credits = credits - 1
    where id = auth.uid() and credits > 0
    returning credits into remaining;

  if remaining is null then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.qr_logs (user_id, bank_bin, account_number, account_name, amount_vnd, template_id)
    values (auth.uid(), p_bank_bin, p_account, p_name, p_amount, p_template);

  return remaining;
end;
$$;

-- 6. RPC: admin duyệt bill (cộng lượt) — chỉ admin gọi được
create or replace function public.approve_bill(p_bill_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_bill record;
  v_is_admin boolean;
begin
  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_bill from public.bills where id = p_bill_id and status = 'pending' for update;
  if v_bill is null then
    raise exception 'BILL_NOT_FOUND_OR_NOT_PENDING';
  end if;

  update public.profiles set credits = credits + v_bill.credits_requested where id = v_bill.user_id;
  update public.bills set status = 'approved', reviewed_at = now() where id = p_bill_id;
end;
$$;

-- 7. RPC: admin từ chối bill
create or replace function public.reject_bill(p_bill_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'NOT_ADMIN';
  end if;

  update public.bills set status = 'rejected', reviewed_at = now()
    where id = p_bill_id and status = 'pending';
end;
$$;

-- 8. RPC: admin cộng lượt thủ công cho 1 user
create or replace function public.admin_add_credits(p_user_id uuid, p_amount integer)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select is_admin into v_is_admin from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'NOT_ADMIN';
  end if;

  update public.profiles set credits = credits + p_amount where id = p_user_id;
end;
$$;

-- 9. Storage bucket lưu ảnh bill chuyển khoản (private, không public URL trực tiếp)
insert into storage.buckets (id, name, public)
  values ('bill-images', 'bill-images', false)
  on conflict (id) do nothing;

-- User chỉ được upload vào thư mục có tên đúng bằng chính user_id của mình:
-- vd đường dẫn "‹user_id›/1234-bill.jpg"
create policy "bill-images: user can upload own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'bill-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "bill-images: user can read own files"
  on storage.objects for select
  using (
    bucket_id = 'bill-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "bill-images: admin can read all files"
  on storage.objects for select
  using (
    bucket_id = 'bill-images'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ============================================================
-- 10. SAU KHI CHẠY XONG: tự phong admin cho tài khoản của bạn
-- Đăng ký tài khoản trên web trước, rồi chạy lệnh dưới (đổi email):
-- update public.profiles set is_admin = true where email = 'ban@gmail.com';
-- ============================================================
