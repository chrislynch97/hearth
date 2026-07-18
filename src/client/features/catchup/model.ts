export interface BacklogSpend {
    id: string;
    date: string;
    description: string;
    amount: number;
    ownerId: string;
}

export interface BacklogPayer {
    ownerId: string;
    total: number;
    count: number;
    residual: number;
    spends: BacklogSpend[];
}

export interface BacklogPot {
    potId: string;
    potName: string;
    ownerId: string;
    total: number;
    count: number;
    residual: number;
    payers: BacklogPayer[];
}
