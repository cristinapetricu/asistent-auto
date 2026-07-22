-- Rulează tot acest fișier în Supabase: SQL Editor → New query → lipești tot → Run

-- ---------- Vehicule ----------
create table vehicule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  nume text not null,
  numar_inmatriculare text default '',
  creat_la timestamptz default now()
);

-- ---------- Documente (remindere) ----------
create table documente (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  vehicul_id uuid references vehicule(id) on delete cascade not null,
  nume text not null,
  tip text not null,
  data_expirare date not null,
  nota text default '',
  prealarma integer default 7,
  creat_la timestamptz default now()
);

-- ---------- Jurnal combustibil & cheltuieli ----------
create table cheltuieli (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  vehicul_id uuid references vehicule(id) on delete cascade not null,
  tip text not null, -- 'combustibil' | 'parcare' | 'altele'
  data date not null,
  suma numeric not null,
  km integer,
  litri numeric,
  descriere text default '',
  creat_la timestamptz default now()
);

-- ---------- Istoric service / reparații ----------
create table service_istorie (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  vehicul_id uuid references vehicule(id) on delete cascade not null,
  data date not null,
  km integer,
  descriere text not null,
  cost numeric,
  unde text default '',
  creat_la timestamptz default now()
);

-- ---------- Abonări la notificări push ----------
create table abonamente (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null unique,
  abonament_complet jsonb not null,
  creat_la timestamptz default now()
);

-- ---------- Securitate la nivel de rând ----------
alter table vehicule enable row level security;
alter table documente enable row level security;
alter table cheltuieli enable row level security;
alter table service_istorie enable row level security;
alter table abonamente enable row level security;

-- Un singur set de politici, identic pe fiecare tabel: fiecare vede/modifică DOAR ce e al lui.
create policy "acces propriu select" on vehicule for select using (auth.uid() = user_id);
create policy "acces propriu insert" on vehicule for insert with check (auth.uid() = user_id);
create policy "acces propriu update" on vehicule for update using (auth.uid() = user_id);
create policy "acces propriu delete" on vehicule for delete using (auth.uid() = user_id);

create policy "acces propriu select" on documente for select using (auth.uid() = user_id);
create policy "acces propriu insert" on documente for insert with check (auth.uid() = user_id);
create policy "acces propriu update" on documente for update using (auth.uid() = user_id);
create policy "acces propriu delete" on documente for delete using (auth.uid() = user_id);

create policy "acces propriu select" on cheltuieli for select using (auth.uid() = user_id);
create policy "acces propriu insert" on cheltuieli for insert with check (auth.uid() = user_id);
create policy "acces propriu update" on cheltuieli for update using (auth.uid() = user_id);
create policy "acces propriu delete" on cheltuieli for delete using (auth.uid() = user_id);

create policy "acces propriu select" on service_istorie for select using (auth.uid() = user_id);
create policy "acces propriu insert" on service_istorie for insert with check (auth.uid() = user_id);
create policy "acces propriu update" on service_istorie for update using (auth.uid() = user_id);
create policy "acces propriu delete" on service_istorie for delete using (auth.uid() = user_id);

create policy "acces propriu select" on abonamente for select using (auth.uid() = user_id);
create policy "acces propriu insert" on abonamente for insert with check (auth.uid() = user_id);
create policy "acces propriu delete" on abonamente for delete using (auth.uid() = user_id);
