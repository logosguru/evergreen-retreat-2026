import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditForm } from "@/components/EditForm";
import { HouseholdFeeCard } from "@/components/HouseholdFeeCard";
import { buildDonateUrl, PAYPAL_ITEM_NAME } from "@/lib/paypal";
import { personShares, type AttendeeWithRoom } from "@/lib/fees";
import { displayName } from "@/lib/names";
import type { Attendee } from "@/lib/types";

export default async function ManagePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  // 매직링크 세션이 없으면 이메일 입력 화면으로
  if (!data?.claims) {
    redirect({ href: "/edit", locale });
  }

  // 본인 가구로 명시 스코프. RLS만 의존하면 세션 사용자가 관리자일 경우
  // attendees_select_admin(전체 조회) 정책이 발동해 전 명단이 보인다.
  // my_attendee_ids()(SECURITY DEFINER, 세션 이메일 lower 일치)로 본인
  // 가구주 id를 얻어 가구주+가족 행만 가져온다. (관리자 여부 무관)
  const { data: idData } = await supabase.rpc("my_attendee_ids");
  const myIds = (idData as string[] | null) ?? [];

  // 가구주가 위로 오도록 정렬.
  const { data: attendees } = myIds.length
    ? await supabase
        .from("attendees")
        .select("*")
        .or(`id.in.(${myIds.join(",")}),householder_id.in.(${myIds.join(",")})`)
        .order("is_householder", { ascending: false })
        .order("created_at", { ascending: true })
    : { data: [] as Attendee[] };

  const { data: feeData } = await supabase.rpc("my_household_fee").single();
  const fee = feeData as {
    total: number;
    fee_determined: boolean;
    paid_total: number;
    balance: number;
  } | null;

  // PayPal 결제 링크: 잔액>0 + 회비확정 + 이메일설정 + 가구주존재일 때만.
  const rows = (attendees as Attendee[] | null) ?? [];
  const head = rows.find((a) => a.is_householder);
  const paypalEmail = process.env.NEXT_PUBLIC_PAYPAL_BUSINESS_EMAIL;

  const { data: roomTypesData } = await supabase
    .from("room_types")
    .select("*")
    .order("sort_order");
  const roomTypes =
    (roomTypesData as import("@/lib/types").RoomType[] | null) ?? [];
  const currentRoomTypeId =
    (head as { requested_room_type_id?: string | null } | undefined)
      ?.requested_room_type_id ?? "";

  const { data: payData } = head
    ? await supabase
        .from("fee_payments")
        .select("*")
        .eq("head_id", head.id)
        .order("paid_at", { ascending: true })
    : { data: [] as import("@/lib/types").FeePayment[] };
  const payments =
    (payData as import("@/lib/types").FeePayment[] | null) ?? [];

  // PayPal remark는 영어 고정(PAYPAL_ITEM_NAME). 한글은 PayPal 계정 기본
  // 인코딩(windows-1252)에서 깨져 수취측 거래내역에 안 남는다.
  // 대조용 이름도 영문 우선 (english_name → korean_name 폴백, charset=utf-8 방어).
  const refName = (a: Attendee) =>
    a.english_name?.trim() || a.korean_name?.trim() || "";

  const canPay = Boolean(
    fee && fee.balance > 0 && fee.fee_determined && paypalEmail && head,
  );

  let payUrl: string | null = null;
  if (canPay && head && fee && paypalEmail) {
    const ref = head.district
      ? `${refName(head)} (${head.district})`
      : refName(head);
    // 영수증 Reference(item_number)에 수련회명+가구 함께 노출 (Purpose 칸은 인라인 링크로 못 채움).
    payUrl = buildDonateUrl({
      email: paypalEmail,
      amount: fee.balance,
      itemName: PAYPAL_ITEM_NAME,
      itemNumber: `${PAYPAL_ITEM_NAME} - ${ref}`,
    });
  }

  // 개인별 납부: 각자 본인 몫만 낼 수 있게 사람 단위 결제 링크를 만든다.
  // 몫 = personFee(가구주가 고른 객실 타입 기준) - 본인 앞으로 기록된 납입.
  // 가구 잔액을 넘지 않도록 잘라, 누군가 이미 가구 전체를 낸 경우 중복 결제를 막는다.
  const selectedType = roomTypes.find((rt) => rt.id === currentRoomTypeId);
  const withType: AttendeeWithRoom[] = rows.map((a) => ({
    ...a,
    rooms: null,
    requested_room_type: selectedType
      ? {
          name: selectedType.name,
          price_per_person: selectedType.price_per_person,
          capacity: selectedType.capacity,
        }
      : null,
  }));
  const people = personShares(withType, payments)
    .map((s) => {
      const amount = Math.min(s.remaining, fee?.balance ?? 0);
      return {
        id: s.person.id,
        name: displayName(s.person),
        amount,
        payUrl:
          canPay && head && paypalEmail && amount > 0
            ? buildDonateUrl({
                email: paypalEmail,
                amount,
                itemName: PAYPAL_ITEM_NAME,
                itemNumber: `${PAYPAL_ITEM_NAME} - ${refName(s.person)} / ${refName(head)}`,
              })
            : null,
      };
    })
    .filter((p) => p.payUrl !== null);

  const t = await getTranslations("Edit");

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-8">
      <h1 className="font-display-ko text-3xl font-bold text-pine sm:text-4xl">
        {t("yourRegistration")}
      </h1>
      <div className="mb-8 mt-4 h-px w-14 bg-gold" />
      {fee && (
        <HouseholdFeeCard
          total={fee.total}
          balance={fee.balance}
          feeDetermined={fee.fee_determined}
          payUrl={payUrl}
          payments={payments}
          people={people}
          nameById={Object.fromEntries(
            rows.map((a) => [a.id, displayName(a)] as const),
          )}
        />
      )}
      <div className="mt-8">
        <EditForm
          initial={rows}
          roomTypes={roomTypes}
          currentRoomTypeId={currentRoomTypeId}
        />
      </div>
    </div>
  );
}
