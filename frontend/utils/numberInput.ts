/**
 * 문자열 입력에서 숫자만 필터링하여 반환.
 * 소수점과 음수 부호도 허용.
 */
export function filterNumeric(raw: string): number {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * 정수만 필터링
 */
export function filterInt(raw: string): number {
  const cleaned = raw.replace(/[^0-9\-]/g, "");
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
}
