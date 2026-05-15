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
