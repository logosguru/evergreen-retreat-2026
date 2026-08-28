import { localized } from "./localized.ts";

export interface BilingualValue {
  ko: string | null;
  en: string | null;
  /** 두 언어 표기가 같아 한 번만 쓰면 되는지 (다르면 포스터가 둘 다 표기) */
  same: boolean;
}

type Field = "title" | "description" | "location";

type BilingualItem = Partial<
  Record<Field | `${Field}_en` | `${Field}_es`, string | null>
>;

// 이중언어 포스터용: 한 필드의 한국어·영어 표기를 함께 얻는다.
//
// 대부분 항목은 두 표기가 같다(고유명사 'Gala Hall', 혹은 en 이 비어 ko 로 fallback).
// 하지만 by_language 항목은 언어별로 실제 세션이 달라 장소·강사가 다르다
// (성경공부: ko 'Conference Room' / en 'Pacific Ballroom'). 벽 일정표의 핵심 정보이므로
// same=false 일 때 양쪽을 모두 보여줘야 한다.
export function bilingual(item: BilingualItem, field: Field): BilingualValue {
  const ko = localized(item, field, "ko");
  const en = localized(item, field, "en");
  const norm = (v: string | null) => v?.trim() || null;
  const k = norm(ko);
  const e = norm(en);

  // 한쪽만 있으면 그 값을 양쪽에 쓴다 (한 번만 표기)
  if (k === null) return { ko: e, en: e, same: true };
  if (e === null) return { ko: k, en: k, same: true };

  return { ko: k, en: e, same: k === e };
}
