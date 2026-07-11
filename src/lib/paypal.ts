// PayPal 인라인 donate 결제 링크 빌더 (순수 함수).
// 백엔드/API 없이 URL만 조립한다. amount는 인라인에서 고정 표시된다.
// item_number는 관리자 대조용 참조값(가구주 이름·구역).

export const PAYPAL_CURRENCY = "USD";

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
  });
  return `${PAYPAL_DONATE_BASE}?${q.toString()}`;
}
