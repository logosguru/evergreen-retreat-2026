-- ============ 직분에 '강사' 추가 ============
-- 초청 강사(목사님)도 방 배정을 받으려면 참석자로 등록돼야 한다.
-- 회비 면제는 별도 컬럼(fee_waived, 0028) — 직분만으로 자동 면제되지 않는다.
--
-- ⚠ enum 값 추가는 같은 트랜잭션 안에서 그 값을 사용할 수 없으므로 독립 마이그레이션으로 둔다.
-- TS 쪽 동일 토큰: src/lib/types.ts ROLES. 라벨은 i18n "Role" 네임스페이스.

alter type public.role_t add value if not exists 'speaker';
