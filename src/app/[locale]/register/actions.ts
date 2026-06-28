"use server";

import { createClient } from "@/lib/supabase/server";
import type { Attendance, Gender, Role } from "@/lib/types";

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
    is_householder: boolean;
    email: string | null;
    householder_id: string | null;
  },
) {
  return {
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
): Promise<RegistrationResult> {
  // TODO(Phase1 출시 전): Cloudflare Turnstile 토큰 검증 추가 (공개 INSERT 스팸 방지)
  const email = clean(payload.email);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "validationEmail" };
  }

  const headErr = validatePerson(payload.householder);
  if (headErr) return { ok: false, error: headErr };

  const members = payload.mode === "household" ? payload.members : [];
  for (const m of members) {
    const e = validatePerson(m);
    if (e) return { ok: false, error: e };
  }

  const supabase = await createClient();

  // 가구주(또는 개인) 행을 먼저 삽입해 id 확보. 개인 등록도 1인 가구로 처리.
  const { data: head, error: insertHeadErr } = await supabase
    .from("attendees")
    .insert(
      rowFor(payload.householder, {
        is_householder: true,
        email,
        householder_id: null,
      }),
    )
    .select("id")
    .single();

  if (insertHeadErr || !head) {
    return { ok: false, error: "error" };
  }

  if (members.length > 0) {
    const rows = members.map((m) =>
      rowFor(m, {
        is_householder: false,
        email: null,
        householder_id: head.id,
      }),
    );
    const { error: insertMembersErr } = await supabase
      .from("attendees")
      .insert(rows);
    if (insertMembersErr) {
      return { ok: false, error: "error" };
    }
  }

  return { ok: true };
}
