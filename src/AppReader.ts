import cheerio from 'cheerio';
import axios from 'axios';
import { sleep } from './tools';

export type ChunkFiles = { [key: string]: string };

export interface IExtrStr2Obj {
    names: ChunkFiles;
    hashes: ChunkFiles;
    result: ChunkFiles;
}

export default class AppReader {
    constructor(public url?: string, public html?: string) {}

    async start() {
        let html = this.html;
        if (!html) {
            ({ data: html } = await AppReader.getPage(this.url!));
        }

        let data = AppReader.getResources(html);
        let res = AppReader.parseResources(data);

        return {
            main: data,
            parsed: res,
        };
    }

    static parseResources(data: { js: { src?: string; data?: string }[]; css: { href: string }[] }): {
        js: string[];
        css: string[];
        static: {
            js: string[];
            css: string[];
        };
        staticName: string;
    } {
        // Get chunks
        let contentWPJ: string = data.js
            .filter((e) => e.hasOwnProperty('data'))
            .map((e) => e.data)
            .filter((e) => e.includes('window.webpackJsonp') || (e.includes('webpackJsonp') && e.includes('chunk')))[0];

        const regexChunkTemplate = (type) =>
            new RegExp(
                `("static\\/${type}\\/"\\+\\({(?<names>.*)}\\[(.*)\\]\\|\\|(.*)\\)\\+"\\."\\+{)(?<hashes>.*)(}\\[(.*)\\]\\+"\\.chunk\\.${type}")`,
                'i',
            );

        // TODO: rewrite code without deep '.chunk' parsing !

        // Search for chunks (loadable)
        const chunksJSdata = contentWPJ?.match(regexChunkTemplate('js'))?.groups || {};
        const chunksCSSdata = contentWPJ?.match(regexChunkTemplate('css'))?.groups || {};

        const chunkJSObj = AppReader.extactStrToObject(chunksJSdata, '.chunk');
        const chunkCSSObj = AppReader.extactStrToObject(chunksCSSdata, '.chunk');

        const regexTemplate = (type: 'css' | 'js' | 'media') =>
            new RegExp(
                // `(\\.\\/)?(?<_static>[a-z]+)(\\/${type}\\/)?(?<code>[A-b0-9\\-]+)[\\.-](?<name>[A-b0-9\\-]+(\\.chunk)?)\\.${type}`,
                `(\\.\\/)?((?<_static>[a-z]+)?\\/)?(?<hasFolder>${type}\\/)?(?<code>[A-b0-9_.\\-]+)[\\.-](?<name>[A-b0-9\\-.]+)\\.${type}`,
                'i',
            );

        const regexChunkJS = regexTemplate('js');
        const regexChunkCSS = regexTemplate('css');

        // ! bad practice of using this crutch. Remake
        let staticName = '';
        const getMatch = (src: string, regex: RegExp) => {
            let { _static, hasFolder, code, name } = src.match(regex)?.groups;
            // console.log('• regexChunkJS', src, ' => ', { code, name, hasFolder, _static });
            console.log('• SET staticName', staticName);

            staticName ||= _static || '';
            return { code, hasFolder, name, _static };
        };

        // Get chunks

        const listJS = data.js.filter((e) => e.hasOwnProperty('src'));
        const otherJS: string[] = [];
        // !fix: bad idea usin object. => Use array
        const chunkJS: ChunkFiles = {};
        let chunkJSHasFolder = false;

        for (let { src } of listJS) {
            if (src.includes('://')) continue;
            if (!src.includes('.min.') && regexChunkJS.test(src)) {
                let { code, name, hasFolder, _static } = getMatch(src, regexChunkJS);

                chunkJSHasFolder = !!hasFolder;
                if (!_static || staticName) {
                    chunkJS[code] = `${code}.${name}`;
                }
            } else {
                otherJS.push(src);
            }
        }

        const listCSS = data.css.filter((e) => e.hasOwnProperty('href'));
        const otherCSS: string[] = [];
        // !fix: bad idea usin object. => Use array
        const chunkCSS: ChunkFiles = {};
        let chunkCSSHasFolder = false;

        for (let { href } of listCSS) {
            if (href.includes('://')) continue;
            if (regexChunkCSS.test(href)) {
                let { code, name, hasFolder, _static } = getMatch(href, regexChunkCSS);
                chunkCSSHasFolder = !!hasFolder;
                if (!_static || staticName) {
                    chunkCSS[code] = `${code}.${name}`;
                }
            } else {
                otherCSS.push(href);
            }
        }

        const createPath = (type: 'js' | 'css', e: string) =>
            `${((s) => (s ? `/${s}` : ''))(
                `${staticName}${(type === 'js' ? chunkJSHasFolder : chunkCSSHasFolder) ? `/${type}` : ''}`,
            )}${e}.${type}`;
        let js = [...Object.values(chunkJS), ...Object.values(chunkJSObj.result)].map((e) => createPath('js', e));
        let css = [...Object.values(chunkCSS), ...Object.values(chunkCSSObj.result)].map((e) => createPath('css', e));

        return {
            js: otherJS,
            css: otherCSS,
            static: {
                js,
                css,
            },
            staticName,
        };
    }

    static async getPage(url: string) {
        let response = undefined;
        let attemptsCount = 3;
        try {
            do {
                try {
                    response = axios(url, {
                        timeout: 10e3,
                        maxRedirects: 10,
                    });
                    attemptsCount = 0;
                } catch (err) {
                    --attemptsCount;
                    if (attemptsCount === 0) {
                        throw err;
                    }
                }
                await sleep(1e3);
            } while (attemptsCount > 0);
        } catch (error) {
            console.error(error);
        }
        return response;
    }

    static getResources(data): { js: ({ src: string } | { data: string })[]; css: { href: string }[] } {
        const $ = cheerio.load(data);
        let output = {
            js: [],
            css: [],
        };

        $('script')
            .get()
            .forEach((elem) => {
                let data = elem.attribs['src']
                    ? {
                          src: elem.attribs['src'],
                      }
                    : elem.children.length > 0
                    ? {
                          data: elem.children[0].data,
                      }
                    : false;
                data && output.js.push(data);
            });

        $('link')
            .get()
            .filter((e) => e.attribs['href'])
            .map((e) => e.attribs['href'])
            .forEach((href) => {
                if (href.split('.').pop() == 'css' && !output.css.map((e) => e.href).includes(href)) {
                    output.css.push({ href });
                }
            });

        // $('style')
        //     .get()
        //     .forEach((elem) => {
        //         let data = elem.children.length > 0 ? { data: elem.children[0].data } : {};
        //         output.js.push(data);
        //     });

        return output;
    }

    static extactStrToObject(
        { names: strNames = '', hashes: strHashes = '' },
        additionalPostfix: string = '',
    ): IExtrStr2Obj {
        strNames = strNames.replace(/['"]+/g, '');
        strHashes = strHashes.replace(/['"]+/g, '');

        const names = strNames
            .split(',')
            .filter(Boolean)
            .reduce((prev, el) => {
                const [code, name] = el.split(':');
                return { ...prev, [code]: name };
            }, {});

        const hashes = strHashes
            .split(',')
            .filter(Boolean)
            .reduce((prev, el) => {
                const [code, name] = el.split(':');
                return { ...prev, [code]: name };
            }, {});

        const result = Object.entries(hashes).reduce((prev, [code, name]) => {
            return { ...prev, [code]: `${names[code] || code}.${name}${additionalPostfix}` };
        }, {});

        return { names, hashes, result };
    }
}

export const getMe = async (opts: { url?: string; html?: string }) => {
    const reader = new AppReader(opts.url, opts.html);
    return await reader.start();
};
