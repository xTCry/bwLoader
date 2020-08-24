import { rword } from 'rword';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const ComName = () =>
    rword.generate(1, {
        length: '5-10',
        capitalize: 'all',
    });

export type xConfig<T> = {
    [P in keyof T]: any;
};

export interface GitConfig {
    GIT_TOKEN?: string;
    GIT_PASSWD?: string;
    GIT_LOGIN?: string;
    GIT_URI?: string;
    GIT_ORG?: string;
    GIT_SSH?: string;
}

export interface GitServerResponse {
    clone_url: string;
    html_url: string;
}
