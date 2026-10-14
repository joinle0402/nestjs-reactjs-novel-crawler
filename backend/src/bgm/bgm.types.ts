export type BgmTrack = {
    id: string;
    name: string;
    fileName: string;
    createdAt: string;
};

export type BgmCatalog = {
    tracks: BgmTrack[];
    /** Tên file gốc đã nhập một lần. Xóa track không nhập lại. */
    importedSources?: string[];
};
