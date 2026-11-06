// 斤量 is the plain Txt_C cell right after 性齢 (Barei) on shutuba.html. The "Weight" cell is
// 馬体重, which is empty before the race; reading it made every horse fall back to 55/57.
export function parseCarriedWeight(rowHtml) {
  const raw = String(rowHtml ?? "").match(
    /<td class="Barei[^"]*"[^>]*>[\s\S]*?<\/td>\s*<td class="Txt_C"[^>]*>\s*([0-9]{2}(?:\.[0-9])?)\s*<\/td>/i
  )?.[1];
  const weight = Number.parseFloat(raw ?? "");
  return Number.isFinite(weight) && weight >= 45 && weight <= 65 ? weight : 0;
}
