export class PaginationMeta {
    total!: number;
    page!: number;
    limit!: number;
    totalPages!: number;
}

export class PaginatedResponse<T> {
    data!: T[];
    meta!: PaginationMeta;
}

export function paginated<T>(data: T[], total: number, page: number, limit: number): PaginatedResponse<T> {
    return {
        data,
        meta: {
            total,
            page,
            limit,
            totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
        },
    };
}
