create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "Profiles readable by authenticated users" on public.profiles;
create policy "Profiles readable by authenticated users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.chat_rooms enable row level security;

drop policy if exists "Chat rooms readable by authenticated users" on public.chat_rooms;
create policy "Chat rooms readable by authenticated users"
  on public.chat_rooms for select to authenticated using (true);

drop policy if exists "Users create chat rooms" on public.chat_rooms;
create policy "Users create chat rooms"
  on public.chat_rooms for insert to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "Users update own chat rooms" on public.chat_rooms;
create policy "Users update own chat rooms"
  on public.chat_rooms for update to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

insert into public.chat_rooms (name, slug, description, is_default)
values ('Global', 'global', 'The default WorldChat room for everyone.', true)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      is_default = true;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  text text not null default '',
  mentions text[] not null default '{}',
  is_anonymous boolean not null default false,
  pdf_url text,
  pdf_name text,
  pdf_size integer,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;

alter table public.messages
  add column if not exists room_id uuid references public.chat_rooms(id) on delete cascade,
  add column if not exists is_anonymous boolean not null default false;

update public.messages
set room_id = (select id from public.chat_rooms where slug = 'global')
where room_id is null;

alter table public.messages
  alter column room_id set not null;

drop policy if exists "Messages readable by authenticated users" on public.messages;
create policy "Messages readable by authenticated users"
  on public.messages for select to authenticated using (true);

drop policy if exists "Users insert own messages" on public.messages;
create policy "Users insert own messages"
  on public.messages for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own messages" on public.messages;
create policy "Users delete own messages"
  on public.messages for delete to authenticated
  using (auth.uid() = user_id);

create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists chat_rooms_created_at_idx on public.chat_rooms (created_at desc);
create index if not exists messages_room_created_at_idx on public.messages (room_id, created_at desc);

do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.chat_rooms;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create table if not exists public.mention_reads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now()
);
alter table public.mention_reads enable row level security;

drop policy if exists "Users read own mention_reads" on public.mention_reads;
create policy "Users read own mention_reads"
  on public.mention_reads for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users upsert own mention_reads" on public.mention_reads;
create policy "Users upsert own mention_reads"
  on public.mention_reads for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own mention_reads" on public.mention_reads;
create policy "Users update own mention_reads"
  on public.mention_reads for update to authenticated
  using (auth.uid() = user_id);

create or replace function public.slugify_username(input text)
returns text language plpgsql immutable security invoker set search_path = public as $$
declare
  result text;
begin
  result := lower(coalesce(input, 'user'));
  result := regexp_replace(result, '[^a-z0-9]+', '_', 'g');
  result := regexp_replace(result, '^_+|_+$', '', 'g');
  if result is null or length(result) = 0 then
    result := 'user';
  end if;
  return left(result, 24);
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_name text;
  candidate text;
  suffix int := 0;
  display text;
  avatar text;
begin
  display := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(coalesce(new.email, 'user'), '@', 1)
  );
  avatar := new.raw_user_meta_data->>'avatar_url';
  base_name := public.slugify_username(display);
  candidate := base_name;

  while exists(select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base_name || '_' || (floor(random() * 9000) + 100)::int;
    if suffix > 20 then
      candidate := base_name || '_' || substr(new.id::text, 1, 6);
      exit;
    end if;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, candidate, display, avatar)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.slugify_username(text) from public, anon, authenticated;

create or replace function public.bootstrap_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  profile_row public.profiles;
  base_name text;
  candidate text;
  display text;
  avatar text;
  suffix int := 0;
begin
  if current_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select *
  into profile_row
  from public.profiles
  where id = current_user_id;

  if found then
    return profile_row;
  end if;

  display := coalesce(
    auth.jwt()->'user_metadata'->>'full_name',
    auth.jwt()->'user_metadata'->>'name',
    split_part(coalesce(auth.jwt()->>'email', 'user'), '@', 1),
    'WorldChat user'
  );
  avatar := auth.jwt()->'user_metadata'->>'avatar_url';
  base_name := public.slugify_username(display);
  candidate := base_name || '_' || substr(current_user_id::text, 1, 6);

  while exists(select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := base_name || '_' || substr(current_user_id::text, 1, 6) || '_' || suffix;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (current_user_id, candidate, display, avatar)
  returning * into profile_row;

  return profile_row;
end;
$$;

revoke execute on function public.bootstrap_profile() from public, anon;
grant execute on function public.bootstrap_profile() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', true, 1048576, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users list own PDFs" on storage.objects;
create policy "Users list own PDFs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users upload own PDFs" on storage.objects;
create policy "Users upload own PDFs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete own PDFs" on storage.objects;
create policy "Users delete own PDFs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
