export type BgmTrack = {
    id: string;
    name: string;
    fileName: string;
    createdAt: string;
};

export type BgmCatalog = {
    tracks: BgmTrack[];
};
