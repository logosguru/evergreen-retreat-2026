"use server";

import { createClient } from "@/lib/supabase/server";
import type { Language } from "@/lib/types";
import {
  clean,
  cleanPickup,
  rowFor,
  validatePerson,
  type PersonInput,
} from "@/lib/attendee-rows";

// INSERT 는 guard 트리거(BEFORE UPDATE 전용)·RLS(anon/authenticated 모두 허용)로
// 관리자 여부를 막지 못하므로, 수동 입력 액션은 클레임으로 직접 admin 을 확인한다.
async function isAdminSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  const appMetadata = (data?.claims?.app_metadata ?? {}) as Record<
    string,
    unknown
  >;
  return appMetadata.app_role === "admin";
}

// 회비 납입/환불 1건 기록 (관리자 전용). amount 양수=납입, 음수=환불.
export async function addPayment(input: {
  headId: string;
  amount: number;
  method: string | null;
  paidAt: string; // YYYY-MM-DD
  note?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) return { ok: false, error: "notAdmin" };
  if (!Number.isFinite(input.amount) || Math.round(input.amount) === 0) {
    return { ok: false, error: "validationAmount" };
  }
  if (!input.paidAt) return { ok: false, error: "validationDate" };
  const { error } = await supabase.from("fee_payments").insert({
    head_id: input.headId,
    amount: Math.round(input.amount),
    method: clean(input.method),
    note: clean(input.note ?? null),
    paid_at: input.paidAt,
  });
  return error ? { ok: false, error: "paymentError" } : { ok: true };
}

// 납입 기록 삭제 (오기재 정정, 관리자 전용).
export async function deletePayment(id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) return { ok: false };
  const { error } = await supabase.from("fee_payments").delete().eq("id", id);
  return { ok: !error };
}

// 성도 언어 지정 (관리자 전용).
export async function setLanguage(id: string, language: Language) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({ language })
    .eq("id", id);
  return { ok: !error };
}

export type AdminEditInput = PersonInput & {
  email?: string;
  language: Language;
  retreat_group?: string;
  is_group_leader?: boolean;
  requested_room_type_id?: string | null;
};

// 관리자 수동 입력(가구주 + 가족 일괄). 공개 등록과 달리 Turnstile 없음, admin 필드 포함.
export type AdminInsertPayload = {
  mode: "individual" | "household";
  email?: string; // 선택 — 있으면 본인 수정 링크(매직링크)용, 중복이면 차단
  householder: PersonInput;
  members: PersonInput[]; // household 모드에서만
  language: Language;
  retreat_group?: string;
  is_group_leader?: boolean;
  // 개인 모드에서 기존 가구에 구성원으로 추가할 때 그 가구주 id. 없으면 새 가구.
  attachToHeadId?: string;
};

export async function adminInsertAttendee(
  payload: AdminInsertPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) {
    return { ok: false, error: "notAdmin" };
  }

  const headErr = validatePerson(payload.householder);
  if (headErr) return { ok: false, error: headErr };

  const members = payload.mode === "household" ? payload.members : [];
  for (const m of members) {
    const e = validatePerson(m);
    if (e) return { ok: false, error: e };
  }

  const email = clean(payload.email);
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "validationEmail" };
    }
    const { data: already } = await supabase.rpc("email_registered", {
      check_email: email,
    });
    if (already) return { ok: false, error: "alreadyRegistered" };
  }

  const adminCommon = {
    language: payload.language,
    retreat_group: clean(payload.retreat_group),
  };

  // 개인 모드 + 기존 가구 지정 → 그 가구의 구성원 1명으로 추가.
  const attachTo = clean(payload.attachToHeadId);
  if (payload.mode === "individual" && attachTo) {
    const { data: head } = await supabase
      .from("attendees")
      .select("is_householder")
      .eq("id", attachTo)
      .single();
    if (!head || !head.is_householder) {
      return { ok: false, error: "headNotFound" };
    }
    const memberId = crypto.randomUUID();
    const { error } = await supabase.from("attendees").insert([
      {
        ...rowFor(payload.householder, {
          id: memberId,
          is_householder: false,
          email,
          householder_id: attachTo,
        }),
        ...adminCommon,
        is_group_leader: !!payload.is_group_leader,
      },
    ]);
    if (error) {
      if (error.code === "23505") return { ok: false, error: "alreadyRegistered" };
      return { ok: false, error: "error" };
    }
    return { ok: true, id: memberId };
  }

  // 가구주 id 를 서버에서 미리 생성해 가구주+가족을 한 번의 insert 로 처리.
  // admin 필드(language/retreat_group)는 가구 전체에 적용, is_group_leader 는 가구주만.
  const headId = crypto.randomUUID();
  const rows = [
    {
      ...rowFor(payload.householder, {
        id: headId,
        is_householder: true,
        email,
        householder_id: null,
      }),
      ...adminCommon,
      is_group_leader: !!payload.is_group_leader,
    },
    ...members.map((m) => ({
      ...rowFor(m, {
        id: crypto.randomUUID(),
        is_householder: false,
        email: null,
        householder_id: headId,
      }),
      ...adminCommon,
      is_group_leader: false,
    })),
  ];

  const { error } = await supabase.from("attendees").insert(rows);
  if (error) {
    // 23505 = unique_violation → 이메일 중복(경합)
    if (error.code === "23505") {
      return { ok: false, error: "alreadyRegistered" };
    }
    return { ok: false, error: "error" };
  }
  return { ok: true, id: headId };
}

// 참석자를 관리자로 지정/해제 (admins 이메일 allowlist 관리).
// makeAdmin=true → admins insert(중복 무시), false → 삭제(본인은 차단).
// 지정 후 대상자는 재로그인해야 클레임(app_role)이 반영됨.
export async function setAttendeeAdmin(
  email: string,
  makeAdmin: boolean,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const appMetadata = (claimsData?.claims?.app_metadata ?? {}) as Record<
    string,
    unknown
  >;
  if (appMetadata.app_role !== "admin") {
    return { ok: false, error: "notAdmin" };
  }

  const target = clean(email)?.toLowerCase();
  if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    return { ok: false, error: "adminNeedsEmail" };
  }

  if (makeAdmin) {
    const { error } = await supabase
      .from("admins")
      .upsert({ email: target, name: clean(name) }, { onConflict: "email" });
    if (error) return { ok: false, error: "adminRoleError" };
    return { ok: true };
  }

  // 해제: 본인(현재 세션 이메일)은 차단 → 잠금 방지.
  const sessionEmail = ((claimsData?.claims?.email as string) ?? "").toLowerCase();
  if (sessionEmail && sessionEmail === target) {
    return { ok: false, error: "cannotRemoveSelf" };
  }
  const { error } = await supabase.from("admins").delete().ilike("email", target);
  if (error) return { ok: false, error: "adminRoleError" };
  return { ok: true };
}

// 가구주 재지정. new_head=null → 독립 가구주, 지정 시 그 가구 구성원으로.
// 구성원 있는 가구주 강등 시 최선등록자 자동 승격(RPC가 원자적으로 처리).
export async function adminSetHouseholder(
  targetId: string,
  newHeadId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) {
    return { ok: false, error: "notAdmin" };
  }
  const { error } = await supabase.rpc("admin_set_householder", {
    target: targetId,
    new_head: newHeadId,
  });
  if (error) return { ok: false, error: "householdError" };
  return { ok: true };
}

// 관리자 전체 편집(화이트리스트). admin은 RLS + guard 트리거 통과.
export async function adminUpdateAttendee(
  id: string,
  input: AdminEditInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!clean(input.korean_name) && !clean(input.english_name)) {
    return { ok: false, error: "validationName" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendees")
    .update({
      korean_name: clean(input.korean_name),
      english_name: clean(input.english_name),
      district: clean(input.district),
      gender: input.gender ? input.gender : null,
      role: input.role ? input.role : "member",
      phone: clean(input.phone),
      email: clean(input.email),
      is_under_6: !!input.is_under_6,
      attendance: input.attendance,
      arrival_at:
        input.attendance === "partial" ? clean(input.arrival_at) : null,
      departure_at:
        input.attendance === "partial" ? clean(input.departure_at) : null,
      pickup_location: cleanPickup(input.pickup_location),
      note: clean(input.note),
      language: input.language,
      retreat_group: clean(input.retreat_group),
      is_group_leader: !!input.is_group_leader,
      requested_room_type_id: clean(input.requested_room_type_id),
    })
    .eq("id", id);

  if (error) return { ok: false, error: "updateError" };
  return { ok: true };
}

// 삭제(+가구주 승격은 RPC가 원자적으로 처리).
export async function adminDeleteAttendee(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_attendee", { target: id });
  if (error) return { ok: false, error: "deleteError" };
  return { ok: true };
}

// 이메일 신청 처리 완료 (관리자 전용). 관리자가 본인 확인 후 참석자 편집에서
// 이메일을 입력하고 이 액션으로 신청을 마감한다.
export async function setEmailRequestProcessed(
  id: string,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  if (!(await isAdminSession(supabase))) return { ok: false };
  const { error } = await supabase
    .from("email_requests")
    .update({ processed: true })
    .eq("id", id);
  return { ok: !error };
}
