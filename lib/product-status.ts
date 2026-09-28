export type ProductStatus =
  | "BINH_THUONG"
  | "CANH_BAO"
  | "BAO_LAI"
  | "DA_BAO"
  | "LOI";

type ProductStatusInput = {
  manufactureDate: string | null;
  expiryDate: string | null;
  reminderDate: string | null;
  alertSent: boolean;
  thresholdPercent: number;
};

export type ProductStatusResult = {
  status: ProductStatus;
  percentRemaining: number | null;
};

function getVietnamToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find(
    (part) => part.type === "year"
  )?.value;

  const month = parts.find(
    (part) => part.type === "month"
  )?.value;

  const day = parts.find(
    (part) => part.type === "day"
  )?.value;

  return `${year}-${month}-${day}`;
}

function parseDateOnly(
  value: string | null
): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})$/
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const timestamp = Date.UTC(
    year,
    month - 1,
    day
  );

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return timestamp;
}

export function calculateExpiryPercent(
  manufactureDate: string | null,
  expiryDate: string | null,
  today = getVietnamToday()
): number | null {
  const manufacture =
    parseDateOnly(manufactureDate);

  const expiry = parseDateOnly(expiryDate);

  const current = parseDateOnly(today);

  if (
    manufacture === null ||
    expiry === null ||
    current === null
  ) {
    return null;
  }

  const totalLifetime = expiry - manufacture;

  if (totalLifetime <= 0) {
    return null;
  }

  const remaining = expiry - current;

  const rawPercent =
    (remaining / totalLifetime) * 100;

  const clampedPercent = Math.max(
    0,
    Math.min(100, rawPercent)
  );

  return Math.round(clampedPercent * 100) / 100;
}

export function getProductStatus(
  input: ProductStatusInput
): ProductStatusResult {
  const today = getVietnamToday();

  const percentRemaining =
    calculateExpiryPercent(
      input.manufactureDate,
      input.expiryDate,
      today
    );

  // =========================
  // ƯU TIÊN NGÀY BÁO LẠI
  // =========================

  if (input.reminderDate) {
    if (input.alertSent) {
      return {
        status: "DA_BAO",
        percentRemaining,
      };
    }

    if (input.reminderDate < today) {
      return {
        status: "LOI",
        percentRemaining,
      };
    }

    return {
      status: "BAO_LAI",
      percentRemaining,
    };
  }

  // =========================
  // KHÔNG CÓ NGÀY BÁO LẠI
  // =========================

  if (input.alertSent) {
    return {
      status: "DA_BAO",
      percentRemaining,
    };
  }

  if (
    percentRemaining !== null &&
    percentRemaining <= input.thresholdPercent
  ) {
    return {
      status: "CANH_BAO",
      percentRemaining,
    };
  }

  return {
    status: "BINH_THUONG",
    percentRemaining,
  };
}