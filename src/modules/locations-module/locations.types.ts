export interface NigerianLocationCatalogue {
    [state: string]: string[];
}

export interface LocationResponse<T> {
    success: boolean;
    message?: string;
    data: T;
}

export interface StateLocation {
    name: string;
}

export interface LgaLocation {
    name: string;
    state: string;
}