
-- Fix function search_path
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

-- Revoke broad EXECUTE on SECURITY DEFINER / helper functions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.slugify_username(text) from public, anon, authenticated;

-- Replace broad public-read on pdfs bucket with a no-op (objects are still
-- accessible via signed/public URL paths since bucket is public, but listing
-- via storage.objects SELECT is restricted to owners).
drop policy if exists "PDFs publicly readable" on storage.objects;

create policy "Users list own PDFs"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pdfs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
