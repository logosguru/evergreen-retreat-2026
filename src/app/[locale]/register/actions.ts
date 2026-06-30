"use server";

import { createClient } from "@/lib/supabase/server";
import type { Attendance, Gender, Role } from "@/lib/types";
import { verifyTurnstile } from "@/lib/turnstile";

export type PersonInput = {
  korean_name: string;
  english_name?: string;
  district?: string;
  gender?: Gender | "";
  role?: Role | "";
  phone?: string;
  is_under_6?: boolean;
  attendance: Attendance;
  arrival_at?: string; // datetime-local 문자열
  departure_at?: string;
  note?: string;
};

export type RegistrationPayload = {
  mode: "individual" | "household";
  email: string; // 가구주(대표자) 이메일 — 수정 링크 발송용
  householder: PersonInput;
  members: PersonInput[]; // household 모드에서만
};

export type RegistrationResult = { ok: true } | { ok: false; error: string };

function clean(s?: string): string | null {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
}

// datetime-local "YYYY-MM-DDTHH:mm" 문자열을 그대로 저장(wall-clock 보존).
// Date 변환을 거치지 않아 dev/prod 런타임 타임존에 흔들리지 않는다.
function toTimestamp(s?: string): string | null {
  return clean(s);
}

function validatePerson(p: PersonInput): string | null {
  if (!clean(p.korean_name)) return "validationName";
  if (
    p.attendance === "partial" &&
    (!clean(p.arrival_at) || !clean(p.departure_at))
  ) {
    return "validationPartial";
  }
  return null;
}

function rowFor(
  p: PersonInput,
  opts: {
    id: string;
    is_householder: boolean;
    email: string | null;
    householder_id: string | null;
  },
) {
  return {
    id: opts.id,
    korean_name: clean(p.korean_name)!,
    english_name: clean(p.english_name),
    district: clean(p.district),
    gender: p.gender ? p.gender : null,
    role: p.role ? p.role : "member",
    phone: clean(p.phone),
    is_under_6: !!p.is_under_6,
    attendance: p.attendance,
    arrival_at: p.attendance === "partial" ? toTimestamp(p.arrival_at) : null,
    departure_at:
      p.attendance === "partial" ? toTimestamp(p.departure_at) : null,
    note: clean(p.note),
    is_householder: opts.is_householder,
    householder_id: opts.householder_id,
    email: opts.email,
  };
}

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
