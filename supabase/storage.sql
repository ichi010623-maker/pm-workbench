-- 硬件PM工作台 · Supabase Storage 桶（云端资讯 / 简报快照 / 推送订阅）
-- 用途：
--   1) 每日自动化抓取资讯 → 写入 news.json
--   2) App 前端（anon key）写入 brief/snapshot.json、push/subs.json
--   3) 全部对象「公开读 + anon 写」（数据均为非敏感的资讯/计数/推送端点）
--
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴本文件 → Run

-- 1) 创建公开桶（已存在则跳过，并确保 public=true）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-content', 'app-content', true, 5242880, null)
on conflict (id) do update set public = true;

-- 2) 开启 storage.objects 的行级安全（现代 Supabase 默认已开启，幂等操作）
alter table storage.objects enable row level security;

-- 3) 公开读：任何人（含未登录）可读取桶内对象
drop policy if exists "app_content_public_read" on storage.objects;
create policy "app_content_public_read"
  on storage.objects for select
  using ( bucket_id = 'app-content' );

-- 4) anon / authenticated 可写入（insert/update/delete）本桶对象
--    简报快照与推送订阅由前端 anon key 直接写，无需登录
drop policy if exists "app_content_anon_write" on storage.objects;
create policy "app_content_anon_write"
  on storage.objects for insert
  with check ( bucket_id = 'app-content' );

drop policy if exists "app_content_anon_update" on storage.objects;
create policy "app_content_anon_update"
  on storage.objects for update
  using ( bucket_id = 'app-content' )
  with check ( bucket_id = 'app-content' );

drop policy if exists "app_content_anon_delete" on storage.objects;
create policy "app_content_anon_delete"
  on storage.objects for delete
  using ( bucket_id = 'app-content' );
