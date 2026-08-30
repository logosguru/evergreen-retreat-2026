// 관리자 참석자 명단 Excel(.xlsx) 다운로드.
// 파일 응답(Content-Disposition)이 필요해 서버 액션 대신 라우트 핸들러를 쓴다.
// /api 는 proxy matcher에서 제외되므로 로케일은 ?locale= 로 받는다.
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { withHouseholdRoomType, type AttendeeWithRoom } from "@/lib/fees";
import { buildAttendeeWorkbook, type ExportLabels } from "@/lib/attendee-export";
import { buildXlsx } from "@/lib/xlsx";
import type { FeePayment } from "@/lib/types";

const METHOD_KEYS: Record<string, "methodPaypal" | "methodCash" | "methodCheck" | "methodImport"> = {
  paypal: "methodPaypal",
  cash: "methodCash",
  check: "methodCheck",
  import: "methodImport",
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const appMetadata = (claimsData?.claims?.app_metadata ?? {}) as Record<
    string,
    unknown
  >;
  if (appMetadata.app_role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const requested = new URL(request.url).searchParams.get("locale");
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const { data, error } = await supabase
    .from("attendees")
    .select(
      "*, rooms(label, room_types(name, price_per_person, capacity)), requested_room_type:room_types!requested_room_type_id(name, price_per_person, capacity)",
    );
  if (error) {
    return new Response(`Failed to load attendees: ${error.message}`, {
      status: 500,
    });
  }
  const attendees = withHouseholdRoomType((data as AttendeeWithRoom[]) ?? []);

  const { data: payData, error: payError } = await supabase
    .from("fee_payments")
    .select("*");
  if (payError) {
    return new Response(`Failed to load payments: ${payError.message}`, {
      status: 500,
    });
  }
  const payments = (payData as FeePayment[] | null) ?? [];

  const [t, tf, tx, tr, tdi, tg, tl, tp, tfd, tc, trm, tts] = await Promise.all([
    getTranslations({ locale, namespace: "Admin" }),
    getTranslations({ locale, namespace: "Fee" }),
    getTranslations({ locale, namespace: "Export" }),
    getTranslations({ locale, namespace: "Role" }),
    getTranslations({ locale, namespace: "District" }),
    getTranslations({ locale, namespace: "Gender" }),
    getTranslations({ locale, namespace: "Language" }),
    getTranslations({ locale, namespace: "Pickup" }),
    getTranslations({ locale, namespace: "Fields" }),
    getTranslations({ locale, namespace: "Common" }),
    getTranslations({ locale, namespace: "Rooms" }),
    getTranslations({ locale, namespace: "Tshirt" }),
  ]);

  const labels: ExportLabels = {
    sheetAttendees: tx("sheetAttendees"),
    sheetPayments: tx("sheetPayments"),
    h: {
      no: tx("no"),
      koreanName: tfd("korean_name"),
      englishName: tfd("english_name"),
      household: t("colHousehold"),
      isHead: t("householder"),
      householdSize: tx("householdSize"),
      district: t("colDistrict"),
      role: t("colRole"),
      gender: t("colGender"),
      under6: t("under6"),
      child612: t("child612"),
      feeWaived: t("colFeeWaived"),
      feeDiscount: t("colFeeDiscount"),
      tshirt: t("colTshirt"),
      language: t("colLanguage"),
      partial: t("colPartial"),
      arrival: tfd("arrival_at"),
      departure: tfd("departure_at"),
      pickup: t("colPickup"),
      email: tfd("email"),
      phone: tfd("phone"),
      roomType: tf("roomType"),
      room: t("colRoom"),
      retreatGroup: t("colGroup"),
      groupLeader: t("groupLeader"),
      personFee: tx("personFee"),
      householdTotal: t("paymentTotal"),
      paidTotal: t("paymentPaid"),
      balance: t("colBalance"),
      status: tx("status"),
      methods: tx("payMethods"),
      note: tfd("note"),
      registered: t("colRegistered"),
    },
    p: {
      head: t("householder"),
      district: t("colDistrict"),
      payer: t("paymentTarget"),
      date: t("paymentDate"),
      amount: t("paymentAmount"),
      method: t("paymentMethod"),
      note: t("paymentNote"),
      recordedAt: tx("recordedAt"),
    },
    role: (v) => tr(v),
    district: (v) => tdi(v),
    gender: (v) => tg(v),
    language: (v) => tl(v),
    pickup: (v) => tp(v),
    method: (v) => (METHOD_KEYS[v] ? tf(METHOD_KEYS[v]) : v),
    tshirt: (v) => tts(v),
    yes: tc("yes"),
    no: tc("no"),
    feeExempt: tf("exempt"),
    feeWaivedValue: tf("waived"),
    feePending: tf("pending"),
    roomUnassigned: trm("unassigned"),
    statusSettled: t("balanceSettled"),
    statusOwe: t("dashOutstanding"),
    statusRefund: t("dashRefundDue"),
    statusNoFee: t("balanceNoFee"),
    payerHousehold: t("payerHousehold"),
  };

  const bytes = buildXlsx(buildAttendeeWorkbook({ attendees, payments }, labels));
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="retreat2026-attendees-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
