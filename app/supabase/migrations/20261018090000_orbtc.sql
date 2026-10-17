-- ----------------------------------------------------------------------------
-- Oracle : les ORBTC, et une justesse jugée par le serveur
--
-- Les ORBTC (« Oracle BTC ») sont la monnaie de jeu de l'Oracle : une offre
-- fixe de 21 000 000, partagée en parts égales entre les membres à la genèse.
-- Chaque pari ouvert depuis la genèse engage la mise de son horizon ; les paris
-- d'un même horizon ouverts pendant la même période (semaine, mois,
-- trimestre…, à l'heure de Nouméa) forment une **manche**, dont le tracé le
-- plus juste emporte le pot. À égalité, on partage ; seul, on récupère sa mise.
--
-- Les ORBTC n'ont aucune valeur monétaire : ils ne s'achètent ni ne se
-- revendent. C'est ce qui garde l'Oracle dans le jeu entre amis.
--
-- Pour qu'un solde soit une vérité et pas une opinion, deux choses passent
-- côté serveur :
--
--   1. **la justesse.** Jusqu'ici, chaque app jugeait les paris résolus sur sa
--      propre série de cours. Un pot ne se règle pas sur un calcul que chaque
--      téléphone refait à sa façon. La fonction Edge `judge-oracle` juge
--      désormais chaque pari résolu, une fois, sur le cours de **sa** période,
--      et écrit le verdict dans `predictions.accuracy`. Le code du calcul est
--      celui de l'app (`supabase/functions/_shared/oracleJudge.ts`) ;
--
--   2. **la mise.** Un pari neuf est refusé si le membre n'a plus de quoi
--      miser — `predictions_orbtc_trigger`, après le gardien du calendrier.
--
-- Les soldes ne sont **pas stockés** : ils se déduisent des paris et des
-- verdicts (vues `orbtc_*`). L'app applique la même règle en TypeScript
-- (`src/features/oracle/orbtc.ts`) ; `tests/schema_test.sql` vérifie que la
-- base arrive aux mêmes chiffres que ses tests.
--
-- Rejouable.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 1. Le verdict d'un pari — écrit par le serveur seulement
-- ============================================================================

alter table public.predictions
  add column if not exists accuracy numeric(5, 2),
  add column if not exists judged_at timestamptz,
  add column if not exists judge_attempts smallint not null default 0;

alter table public.predictions drop constraint if exists predictions_accuracy_range;
alter table public.predictions
  add constraint predictions_accuracy_range
  check (accuracy is null or (accuracy >= 0 and accuracy <= 100));

comment on column public.predictions.accuracy is
  'Justesse du pari résolu, en %, au centième — écrite par la fonction judge-oracle.';
comment on column public.predictions.judged_at is
  'Quand le pari a été jugé. Non nul avec une justesse nulle : pari sans tracé jugeable.';

/**
 * Un membre n'écrit jamais son propre verdict.
 *
 * La politique `predictions_update_own` lui laisse modifier son pari tant qu'il
 * est révisable : sans ce déclencheur, il pourrait y glisser une justesse. Ce
 * qu'il envoie dans ces colonnes est ignoré — à l'insertion comme ensuite.
 * Seuls la clé de service (la fonction Edge) et l'administrateur écrivent.
 */
create or replace function public.predictions_verdict_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.accuracy       := null;
      new.judged_at      := null;
      new.judge_attempts := 0;
    else
      new.accuracy       := old.accuracy;
      new.judged_at      := old.judged_at;
      new.judge_attempts := old.judge_attempts;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_verdict_trigger on public.predictions;
create trigger predictions_verdict_trigger
  before insert or update on public.predictions
  for each row execute function public.predictions_verdict_guard();

create index if not exists predictions_unjudged_idx
  on public.predictions (resolves_at)
  where judged_at is null;

-- ============================================================================
-- 2. La genèse
-- ============================================================================

create table if not exists public.orbtc_config (
  id         boolean primary key default true check (id),
  genesis_at timestamptz not null,
  supply     bigint not null default 21000000 check (supply > 0)
);

comment on table public.orbtc_config is
  'Les ORBTC : la date de la genèse et l''offre totale. Une seule ligne.';

insert into public.orbtc_config (genesis_at)
values ('2026-11-01 00:00:00+11')
on conflict (id) do nothing;

/**
 * La part de chacun, figée à la genèse.
 *
 * La photo du club se prend **à la genèse**, pas à la migration : la première
 * opération ORBTC après la date de genèse (`orbtc_ensure_accounts`) partage
 * l'offre entre les membres présents à cet instant. Un membre arrivé ensuite
 * peut parier, sans ORBTC : l'offre est fixe, et la rediviser ferait bouger
 * les soldes de tout le monde.
 */
create table if not exists public.orbtc_accounts (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  genesis_share bigint not null check (genesis_share >= 0),
  created_at    timestamptz not null default now()
);

comment on table public.orbtc_accounts is
  'Part d''ORBTC reçue par chaque membre à la genèse. Écrite une fois, par la base.';

alter table public.orbtc_config   enable row level security;
alter table public.orbtc_accounts enable row level security;

drop policy if exists orbtc_config_select on public.orbtc_config;
create policy orbtc_config_select on public.orbtc_config
  for select to authenticated
  using (public.is_member());

drop policy if exists orbtc_accounts_select on public.orbtc_accounts;
create policy orbtc_accounts_select on public.orbtc_accounts
  for select to authenticated
  using (public.is_member());

-- Aucune politique d'écriture : seuls la base et l'administrateur écrivent.

/**
 * Prend la photo de la genèse, si elle est due et pas encore prise.
 *
 * Parts égales ; le reste de la division va, une unité chacun, aux premiers
 * identifiants dans l'ordre binaire — la règle de `genesisShares` côté app.
 */
create or replace function public.orbtc_ensure_accounts()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cfg public.orbtc_config;
begin
  if exists (select 1 from public.orbtc_accounts) then
    return;
  end if;
  select * into cfg from public.orbtc_config;
  if cfg is null or now() < cfg.genesis_at then
    return;
  end if;

  -- Deux premières opérations simultanées ne partagent pas deux fois.
  perform pg_advisory_xact_lock(hashtext('orbtc:genesis'));
  if exists (select 1 from public.orbtc_accounts) then
    return;
  end if;

  insert into public.orbtc_accounts (user_id, genesis_share)
  select m.id,
         cfg.supply / m.n + case when m.rn <= cfg.supply % m.n then 1 else 0 end
    from (
      select p.id,
             row_number() over (order by p.id::text collate "C") as rn,
             count(*) over () as n
        from public.profiles p
    ) m;
end;
$$;

revoke all on function public.orbtc_ensure_accounts() from public, anon;
grant execute on function public.orbtc_ensure_accounts() to authenticated;

-- ============================================================================
-- 3. Mises et manches — miroir de `src/features/oracle/orbtc.ts`
-- ============================================================================

/**
 * La mise d'un horizon : 10 000 ORBTC × le poids de l'horizon au classement.
 * Comparée à `src/lib/horizons.ts` par `scripts/__tests__/orbtc-sql.test.mjs`.
 */
create or replace function public.orbtc_stake(h text)
returns bigint
language sql
immutable
as $$
  select case h
    when '1w'  then 10000
    when '2w'  then 12500
    when '1m'  then 15000
    when '3m'  then 20000
    when '6m'  then 30000
    when '12m' then 40000
  end::bigint;
$$;

/**
 * Le début de la période de manche qui contient `ts`, à l'heure de Nouméa
 * (UTC+11 toute l'année) : le lundi, le 1er du mois, du trimestre, du semestre,
 * de l'année. Les quinzaines partent du lundi 1er janvier 2024.
 */
create or replace function public.orbtc_manche_start(h text, ts timestamptz)
returns timestamptz
language sql
immutable
as $$
  select (
    case h
      when '1w'  then date_trunc('week', l.t)
      when '2w'  then timestamp '2024-01-01'
                      + floor(extract(epoch from date_trunc('week', l.t) - timestamp '2024-01-01')
                              / (14 * 86400)) * interval '14 days'
      when '1m'  then date_trunc('month', l.t)
      when '3m'  then date_trunc('quarter', l.t)
      when '6m'  then make_timestamp(extract(year from l.t)::int,
                                     case when extract(month from l.t) < 7 then 1 else 7 end,
                                     1, 0, 0, 0)
      when '12m' then date_trunc('year', l.t)
    end - interval '11 hours'
  ) at time zone 'UTC'
  from (select (ts at time zone 'UTC') + interval '11 hours' as t) l;
$$;

/** La fin (exclue) de la période de manche qui commence à `start`. */
create or replace function public.orbtc_manche_end(h text, start timestamptz)
returns timestamptz
language sql
immutable
as $$
  select (
    (start at time zone 'UTC') + interval '11 hours'
    + case h
        when '1w'  then interval '7 days'
        when '2w'  then interval '14 days'
        when '1m'  then interval '1 month'
        when '3m'  then interval '3 months'
        when '6m'  then interval '6 months'
        when '12m' then interval '1 year'
      end
    - interval '11 hours'
  ) at time zone 'UTC';
$$;

/**
 * Les paris engagés : ouverts depuis la genèse, par un membre qui y a reçu sa
 * part. `score` est la justesse en centièmes de point — `null` tant que le
 * pari n'est pas jugé, `0` s'il a été jugé sans justesse possible.
 */
create or replace view public.orbtc_entries
with (security_invoker = true)
as
select p.id,
       p.user_id,
       p.horizon,
       p.opened_at,
       p.resolves_at,
       public.orbtc_manche_start(p.horizon, p.opened_at) as manche_start,
       public.orbtc_stake(p.horizon) as stake,
       case
         when p.accuracy is not null then round(p.accuracy * 100)::int
         when p.judged_at is not null then 0
       end as score
  from public.predictions p
  join public.orbtc_accounts a on a.user_id = p.user_id
  cross join public.orbtc_config c
 where p.opened_at >= c.genesis_at;

/** Les manches, et où elles en sont (`open`, `playing`, `pending`, `settled`, `refunded`). */
create or replace view public.orbtc_manches
with (security_invoker = true)
as
select g.*,
       case
         when now() < g.manche_end then 'open'
         when g.last_resolution > now() then 'playing'
         when g.players < 2 then 'refunded'
         when g.unjudged then 'pending'
         else 'settled'
       end as status
  from (
    select e.horizon,
           e.manche_start,
           public.orbtc_manche_end(e.horizon, e.manche_start) as manche_end,
           min(e.stake) as stake,
           count(*)::int as players,
           sum(e.stake)::bigint as pot,
           max(e.resolves_at) as last_resolution,
           bool_or(e.score is null) as unjudged,
           max(e.score) as best
      from public.orbtc_entries e
     group by e.horizon, e.manche_start
  ) g;

/**
 * Ce que chaque pari reçoit : le pot (ou sa part) s'il est le plus juste, sa
 * mise s'il était seul, rien sinon. `null` tant que la manche n'est pas close.
 * Le reste d'un partage va, une unité chacun, aux premiers à avoir parié.
 */
create or replace view public.orbtc_results
with (security_invoker = true)
as
select e.id,
       e.user_id,
       e.horizon,
       e.manche_start,
       e.stake,
       m.status,
       m.status in ('settled', 'refunded') as closed,
       case m.status
         when 'refunded' then e.stake
         when 'settled' then
           case
             when e.score = m.best then
               m.pot / w.n
               + case when w.rank <= m.pot % w.n then 1 else 0 end
             else 0
           end
       end as payout
  from public.orbtc_entries e
  join public.orbtc_manches m
    on m.horizon = e.horizon and m.manche_start = e.manche_start
  left join lateral (
    select count(*) over () as n,
           row_number() over (order by x.opened_at, x.id) as rank,
           x.id
      from public.orbtc_entries x
     where x.horizon = e.horizon
       and x.manche_start = e.manche_start
       and x.score = m.best
  ) w on w.id = e.id;

/**
 * Les portefeuilles. `total` = part de genèse + gains et pertes des manches
 * closes ; `in_play` = mises des manches pas encore closes ; ce qu'on peut
 * encore miser est `total − in_play`. La somme des `total` vaut l'offre.
 */
create or replace view public.orbtc_holdings
with (security_invoker = true)
as
select a.user_id,
       a.genesis_share,
       a.genesis_share
         + coalesce(sum(r.payout - r.stake) filter (where r.closed), 0)::bigint as total,
       coalesce(sum(r.stake) filter (where not r.closed), 0)::bigint as in_play
  from public.orbtc_accounts a
  left join public.orbtc_results r on r.user_id = a.user_id
 group by a.user_id, a.genesis_share;

-- Lecture des vues par les membres ; leurs lignes suivent la RLS des tables
-- (`security_invoker`). Aucune écriture : ce sont des calculs.
revoke all on public.orbtc_entries, public.orbtc_manches, public.orbtc_results,
              public.orbtc_holdings from anon;
grant select on public.orbtc_entries, public.orbtc_manches, public.orbtc_results,
               public.orbtc_holdings to authenticated;

-- ============================================================================
-- 4. La mise : un pari neuf est refusé faute d'ORBTC
-- ============================================================================

/**
 * Après le gardien du calendrier (`predictions_guard_trigger`, qui fixe
 * `opened_at`) — les déclencheurs d'un même moment s'exécutent dans l'ordre
 * alphabétique de leur nom.
 */
create or replace function public.predictions_orbtc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  genesis   timestamptz;
  available bigint;
  stake     bigint;
begin
  select genesis_at into genesis from public.orbtc_config;
  if genesis is null or new.opened_at < genesis then
    return new;
  end if;

  perform public.orbtc_ensure_accounts();
  if not exists (select 1 from public.orbtc_accounts where user_id = new.user_id) then
    return new;
  end if;

  -- Deux paris simultanés du même membre ne dépensent pas deux fois le même
  -- solde : le second attend le premier, puis relit.
  perform pg_advisory_xact_lock(hashtext('orbtc:' || new.user_id::text));

  select h.total - h.in_play into available
    from public.orbtc_holdings h
   where h.user_id = new.user_id;
  stake := public.orbtc_stake(new.horizon);

  if coalesce(available, 0) < stake then
    raise exception 'ORBTC insuffisants : la mise est de % ORBTC, il vous en reste % de disponibles',
      stake, coalesce(available, 0)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_orbtc_trigger on public.predictions;
create trigger predictions_orbtc_trigger
  before insert on public.predictions
  for each row execute function public.predictions_orbtc();

-- ============================================================================
-- 5. Le juge : chaque quart d'heure, via pg_cron — comme `notify_tick`
-- ============================================================================

/**
 * Appelle la fonction `judge-oracle` s'il y a un pari résolu à juger — et
 * seulement alors. Un pari qui échoue vingt fois (cours introuvable) n'est plus
 * retenté : il attend un administrateur.
 *
 * L'adresse et le secret d'appel vivent dans le coffre-fort, jamais en clair
 * dans `cron.job`.
 */
create or replace function public.judge_tick()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fn_url text;
  secret text;
begin
  if not exists (
    select 1 from public.predictions
     where judged_at is null and resolves_at <= now() and judge_attempts < 20
  ) then
    return 'rien à juger';
  end if;

  begin
    select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'ssc_judge_url';
    select decrypted_secret into secret from vault.decrypted_secrets where name = 'ssc_judge_secret';
  exception when others then
    return 'coffre-fort illisible : ' || sqlerrm;
  end;
  if fn_url is null or secret is null then
    return 'non configuré — select public.configure_judging(<adresse de judge-oracle>)';
  end if;

  begin
    perform net.http_post(
      url     := fn_url,
      body    := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'x-judge-secret', secret
      )
    );
  exception when others then
    return 'pg_net indisponible : ' || sqlerrm;
  end;
  return 'appel envoyé';
end;
$$;

revoke all on function public.judge_tick() from public, anon, authenticated;

/** Range l'adresse de `judge-oracle` et son secret dans le coffre-fort. */
create or replace function public.set_judge_config(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing uuid;
begin
  if p_url !~ '^https://[^/]+/functions/v1/judge-oracle$' then
    raise exception 'Adresse de fonction inattendue : %', p_url;
  end if;
  if length(coalesce(p_secret, '')) < 32 then
    raise exception 'Secret d''appel trop court';
  end if;

  select id into existing from vault.secrets where name = 'ssc_judge_url';
  if existing is null then
    perform vault.create_secret(p_url, 'ssc_judge_url', 'Adresse de la fonction judge-oracle');
  else
    perform vault.update_secret(existing, p_url);
  end if;

  select id into existing from vault.secrets where name = 'ssc_judge_secret';
  if existing is null then
    perform vault.create_secret(p_secret, 'ssc_judge_secret', 'Secret d''appel de judge-oracle');
  else
    perform vault.update_secret(existing, p_secret);
  end if;
end;
$$;

revoke all on function public.set_judge_config(text, text) from public, anon, authenticated;

/**
 * Configure le juge en une ligne, depuis le SQL Editor :
 *
 *   select public.configure_judging('https://<ref>.supabase.co/functions/v1/judge-oracle');
 *
 * Le secret d'appel est tiré ici, au hasard, et ne sort jamais du coffre-fort :
 * la fonction le vérifie par `judge_secret_ok`, avec la clé de service que la
 * plateforme lui injecte. Aucun secret à recopier, ni à poser à la main.
 */
create or replace function public.configure_judging(p_url text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.set_judge_config(
    p_url,
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
  );
  return public.schedule_judging();
end;
$$;

revoke all on function public.configure_judging(text) from public, anon, authenticated;

/**
 * Le secret présenté par l'appelant est-il celui du coffre-fort ?
 * Réservé à la clé de service : c'est la fonction `judge-oracle` qui demande.
 * Faux, sans lever, si le coffre-fort est vide ou illisible.
 */
create or replace function public.judge_secret_ok(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  expected text;
begin
  begin
    select decrypted_secret into expected
      from vault.decrypted_secrets where name = 'ssc_judge_secret';
  exception when others then
    return false;
  end;
  return expected is not null
     and length(expected) >= 32
     and coalesce(p_secret, '') = expected;
end;
$$;

revoke all on function public.judge_secret_ok(text) from public, anon, authenticated;

/** Pose le battement du juge. Rejouable ; ne lève pas. */
create or replace function public.schedule_judging()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('ssc-judge', '*/15 * * * *', 'select public.judge_tick()');
  return 'planifié';
exception when others then
  return 'échec : ' || sqlerrm;
end;
$$;

revoke all on function public.schedule_judging() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.set_judge_config(text, text) to service_role;
    grant execute on function public.configure_judging(text) to service_role;
    grant execute on function public.judge_secret_ok(text) to service_role;
    grant execute on function public.schedule_judging() to service_role;
    grant execute on function public.judge_tick() to service_role;
  end if;
end
$$;

do $$
declare
  outcome text;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    outcome := public.schedule_judging();
    if outcome <> 'planifié' then
      raise warning 'planification du juge : %', outcome;
    end if;
  end if;
end
$$;
