-- Normalização do texto das teses, com o original preservado.
--
-- O banco de teses do STF devolve alguns caracteres corrompidos na origem: 70
-- ocorrências de U+00BF (¿, ponto de interrogação invertido) no Tema 1.234 e 17
-- de U+00A0 (espaço inquebrável) em quatro temas. O ¿ ocupa o lugar de um
-- separador — "I – Competência¿¿ 1) Para fins de fixação..." deveria ser
-- "I – Competência 1) Para fins de fixação...". Não é pontuação espanhola: o
-- texto é português, e o artefato vem do pipeline de publicação do tribunal.
--
-- A regra da casa é não corrigir fonte oficial em silêncio. Por isso a
-- normalização é EXPLÍCITA e REVERSÍVEL: `tese` passa a guardar o texto legível,
-- `tese_bruta` guarda exatamente o que o STF devolveu, e `normalizada` marca as
-- linhas em que os dois diferem. Quem precisar auditar tem o original ao lado.
--
-- Aditiva. Reversível: update public.stf_temas set tese = tese_bruta
--                       where normalizada; alter table ... drop column ...

alter table public.stf_temas
  add column if not exists tese_bruta text,
  add column if not exists normalizada boolean not null default false;

comment on column public.stf_temas.tese_bruta is
  'Texto exatamente como o STF devolveu, incluindo os artefatos de codificação. Preenchido só quando difere de `tese`.';
comment on column public.stf_temas.normalizada is
  'true quando `tese` sofreu troca de U+00BF/U+00A0 por espaço. O original está em `tese_bruta`.';
