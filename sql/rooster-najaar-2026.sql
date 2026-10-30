-- ============================================================
-- Kantinediensten Arnhemse Boys — rooster najaar 2026
--
-- Uitvoeren in Supabase: Dashboard -> SQL Editor -> nieuwe query -> Run.
--
-- WAT DIT SCRIPT DOET
--   1. Wist ALLE bestaande dienstdagen, inclusief de ingevulde namen,
--      de ingedeelde bar-krachten en alle ruilverzoeken. Niet terug te draaien.
--   2. Maakt de zaterdagen van 3 oktober tot en met 12 december 2026 aan
--      (19 en 26 december worden overgeslagen: winterstop).
--   3. Wijst die dagen om de beurt toe aan alle teams onder JO17 —
--      JO7 t/m JO16 en MO7 t/m MO16 — om de beurt,
--      gemengd over de lichtingen: eerst het jongste team, dan het oudste,
--      dan het op één na jongste, enzovoort.
--
-- Teams worden herkend aan hun naam: alles wat begint met JO of MO en een
-- leeftijd van 7 t/m 16 (dus JO7-1, JO11-3, MO13-1, JO16-2 …). JO17 en ouder,
-- senioren en de dames blijven buiten beeld.
-- Wil je de grens verleggen? Pas dan in beide WHERE-regels het rijtje
-- (7|8|9|10|11|12|13|14|15|16) aan; verder hoeft er niets te veranderen.
--
-- TIP: voer eerst alleen deel A uit (selecteren) om te zien wat er gaat
-- gebeuren. Ben je akkoord, voer dan het hele script uit.
-- ============================================================


-- ============================================================
-- DEEL A — VOORBESCHOUWING (verandert niets)
-- ============================================================

-- A1. Welke teams doen mee, en in welke volgorde?
with teamlijst as (
  select t.id, t.name,
         (regexp_match(t.name, '^[JjMm][Oo] ?(\d+)'))[1]::int as leeftijd
  from public.teams t
  where t.name ~* '^(jo|mo) ?(7|8|9|10|11|12|13|14|15|16)([^0-9]|$)'
),
per_lichting as (
  select tl.*, row_number() over (partition by tl.leeftijd order by tl.name) as nr_in_lichting
  from teamlijst tl
),
lichtingen as (
  select leeftijd,
         row_number() over (order by leeftijd) as opl,
         count(*) over () as aantal
  from (select distinct leeftijd from teamlijst) x
),
lichting_volgorde as (
  select leeftijd,
         case when opl <= (aantal + 1) / 2 then opl * 2 - 1
              else (aantal - opl + 1) * 2 end as volgorde
  from lichtingen
)
select row_number() over (order by p.nr_in_lichting, lv.volgorde) as beurt,
       p.name as team
from per_lichting p
join lichting_volgorde lv on lv.leeftijd = p.leeftijd
order by beurt;

-- A2. Welke zaterdagen komen erin? (11 stuks)
select d::date as zaterdag
from generate_series(date '2026-10-03', date '2026-12-31', interval '7 days') d
where d::date not in (date '2026-12-19', date '2026-12-26')
order by 1;

-- A3. Wat wordt er weggegooid?
select (select count(*) from public.saturdays)        as dienstdagen_nu,
       (select count(*) from public.bar_assignments)  as bar_indelingen_nu,
       (select count(*) from public.swap_requests)    as ruilverzoeken_nu;


-- ============================================================
-- DEEL B — LEEGMAKEN
-- ============================================================

delete from public.bar_assignments;
delete from public.swap_requests;
delete from public.saturdays;


-- ============================================================
-- DEEL C — OPNIEUW VULLEN
-- ============================================================

with teamlijst as (
  select t.id, t.name,
         (regexp_match(t.name, '^[JjMm][Oo] ?(\d+)'))[1]::int as leeftijd
  from public.teams t
  where t.name ~* '^(jo|mo) ?(7|8|9|10|11|12|13|14|15|16)([^0-9]|$)'
),
per_lichting as (
  select tl.*, row_number() over (partition by tl.leeftijd order by tl.name) as nr_in_lichting
  from teamlijst tl
),
lichtingen as (
  select leeftijd,
         row_number() over (order by leeftijd) as opl,
         count(*) over () as aantal
  from (select distinct leeftijd from teamlijst) x
),
lichting_volgorde as (
  select leeftijd,
         case when opl <= (aantal + 1) / 2 then opl * 2 - 1
              else (aantal - opl + 1) * 2 end as volgorde
  from lichtingen
),
teams_op_volgorde as (
  select p.id,
         row_number() over (order by p.nr_in_lichting, lv.volgorde) - 1 as beurt,
         count(*) over () as aantal_teams
  from per_lichting p
  join lichting_volgorde lv on lv.leeftijd = p.leeftijd
),
zaterdagen as (
  select d::date as datum,
         row_number() over (order by d) - 1 as nr
  from generate_series(date '2026-10-03', date '2026-12-31', interval '7 days') d
  where d::date not in (date '2026-12-19', date '2026-12-26')
)
insert into public.saturdays (id, date, team_id, team_status)
select gen_random_uuid()::text, z.datum, t.id, '{}'
from zaterdagen z
join teams_op_volgorde t
  on t.beurt = z.nr % t.aantal_teams;


-- ============================================================
-- DEEL D — CONTROLE
-- ============================================================

select s.date as zaterdag, t.name as team
from public.saturdays s
left join public.teams t on t.id::text = s.team_id::text
order by s.date;

-- Kwam er een dag zonder team uit? Dan zijn er geen teams gevonden die aan
-- het naampatroon voldoen — controleer met:  select name from public.teams order by name;
