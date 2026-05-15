
-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "Profiles readable by authenticated users"
  on public.profiles for select to authenticated using (true);

create policy "Users insert own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- MESSAGES
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  text text not null default '',
  mentions text[] not null default '{}',
  pdf_url text,
  pdf_name text,
  pdf_size integer,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;

create policy "Messages readable by authenticated users"
  on public.messages for select to authenticated using (true);

create policy "Users insert own messages"
  on public.messages for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users delete own messages"
  on public.messages for delete to authenticated
  using (auth.uid() = user_id);

create index messages_created_at_idx on public.messages (created_at desc);

alter publication supabase_realtime add table public.messages;

-- MENTION READS (notification badges)
create table public.mention_reads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now()
);
alter table public.mention_reads enable row level security;

create policy "Users read own mention_reads"
  on public.mention_reads for select to authenticated
  using (auth.uid() = user_id);
create policy "Users upsert own mention_reads"
  on public.mention_reads for insert to authenticated
  with check (auth.uid() = user_id);
create policy "Users update own mention_reads"
  on public.mention_reads for update to authenticated
  using (auth.uid() = user_id);

-- USERNAME GENERATION + AUTO PROFILE
create or replace function public.slugify_username(input text)
returns text language plpgsql immutable as $$
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
    split_part(coalesce(new.email,'user'), '@', 1)
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
  values (new.id, candidate, display, avatar);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- STORAGE BUCKET for PDFs (1 MB max)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdfs', 'pdfs', true, 1048576, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "PDFs publicly readable"
  on storage.objects for select
  using (bucket_id = 'pdfs');

create policy "Users upload own PDFs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own PDFs"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
