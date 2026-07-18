export const daysSince = (dateStr: string): number => {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return 0;
    return Math.floor((Date.now() - Date.UTC(y, m - 1, d)) / 86_400_000);
};

// A balance older than this is flagged as stale — net worth may be out of date.
export const STALE_DAYS = 90;

export const ageLabel = (days: number): string => {
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 31) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
};

// Subtype options offered per kind. Purely descriptive — net worth uses `kind`.
export const SUBTYPES: Record<
    "asset" | "liability",
    { value: string; label: string }[]
> = {
    asset: [
        { value: "savings", label: "Savings" },
        { value: "pension", label: "Pension" },
        { value: "investment", label: "Investment" },
        { value: "property", label: "Property" },
        { value: "cash", label: "Cash" },
        { value: "other", label: "Other" },
    ],
    liability: [
        { value: "mortgage", label: "Mortgage" },
        { value: "student_loan", label: "Student loan" },
        { value: "loan", label: "Loan" },
        { value: "credit_card", label: "Credit card" },
        { value: "other", label: "Other" },
    ],
};

export const today = (): string => new Date().toISOString().slice(0, 10);
