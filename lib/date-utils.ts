export type ParsedVietnamDate = {
  iso: string;
  display: string;
};


function isValidDate(
  day: number,
  month: number,
  year: number
): boolean {
  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}


export function parseVietnamDateInput(
  value: string
): ParsedVietnamDate | null {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return null;
  }


  let dayText = "";
  let monthText = "";
  let yearText = "";


  /*
   * ================================================
   * 1. DẠNG KHÔNG CÓ DẤU /
   * ================================================
   *
   * 12092026 -> 12/09/2026
   * 120926   -> 12/09/2026
   */

  if (/^\d{8}$/.test(trimmed)) {
    dayText =
      trimmed.slice(0, 2);

    monthText =
      trimmed.slice(2, 4);

    yearText =
      trimmed.slice(4, 8);
  } else if (
    /^\d{6}$/.test(trimmed)
  ) {
    dayText =
      trimmed.slice(0, 2);

    monthText =
      trimmed.slice(2, 4);

    yearText =
      `20${trimmed.slice(4, 6)}`;
  } else {
    /*
     * ================================================
     * 2. DẠNG CÓ DẤU /
     * ================================================
     *
     * 12/9/2026 -> 12/09/2026
     * 1/9/2026  -> 01/09/2026
     * 1/9/26    -> 01/09/2026
     */

    const match =
      trimmed.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/
      );

    if (!match) {
      return null;
    }

    dayText =
      match[1];

    monthText =
      match[2];

    yearText =
      match[3].length === 2
        ? `20${match[3]}`
        : match[3];
  }


  const day =
    Number(dayText);

  const month =
    Number(monthText);

  const year =
    Number(yearText);


  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    return null;
  }


  if (
    year < 2000 ||
    year > 9999
  ) {
    return null;
  }


  if (
    !isValidDate(
      day,
      month,
      year
    )
  ) {
    return null;
  }


  const display = [
    String(day).padStart(2, "0"),
    String(month).padStart(2, "0"),
    String(year).padStart(4, "0"),
  ].join("/");


  const iso = [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");


  return {
    iso,
    display,
  };
}


export function vietnamDateToIso(
  value: string
): string | null {
  return (
    parseVietnamDateInput(value)
      ?.iso ??
    null
  );
}


export function normalizeVietnamDateInput(
  value: string
): string {
  const parsed =
    parseVietnamDateInput(value);

  return parsed
    ? parsed.display
    : value;
}