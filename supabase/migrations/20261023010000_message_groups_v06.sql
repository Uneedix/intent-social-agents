-- INTENT v0.6: private group conversations, separate from communities.
-- Run in Supabase SQL Editor on a development project after reviewing.
create table if not exists public.message_groups (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(title) between 3 and 80),
 description text check (char_length(description) <= 300),
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.message_group_members (
 group_id uuid not null references public.message_groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check (role in ('owner','admin','member')),
 joined_at timestamptz not null default now(),
 primary key (group_id,user_id)
);
create table if not exists public.message_group_messages (
 id uuid primary key default gen_random_uuid(),
 group_id uuid not null references public.message_groups(id) on delete cascade,
 sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 body text not null check (char_length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists message_group_messages_group_time on public.message_group_messages(group_id,created_at);
create index if not exists message_group_members_user on public.message_group_members(user_id);
alter table public.message_groups enable row level security;
alter table public.message_group_members enable row level security;
alter table public.message_group_messages enable row level security;

-- SECURITY DEFINER helper avoids recursive membership policies; fixed search_path.
create or replace function public.is_message_group_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.message_group_members where group_id=p_group_id and user_id=(select auth.uid()));
$$;
revoke all on function public.is_message_group_member(uuid) from public;
grant execute on function public.is_message_group_member(uuid) to authenticated;

create or replace function public.can_manage_message_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.message_group_members where group_id=p_group_id and user_id=(select auth.uid()) and role in ('owner','admin'));
$$;
revoke all on function public.can_manage_message_group(uuid) from public;
grant execute on function public.can_manage_message_group(uuid) to authenticated;

-- Users cannot insert arbitrary membership/owner records directly.
revoke insert,update,delete on public.message_groups from anon,authenticated;
revoke insert,update,delete on public.message_group_members from anon,authenticated;
revoke update,delete on public.message_group_messages from anon,authenticated;

drop policy if exists "members read groups" on public.message_groups;
create policy "members read groups" on public.message_groups for select to authenticated using (public.is_message_group_member(id));
drop policy if exists "members read group roster" on public.message_group_members;
create policy "members read group roster" on public.message_group_members for select to authenticated using (public.is_message_group_member(group_id));
drop policy if exists "members read group messages" on public.message_group_messages;
create policy "members read group messages" on public.message_group_messages for select to authenticated using (public.is_message_group_member(group_id));
drop policy if exists "members send group messages" on public.message_group_messages;
create policy "members send group messages" on public.message_group_messages for insert to authenticated with check (sender_id=(select auth.uid()) and public.is_message_group_member(group_id));

create or replace function public.create_message_group(p_title text,p_description text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; actor uuid := auth.uid();
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if char_length(trim(p_title)) not between 3 and 80 or char_length(coalesce(p_description,''))>300 then raise exception 'Invalid group details'; end if;
 insert into public.message_groups(title,description,created_by) values(trim(p_title),p_description,actor) returning id into new_id;
 insert into public.message_group_members(group_id,user_id,role) values(new_id,actor,'owner');
 return new_id;
end;$$;
revoke all on function public.create_message_group(text,text) from public;
grant execute on function public.create_message_group(text,text) to authenticated;

create or replace function public.add_message_group_member(p_group_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.can_manage_message_group(p_group_id) then raise exception 'Not authorized'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'User not found'; end if;
 insert into public.message_group_members(group_id,user_id,role) values(p_group_id,p_user_id,'member') on conflict do nothing;
end;$$;
revoke all on function public.add_message_group_member(uuid,uuid) from public;
grant execute on function public.add_message_group_member(uuid,uuid) to authenticated;
