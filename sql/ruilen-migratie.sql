-- ============================================================
-- Kantinediensten Arnhemse Boys — ruilen tussen teams (versie 2)
--
-- Uitvoeren in Supabase: Dashboard -> SQL Editor -> nieuwe query -> Run.
-- Het script mag opnieuw uitgevoerd worden (idempotent).
--
-- Versie 2: alle id's worden als text opgeslagen en in de joins gecast,
-- zodat het niet uitmaakt of teams.id / saturdays.id text of uuid is.
-- Daardoor staan er geen foreign keys op; verwijder je een zaterdag, dan
-- blijft een oud verzoek staan zonder zichtbaar te worden (de joins laten
-- het weg). Punt 11 onderaan ruimt zulke resten op.
--
-- Werking:
--   1. Teamleider A stuurt een ruilvoorstel naar team B, OF biedt zijn
--      dienstdag aan op het prikbord.
--   2. Team B gaat akkoord (of neemt het aanbod van het prikbord over).
--      Het verzoek staat dan op 'wacht_barco'.
--   3. De kantinecoordinator of beheerder keurt goed of weigert.
--      Pas bij goedkeuren wisselen de dienstdagen echt van team.
--
-- Let op: bij goedkeuren wordt de ingevulde namenlijst (team_status)
-- van de betrokken dienstdag(en) leeggemaakt, want die hoort bij het
-- oude team.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. Tabel ----------
create table if not exists public.swap_requests (
  id            text primary key default gen_random_uuid()::text,
  kind          text not null check (kind in ('ruil','overname')),
  from_team     text not null,
  from_saturday text not null,
  to_team       text,
  to_saturday   text,
  status        text not null default 'open'
                check (status in ('open','wacht_barco','goedgekeurd','afgewezen','geweigerd','ingetrokken')),
  note          text not null default '',
  barco_note    text not null default '',
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    text
);

create index if not exists swap_requests_status_idx   on public.swap_requests(status);
create index if not exists swap_requests_from_sat_idx on public.swap_requests(from_saturday);
create index if not exists swap_requests_to_sat_idx   on public.swap_requests(to_saturday);

-- Row level security aan, zonder policies: rechtstreekse REST-toegang is
-- dicht. Alles loopt via de functies hieronder.
alter table public.swap_requests enable row level security;

-- ---------- 2. Hulpfuncties (niet publiek aanroepbaar) ----------
create or replace function public.swap_team_for_code(p_code text)
returns text
language sql stable security definer set search_path = public as $$
  select tc.team_id::text
  from public.team_codes tc
  where lower(tc.code) = lower(btrim(p_code))
  limit 1;
$$;
revoke execute on function public.swap_team_for_code(text) from public;

create or replace function public.swap_is_coord()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id::text = auth.uid()::text and p.role in ('admin','barco')
  );
$$;
revoke execute on function public.swap_is_coord() from public;

-- ---------- 3. Teamleider: dienstdagen om mee te ruilen ----------
create or replace function public.team_swap_options(p_code text)
returns table(sat_id text, sat_date text, sat_label text, t_id text, t_name text)
language plpgsql stable security definer set search_path = public as $$
declare v_team text;
begin
  v_team := public.swap_team_for_code(p_code);
  if v_team is null then raise exception 'Onbekende teamcode'; end if;

  return query
    select s.id::text, s.date::text, coalesce(s.label,''), t.id::text, t.name
    from public.saturdays s
    join public.teams t on t.id::text = s.team_id::text
    where s.team_id is not null
      and s.team_id::text <> v_team
      and s.date::date >= current_date
      and not exists (
        select 1 from public.swap_requests r
        where r.status in ('open','wacht_barco')
          and (r.from_saturday = s.id::text or r.to_saturday = s.id::text))
    order by s.date::date, t.name;
end $$;

-- ---------- 4. Teamleider: eigen verzoeken + prikbord ----------
create or replace function public.team_swap_list(p_code text)
returns table(
  req_id text, req_kind text, req_status text, direction text,
  from_team_id text, from_team_name text, from_sat_id text, from_sat_date text, from_sat_label text,
  to_team_id text, to_team_name text, to_sat_id text, to_sat_date text, to_sat_label text,
  note text, barco_note text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_team text;
begin
  v_team := public.swap_team_for_code(p_code);
  if v_team is null then raise exception 'Onbekende teamcode'; end if;

  return query
    select r.id, r.kind, r.status,
      case when r.from_team = v_team then 'uit'
           when r.to_team  = v_team then 'in'
           else 'prikbord' end,
      r.from_team, ft.name, r.from_saturday, fs.date::text, coalesce(fs.label,''),
      r.to_team,   tt.name, r.to_saturday,   ts.date::text, coalesce(ts.label,''),
      r.note, r.barco_note, r.created_at
    from public.swap_requests r
    join public.teams ft      on ft.id::text = r.from_team
    join public.saturdays fs  on fs.id::text = r.from_saturday
    left join public.teams tt     on tt.id::text = r.to_team
    left join public.saturdays ts on ts.id::text = r.to_saturday
    where r.from_team = v_team
       or r.to_team   = v_team
       or (r.kind = 'overname' and r.status = 'open')
    order by r.created_at desc
    limit 100;
end $$;

-- ---------- 5. Teamleider: verzoek aanmaken ----------
create or replace function public.team_swap_create(
  p_code text,
  p_kind text,
  p_from_saturday text,
  p_to_saturday text default null,
  p_note text default '')
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_team      text;
  v_from_team text;
  v_from_date date;
  v_to_team   text;
  v_to_date   date;
  v_id        text;
begin
  v_team := public.swap_team_for_code(p_code);
  if v_team is null then raise exception 'Onbekende teamcode'; end if;
  if p_kind not in ('ruil','overname') then raise exception 'Onbekend soort verzoek'; end if;

  select s.team_id::text, s.date::date into v_from_team, v_from_date
  from public.saturdays s where s.id::text = p_from_saturday;
  if not found then raise exception 'Dienstdag niet gevonden'; end if;
  if v_from_team is distinct from v_team then raise exception 'Deze dienstdag is niet van jouw team'; end if;
  if v_from_date < current_date then raise exception 'Deze dienstdag is al geweest'; end if;

  if exists (select 1 from public.swap_requests r
             where r.status in ('open','wacht_barco')
               and (r.from_saturday = p_from_saturday or r.to_saturday = p_from_saturday)) then
    raise exception 'Voor deze dienstdag loopt al een verzoek';
  end if;

  if p_kind = 'ruil' then
    if p_to_saturday is null then raise exception 'Kies een dienstdag om mee te ruilen'; end if;

    select s.team_id::text, s.date::date into v_to_team, v_to_date
    from public.saturdays s where s.id::text = p_to_saturday;
    if not found then raise exception 'Gekozen dienstdag niet gevonden'; end if;
    if v_to_team is null then raise exception 'Die dienstdag heeft nog geen team'; end if;
    if v_to_team = v_team then raise exception 'Dat is een dienstdag van je eigen team'; end if;
    if v_to_date < current_date then raise exception 'Die dienstdag is al geweest'; end if;

    if exists (select 1 from public.swap_requests r
               where r.status in ('open','wacht_barco')
                 and (r.from_saturday = p_to_saturday or r.to_saturday = p_to_saturday)) then
      raise exception 'Voor die dienstdag loopt al een verzoek';
    end if;

    insert into public.swap_requests(kind, from_team, from_saturday, to_team, to_saturday, note)
    values ('ruil', v_team, p_from_saturday, v_to_team, p_to_saturday, coalesce(p_note,''))
    returning id into v_id;
  else
    insert into public.swap_requests(kind, from_team, from_saturday, note)
    values ('overname', v_team, p_from_saturday, coalesce(p_note,''))
    returning id into v_id;
  end if;

  return v_id;
end $$;

-- ---------- 6. Teamleider: reageren ----------
-- p_action: 'accepteer' | 'weiger' (ruilvoorstel aan jouw team)
--           'claim'                (aanbod van het prikbord overnemen)
--           'intrek'               (eigen verzoek intrekken)
create or replace function public.team_swap_respond(p_code text, p_id text, p_action text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_team text;
  v_req  public.swap_requests;
begin
  v_team := public.swap_team_for_code(p_code);
  if v_team is null then raise exception 'Onbekende teamcode'; end if;

  select * into v_req from public.swap_requests r where r.id = p_id;
  if not found then raise exception 'Verzoek niet gevonden'; end if;

  if p_action = 'intrek' then
    if v_req.from_team <> v_team then raise exception 'Dit verzoek is niet van jouw team'; end if;
    if v_req.status not in ('open','wacht_barco') then raise exception 'Dit verzoek is al afgehandeld'; end if;
    update public.swap_requests set status = 'ingetrokken' where id = p_id;
    return 'ingetrokken';

  elsif p_action in ('accepteer','weiger') then
    if v_req.kind <> 'ruil' or v_req.to_team is distinct from v_team then
      raise exception 'Dit voorstel staat niet bij jouw team';
    end if;
    if v_req.status <> 'open' then raise exception 'Dit voorstel is al afgehandeld'; end if;
    update public.swap_requests
       set status = case when p_action = 'accepteer' then 'wacht_barco' else 'afgewezen' end
     where id = p_id;
    return case when p_action = 'accepteer' then 'wacht_barco' else 'afgewezen' end;

  elsif p_action = 'claim' then
    if v_req.kind <> 'overname' then raise exception 'Dit verzoek is geen aanbod'; end if;
    if v_req.status <> 'open' then raise exception 'Dit aanbod is niet meer open'; end if;
    if v_req.from_team = v_team then raise exception 'Dit is het aanbod van je eigen team'; end if;
    update public.swap_requests set to_team = v_team, status = 'wacht_barco' where id = p_id;
    return 'wacht_barco';
  end if;

  raise exception 'Onbekende actie';
end $$;

-- ---------- 7. Coordinator: overzicht ----------
create or replace function public.swap_admin_list(p_all boolean default false)
returns table(
  req_id text, req_kind text, req_status text,
  from_team_name text, from_sat_id text, from_sat_date text, from_sat_label text,
  to_team_name text, to_sat_id text, to_sat_date text, to_sat_label text,
  note text, barco_note text, created_at timestamptz, decided_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.swap_is_coord() then
    raise exception 'Alleen de kantinecoordinator of beheerder mag ruilverzoeken bekijken';
  end if;

  return query
    select r.id, r.kind, r.status,
      ft.name, r.from_saturday, fs.date::text, coalesce(fs.label,''),
      tt.name, r.to_saturday,   ts.date::text, coalesce(ts.label,''),
      r.note, r.barco_note, r.created_at, r.decided_at
    from public.swap_requests r
    join public.teams ft      on ft.id::text = r.from_team
    join public.saturdays fs  on fs.id::text = r.from_saturday
    left join public.teams tt     on tt.id::text = r.to_team
    left join public.saturdays ts on ts.id::text = r.to_saturday
    where p_all or r.status in ('open','wacht_barco')
    order by (r.status = 'wacht_barco') desc, r.created_at desc
    limit 200;
end $$;

-- ---------- 8. Coordinator: goedkeuren of weigeren ----------
create or replace function public.swap_decide(p_id text, p_approve boolean, p_note text default '')
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_req       public.swap_requests;
  v_from_team text;
  v_to_team   text;
begin
  if not public.swap_is_coord() then
    raise exception 'Alleen de kantinecoordinator of beheerder mag ruilen goedkeuren';
  end if;

  select * into v_req from public.swap_requests r where r.id = p_id;
  if not found then raise exception 'Verzoek niet gevonden'; end if;
  if v_req.status <> 'wacht_barco' then raise exception 'Dit verzoek wacht niet op goedkeuring'; end if;

  if not p_approve then
    update public.swap_requests
       set status = 'geweigerd', barco_note = coalesce(p_note,''),
           decided_at = now(), decided_by = auth.uid()::text
     where id = p_id;
    return 'geweigerd';
  end if;

  if v_req.kind = 'ruil' then
    select s.team_id::text into v_from_team from public.saturdays s where s.id::text = v_req.from_saturday;
    select s.team_id::text into v_to_team   from public.saturdays s where s.id::text = v_req.to_saturday;
    if v_from_team is null or v_to_team is null then
      raise exception 'Een van de dienstdagen bestaat niet meer';
    end if;

    update public.saturdays set team_id = v_to_team,   team_status = '{}' where id::text = v_req.from_saturday;
    update public.saturdays set team_id = v_from_team, team_status = '{}' where id::text = v_req.to_saturday;
  else
    if v_req.to_team is null then raise exception 'Er is nog geen team dat deze dienst overneemt'; end if;
    update public.saturdays set team_id = v_req.to_team, team_status = '{}' where id::text = v_req.from_saturday;
  end if;

  update public.swap_requests
     set status = 'goedgekeurd', barco_note = coalesce(p_note,''),
         decided_at = now(), decided_by = auth.uid()::text
   where id = p_id;
  return 'goedgekeurd';
end $$;

-- ---------- 9. Rechten ----------
-- Teamleider-functies: aanroepbaar met de publieke sleutel (de teamcode is de sleutel).
revoke execute on function public.team_swap_options(text)                        from public;
revoke execute on function public.team_swap_list(text)                           from public;
revoke execute on function public.team_swap_create(text,text,text,text,text)     from public;
revoke execute on function public.team_swap_respond(text,text,text)              from public;
grant  execute on function public.team_swap_options(text)                        to anon, authenticated;
grant  execute on function public.team_swap_list(text)                           to anon, authenticated;
grant  execute on function public.team_swap_create(text,text,text,text,text)     to anon, authenticated;
grant  execute on function public.team_swap_respond(text,text,text)              to anon, authenticated;

-- Coordinator-functies: alleen na inloggen; de functie checkt zelf de rol.
revoke execute on function public.swap_admin_list(boolean)         from public;
revoke execute on function public.swap_decide(text,boolean,text)   from public;
grant  execute on function public.swap_admin_list(boolean)         to authenticated;
grant  execute on function public.swap_decide(text,boolean,text)   to authenticated;

-- ---------- 10. Controle ----------
-- Dit hoort 6 functies op te leveren:
--   select routine_name from information_schema.routines
--   where routine_schema='public' and routine_name like '%swap%' order by 1;

-- ---------- 11. Opruimen (alleen draaien als je wilt) ----------
-- Verzoeken waarvan de dienstdag inmiddels verwijderd is:
--   delete from public.swap_requests r
--   where not exists (select 1 from public.saturdays s where s.id::text = r.from_saturday);
