import type { Course } from "./types";

const RACE_SHORT_COMMENTS: Record<string, string> = {
  "アネモネS": "桜花賞トライアル最終便。上位馬が本番へ滑り込むラストチャンス。",
  "東風S": "中山マイルの古馬オープン。春のマイル路線を占う実戦型の一戦。",
  "スプリングS": "皐月賞トライアル。中山1800mで機動力と完成度が問われる。",
  "昇竜S": "3歳ダート短距離のオープン特別。スピードと完成度を測る素材戦。",
  "金鯱賞": "大阪杯へ向かう中京芝2000mの重要ステップ。古馬中距離の主力が集まりやすい。",
  "コーラルS": "阪神ダート1400mの古馬オープン。先行力と持続力が問われる。",
  "米子城S": "阪神1200mのスプリントオープン。高速決着への対応力が出やすい。",
  "中山記念": "春の中距離戦線を占う伝統の別定G2。機動力と総合力が問われる。",
  "オーシャンS": "高松宮記念へ向かう前哨戦。中山1200m適性が色濃く出る。",
  "チューリップ賞": "桜花賞へ向かう牝馬路線の重要トライアル。完成度と瞬発力を見たい一戦。",
  "フェブラリーS": "JRAダートG1の開幕戦。マイルでの総合力と立ち回りが問われる。",
};

function surfaceLabel(surface: Course["surface"]) {
  return surface === "Dirt" ? "ダート" : "芝";
}

function cleanRaceLabel(label: string | undefined) {
  return String(label ?? "")
    .replace(/\s*出馬表\s*$/u, "")
    .trim();
}

function fallbackComment(course: Pick<Course, "grade" | "surface" | "distance" | "venue">) {
  const gradeLabel = course.grade ? `${course.grade}の` : "";
  const venueLabel = course.venue ? `${course.venue}の` : "";
  return `${venueLabel}${surfaceLabel(course.surface)}${course.distance}mで行われる${gradeLabel}注目レース。コース適性の差が出やすい。`;
}

export function buildCourseDisplayName(course: Pick<Course, "name" | "venue" | "surface" | "distance"> & { label?: string }) {
  const raceLabel = cleanRaceLabel(course.label) || course.name;
  const venue = course.venue ? `${course.venue} ` : "";
  return `${raceLabel}（${venue}${surfaceLabel(course.surface)} ${course.distance}m） 出馬表`;
}

export function buildCourseShortComment(course: Pick<Course, "grade" | "surface" | "distance" | "venue"> & { label?: string }) {
  const raceLabel = cleanRaceLabel(course.label);
  return RACE_SHORT_COMMENTS[raceLabel] ?? fallbackComment(course);
}
