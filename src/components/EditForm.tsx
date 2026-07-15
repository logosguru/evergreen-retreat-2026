"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { PersonFields, emptyPerson } from "./PersonFields";
import { RoomTypeSelect } from "./RoomTypeSelect";
import {
  updateMyAttendee,
  updateMyRoomType,
  addMyMember,
  removeMyMember,
} from "@/app/[locale]/edit/actions";
import type { PersonInput } from "@/app/[locale]/register/actions";
import type { Attendee, RoomType } from "@/lib/types";
import { displayName } from "@/lib/names";

function toPersonInput(a: Attendee): PersonInput {
  return {
    korean_name: a.korean_name ?? "",
    english_name: a.english_name ?? "",
    district: a.district ?? "",
    gender: a.gender ?? "",
    role: a.role ?? "",
    phone: a.phone ?? "",
    is_under_6: a.is_under_6,
    attendance: a.attendance,
    arrival_at: a.arrival_at ? a.arrival_at.slice(0, 10) : "",
    departure_at: a.departure_at ? a.departure_at.slice(0, 10) : "",
    note: a.note ?? "",
  };
}

export function EditForm({
  initial,
  roomTypes,
  currentRoomTypeId,
}: {
  initial: Attendee[];
  roomTypes: RoomType[];
  currentRoomTypeId: string;
}) {
  const t = useTranslations("Edit");
  const tc = useTranslations("Common");
  const ta = useTranslations("Admin");
  const tfee = useTranslations("Fee");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [roomTypeId, setRoomTypeId] = useState(currentRoomTypeId);
  const [rtSaved, setRtSaved] = useState(false);
  const [rtError, setRtError] = useState(false);

  // 새 멤버 추가 폼
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState<PersonInput>(emptyPerson);
  const [addError, setAddError] = useState(false);

  const [rows, setRows] = useState(() =>
    initial.map((a) => ({
      id: a.id,
      isHead: a.is_householder,
      data: toPersonInput(a),
    })),
  );

  // 정원 경고: 6세 이상 인원수 > 선택 타입 capacity
  const headcount = rows.filter((r) => !r.data.is_under_6).length;
  const selectedType = roomTypes.find((rt) => rt.id === roomTypeId);
  const overCapacity = selectedType && headcount > selectedType.capacity;

  function patch(id: string, p: Partial<PersonInput>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, data: { ...r.data, ...p } } : r)),
    );
    setSavedId(null);
  }

  function save(id: string, data: PersonInput) {
    setSavingId(id);
    setSavedId(null);
    setErrorId(null);
    start(async () => {
      const result = await updateMyAttendee(id, data);
      setSavingId(null);
      if (result.ok) {
        setSavedId(id);
        router.refresh();
      } else {
        setErrorId(id);
      }
    });
  }

  function saveRoomType(next: string) {
    setRoomTypeId(next);
    setRtSaved(false);
    setRtError(false);
    start(async () => {
      const r = await updateMyRoomType(next === "" ? null : next);
      if (r.ok) {
        setRtSaved(true);
        router.refresh();
      } else {
        setRtError(true);
      }
    });
  }

  function addMember() {
    setAddError(false);
    start(async () => {
      const r = await addMyMember(newMember);
      if (r.ok) {
        setAdding(false);
        setNewMember(emptyPerson());
        router.refresh();
      } else {
        setAddError(true);
      }
    });
  }

  function removeMember(id: string) {
    if (!window.confirm(t("confirmRemove"))) return;
    start(async () => {
      const r = await removeMyMember(id);
      if (r.ok) {
        setRows((prev) => prev.filter((row) => row.id !== id));
        router.refresh();
      }
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        {t("notFound")}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white/70 p-5 ring-1 ring-line">
        <label className="block text-sm font-medium text-bark">
          {tfee("roomType")}
        </label>
        <RoomTypeSelect
          roomTypes={roomTypes}
          value={roomTypeId}
          onChange={saveRoomType}
          className="mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-sm focus:border-moss focus:outline-none focus:ring-1 focus:ring-moss"
        />
        {overCapacity && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            {t("capacityWarning", {
              count: headcount,
              capacity: selectedType!.capacity,
            })}
          </p>
        )}
        {rtSaved ? (
          <p className="mt-1 text-xs text-moss">{t("updateSuccess")}</p>
        ) : rtError ? (
          <p className="mt-1 text-xs text-rose-700">{t("updateError")}</p>
        ) : null}
      </section>

      {rows.map((r) => (
        <section key={r.id} className="rounded-2xl bg-white/70 p-5 ring-1 ring-line">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-display-ko text-lg font-bold text-pine">
              {displayName(r.data)}
            </span>
            {r.isHead && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-moss">
                {ta("householder")}
              </span>
            )}
            {!r.isHead && (
              <button
                type="button"
                onClick={() => removeMember(r.id)}
                disabled={pending}
                className="ml-auto text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-60"
              >
                {t("removeMember")}
              </button>
            )}
          </div>
          <PersonFields
            value={r.data}
            onChange={(p) => patch(r.id, p)}
            groupId={`edit-${r.id}`}
            showContact
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={pending && savingId === r.id}
              onClick={() => save(r.id, r.data)}
              className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-ivory transition hover:bg-pine-deep disabled:opacity-60"
            >
              {savingId === r.id ? tc("submitting") : tc("save")}
            </button>
            {savedId === r.id && (
              <span className="text-sm font-medium text-moss">
                {t("updateSuccess")}
              </span>
            )}
            {errorId === r.id && (
              <span className="text-sm text-rose-700">{t("updateError")}</span>
            )}
          </div>
        </section>
      ))}

      {/* 가족 추가 */}
      {adding ? (
        <section className="rounded-2xl bg-white/70 p-5 ring-1 ring-line">
          <p className="mb-3 font-display-ko text-lg font-bold text-pine">
            {t("newMemberTitle")}
          </p>
          <PersonFields
            value={newMember}
            onChange={(p) => setNewMember((prev) => ({ ...prev, ...p }))}
            groupId="new-member"
          />
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={addMember}
              className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-ivory transition hover:bg-pine-deep disabled:opacity-60"
            >
              {t("saveNewMember")}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddError(false);
              }}
              className="text-sm font-medium text-bark-soft hover:text-pine"
            >
              {t("cancel")}
            </button>
            {addError && (
              <span className="text-sm text-rose-700">{t("updateError")}</span>
            )}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-2xl border-2 border-dashed border-line px-5 py-4 text-sm font-medium text-bark-soft transition hover:border-moss hover:text-pine"
        >
          + {t("addMember")}
        </button>
      )}

      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="text-sm font-medium text-bark-soft hover:text-pine"
        >
          {t("signOut")}
        </button>
      </form>
    </div>
  );
}
