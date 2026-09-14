export function parseRouteId(value: string | undefined): number | undefined {
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) {
        return undefined;
    }
    return Math.trunc(id);
}
