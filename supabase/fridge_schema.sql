-- ============================================================
-- 智能冰箱 · 家人共享表（fridge_household）
-- 作用：让全家共用同一份冰箱数据（库存 / 日志 / 采购清单）。
-- 方式：用一串难猜的 household_id（共享码 FRxxxx）作为访问密钥，
--       任何人拿到共享码即可读写该家庭的冰箱数据；anon key 开放访问。
-- 运行：到 Supabase 控制台 → SQL Editor → 粘贴本文件 → Run。
-- 仅需执行一次。
-- ============================================================

create table if not exists public.fridge_household (
  household_id text primary key,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   text
);

alter table public.fridge_household enable row level security;

-- anon key 可读写（安全性靠难猜的 household_id 当密钥）
drop policy if exists "fridge_household_anon_all" on public.fridge_household;
create policy "fridge_household_anon_all"
  on public.fridge_household
  for all
  to anon
  using (true)
  with check (true);
