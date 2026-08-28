-- schedule_items 다국어 컬럼 백필 (2026-08-28)
-- 이름표 QR 언어별 일정 페이지에서 en/es 가 비어 한국어로 fallback 되는 9개 항목을 채운다.
--
-- 단일 문장(데이터 수정 CTE 5개)이라 원자적으로 적용된다. CTE는 서로 겹치지 않는 행 집합만
-- 건드린다(식사 = location 'Gala Hall' / 체크인 = '로비' / 성경공부1 = 'Conference Room' /
-- Orientation·Ice Breaker = location null) — 한 행을 두 CTE가 수정하면 뒤쪽이 무시되기 때문.
--
-- 컬럼마다 "지금 비어 있을 때만" 채우는 CASE 가드가 있어 기존 내용을 덮지 않고 재실행도 안전하다.
-- 예외: 'Orientacion' → 'Orientación' 은 악센트 누락 오탈자 교정(값 일치를 조건으로 명시 교체).

with meals as (
  -- 식사 5건: location 'Gala Hall'(고유명사) · description 'Buffet' 의 en/es 누락.
  -- 이미 채워진 형제 항목(점심 11:30 = 3개 언어 모두 'Gala Hall', 'Bufé')과 동일하게 맞춘다.
  -- description 은 'Buffet' 인 행에만 채운다(다른 설명을 'Buffet'으로 덮지 않도록).
  update schedule_items set
    location_en    = case when coalesce(nullif(btrim(location_en), ''), '') = '' then 'Gala Hall' else location_en end,
    location_es    = case when coalesce(nullif(btrim(location_es), ''), '') = '' then 'Gala Hall' else location_es end,
    description_en = case when btrim(coalesce(description, '')) = 'Buffet'
                           and coalesce(nullif(btrim(description_en), ''), '') = ''
                          then 'Buffet' else description_en end,
    description_es = case when btrim(coalesce(description, '')) = 'Buffet'
                           and coalesce(nullif(btrim(description_es), ''), '') = ''
                          then 'Bufé' else description_es end
  where btrim(location) = 'Gala Hall'
  returning 1
),
checkin as (
  -- 체크인 15:00 — location_es 누락 → 한국어 '로비' 노출 (ko='로비', en='Lobby')
  update schedule_items set
    location_es = 'Vestíbulo'
  where id = 'e2400cef-2b03-4b96-ba4a-a93b2518af6f'
    and coalesce(nullif(btrim(location_es), ''), '') = ''
  returning 1
),
bible1 as (
  -- 성경공부 1 19:00 (by_language) — location_es·description_es 누락 → 한국어 노출.
  -- by_language 항목은 언어별로 강사·장소가 다른 별개 세션이다. 형제 항목(성경공부 2·3)의 es
  -- 값이 en(영어부 세션 = Vicky Park / Pacific Ballroom)을 그대로 따르므로 같은 규칙을 적용.
  --   이 행 en: 'Missionary Vicky Park / Prayer: Deacon Oscar Osorio'
  --   성경공부 2 es: 'Misionera Vicky Park / Oración: Diácono Sam Kim'
  update schedule_items set
    location_es    = case when coalesce(nullif(btrim(location_es), ''), '')    = '' then 'Pacific Ballroom' else location_es end,
    description_es = case when coalesce(nullif(btrim(description_es), ''), '') = ''
                          then 'Misionera Vicky Park / Oración: Diácono Oscar Osorio'
                          else description_es end
  where id = '602ade99-6b5d-4e5b-85b8-6545f16d2ed1'
  returning 1
),
orientation as (
  -- 원본이 이미 영어인 제목 — title_en 누락 + 스페인어 악센트 오탈자
  update schedule_items set
    title_en = case when coalesce(nullif(btrim(title_en), ''), '') = '' then 'Orientation'  else title_en end,
    title_es = case when btrim(coalesce(title_es, '')) = 'Orientacion'  then 'Orientación'  else title_es end
  where id = '99cfe5a6-849a-43b5-8e0d-ddbffac67fde'
  returning 1
),
icebreaker as (
  update schedule_items set
    title_en = 'Ice Breaker'
  where id = 'eb5f767b-8ac2-4c18-af5d-80cacf3409d7'
    and coalesce(nullif(btrim(title_en), ''), '') = ''
  returning 1
)
select
  (select count(*) from meals)       as meals_updated,
  (select count(*) from checkin)     as checkin_updated,
  (select count(*) from bible1)      as bible_study_1_updated,
  (select count(*) from orientation) as orientation_updated,
  (select count(*) from icebreaker)  as ice_breaker_updated;
