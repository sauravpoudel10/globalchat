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

alter table public.messages
  add column if not exists room_id uuid references public.chat_rooms(id) on delete cascade,
  add column if not exists is_anonymous boolean not null default false;

update public.messages
set room_id = (select id from public.chat_rooms where slug = 'global')
where room_id is null;

alter table public.messages
  alter column room_id set not null;

create index if not exists chat_rooms_created_at_idx on public.chat_rooms (created_at desc);
create index if not exists messages_room_created_at_idx on public.messages (room_id, created_at desc);

do $$
begin
  alter publication supabase_realtime add table public.chat_rooms;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
