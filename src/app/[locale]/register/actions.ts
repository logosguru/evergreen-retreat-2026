"use server";

import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { clean, rowFor, validatePerson } from "@/lib/attendee-rows";

// PersonInput 은 공유 lib 로 이동 — 기존 import 경로 호환을 위해 재노출.
export type { PersonInput } from "@/lib/attendee-rows";
import type { PersonInput } from "@/lib/attendee-rows";

export type RegistrationPayload = {
  mode: "individual" | "household";
  email: string; // 가구주(대표자) 이메일 — 수정 링크 발송용
  householder: PersonInput;
  members: PersonInput[]; // household 모드에서만
};

export type RegistrationResult = { ok: true } | { ok: false; error: string };

export async function insertRegistration(
  payload: RegistrationPayload,
  turnstileToken: string | null,
): Promise<RegistrationResult> {
  if (!(await verifyTurnstile(turnstileToken))) {
    return { ok: false, error: "captchaFailed" };
  }
  const email = clean(payload.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "validationEmail" };
  }

  const supabaseCheck = await createClient();
  const { data: already } = await supabaseCheck.rpc("email_registered", {
    check_email: email,
  });
  if (already) {
    return { ok: false, error: "alreadyRegistered" };
  }

  const headErr = validatePerson(payload.householder);
  if (headErr) return { ok: false, error: headErr };

  const members = payload.mode === "household" ? payload.members : [];
  for (const m of members) {
    const e = validatePerson(m);
    if (e) return { ok: false, error: e };
  }

  const supabase = await createClient();

  // 가구주 id를 서버에서 미리 생성해 가구주+가족을 한 번의 insert로 처리.
  // anon 역할은 SELECT 정책이 없어(.select() 불가) insert-후-select-back이 막히므로
  // id를 미리 만들어 select-back 없이 삽입한다. 개인 등록도 1인 가구로 처리.
  const headId = crypto.randomUUID();
  const rows = [
    rowFor(payload.householder, {
      id: headId,
      is_householder: true,
      email,
      householder_id: null,
    }),
    ...members.map((m) =>
      rowFor(m, {
        id: crypto.randomUUID(),
        is_householder: false,
        email: null,
        householder_id: headId,
      }),
    ),
  ];

  const { error: insertErr } = await supabase.from("attendees").insert(rows);
  if (insertErr) {
    // 23505 = unique_violation → 이메일 중복(경합으로 1단계 확인을 통과한 경우)
    if (insertErr.code === "23505") {
      return { ok: false, error: "alreadyRegistered" };
    }
    return { ok: false, error: "error" };
  }

  return { ok: true };
}

export type CheckEmailResult =
  | { ok: true; registered: boolean }
  | { ok: false; error: string };

// 이메일 형식 검증 후, 명단 비노출 RPC로 등록 여부(boolean)만 확인한다.
export async function checkEmail(emailRaw: string): Promise<CheckEmailResult> {
  const email = clean(emailRaw);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "validationEmail" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("email_registered", {
    check_email: email,
  });
  if (error) return { ok: false, error: "error" };
  return { ok: true, registered: !!data };
}

export type CheckNameResult =
  | { ok: true; matched: boolean; maskedEmails: string[] }
  | { ok: false; error: string };

// 이름(한글/영어 표기 무관)으로 등록 여부 확인. 정규화 정확 일치만 —
// 명단 비노출 RPC가 마스킹된 가구 대표 이메일 배열만 반환한다.
export async function checkName(nameRaw: string): Promise<CheckNameResult> {
  const name = clean(nameRaw);
  if (!name || name.replace(/\s/g, "").length < 2) {
    return { ok: false, error: "validationCheckName" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("name_registered", {
    check_name: name,
  });
  if (error) return { ok: false, error: "error" };
  const maskedEmails = (data ?? []) as string[];
  return { ok: true, matched: maskedEmails.length > 0, maskedEmails };
}
