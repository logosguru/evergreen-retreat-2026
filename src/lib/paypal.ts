// PayPal 인라인 donate 결제 링크 빌더 (순수 함수).
// 백엔드/API 없이 URL만 조립한다. amount는 인라인에서 고정 표시된다.
// item_number는 관리자 대조용 참조값(가구주 이름·구역).

export const PAYPAL_CURRENCY = "USD";

// PayPal에 넘기는 remark(item_name/item_number 라벨)는 항상 영어 고정.
// PayPal Payments Standard는 계정 기본 인코딩(windows-1252)으로 파라미터를
// 해석하므로 한글이 섞이면 수취측 거래내역에서 깨지거나 누락된다.
// UI 언어(payItemName 번역)와 무관하게 이 상수를 사용할 것.
export const PAYPAL_ITEM_NAME = "Evergreen Church 2026 Retreat Fee";

const PAYPAL_DONATE_BASE = "https://www.paypal.com/donate";

export function buildDonateUrl(params: {
  email: string; // business (교회 수취 이메일)
  amount: number; // 가구 회비 합계
  itemName: string; // payer에게 보이는 항목명 (i18n)
  itemNumber: string; // 대조용 참조값 (가구주 이름·구역)
}): string {
  const q = new URLSearchParams({
    business: params.email,
    no_recurring: "1",
    item_name: params.itemName,
    item_number: params.itemNumber,
    amount: params.amount.toFixed(2),
    currency_code: PAYPAL_CURRENCY,
    // 계정 기본 인코딩(windows-1252)이면 비라틴 문자가 깨짐 → 명시적으로 UTF-8.
    charset: "utf-8",
  });
  return `${PAYPAL_DONATE_BASE}?${q.toString()}`;
}
