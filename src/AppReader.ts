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
        delimChar: string;
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
                `` +
                    `(\\.?\\/)?` +
                    `((?<_static>[a-z/\\-]+)?\\/)?` +
                    `(?<hasFolder>${type}\\/)?` +
                    `(?<code>[@a-z0-9_\\-\\.]+)` +
                    `(?<delimChar>[\\-\\.])` +
                    // New generation hash includes more chars
                    `(?<hash>[a-z0-9_\\-\\.]+)` +
                    `\\.${type}`,
                'i',
            );

        const regexChunkJS = regexTemplate('js');
        const regexChunkCSS = regexTemplate('css');

        const delimChars: Record<string, number> = {};

        // ! bad practice of using this crutch. Remake
        let staticName = '';
        const getMatch = (src: string, regex: RegExp) => {
            let { _static, hasFolder, code, hash, delimChar } = src.match(regex)?.groups;
            // console.log('• regexChunkJS', src, ' => ', { code, hash, hasFolder, _static });
            const _staticName = _static || '';
            if ((!staticName || _staticName) && staticName !== _staticName) {
                console.log(`• SET staticName: new=>"${_staticName}"; old=>"${staticName}"`);
                staticName = _staticName;
            }

            if (!(delimChar in delimChars)) {
                delimChars[delimChar] = 0;
            }
            delimChars[delimChar]++;

            return { code, hasFolder, hash, _static, delimChar };
        };

        // Get chunks

        const listJS = data.js.filter((e) => e.hasOwnProperty('src'));
        const otherJS: string[] = [];
        // !fix: bad idea usin object. => Use array
        const chunkJS: ChunkFiles = {};
        let chunkJSHasFolder = false;

        for (let { src } of listJS) {
            if (src.includes('://')) continue;
            // console.log('src', src, src.match(regexChunkJS)?.groups);

            if (!src.includes('.min.') && regexChunkJS.test(src)) {
                let { code, hash, hasFolder, _static, delimChar } = getMatch(src, regexChunkJS);

                chunkJSHasFolder = !!hasFolder;
                if (!_static || staticName) {
                    chunkJS[code] = `${code}${delimChar || '.'}${hash}`;
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
                let { code, hash, hasFolder, _static, delimChar } = getMatch(href, regexChunkCSS);
                chunkCSSHasFolder = !!hasFolder;
                if (!_static || staticName) {
                    chunkCSS[code] = `${code}${delimChar || '.'}${hash}`;
                }
            } else {
                otherCSS.push(href);
            }
        }

        const createPath = (type: 'js' | 'css', e: string) =>
            `${((s) => (s ? `/${s}` : ''))(
                `${staticName}/${(type === 'js' ? chunkJSHasFolder : chunkCSSHasFolder) ? type : ''}`,
            )}${e}.${type}`;
        let js = [...Object.values(chunkJS), ...Object.values(chunkJSObj.result)].map((e) => createPath('js', e));
        let css = [...Object.values(chunkCSS), ...Object.values(chunkCSSObj.result)].map((e) => createPath('css', e));

        const delimChar = Object.keys(delimChars).reduce((a, b) => (delimChars[a] > delimChars[b] ? a : b));

        return {
            js: otherJS,
            css: otherCSS,
            static: {
                js,
                css,
            },
            staticName,
            delimChar,
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

        for (const elem of $('script').get()) {
            const data: false | { src: string } | { data: string } = elem.attribs['src']
                ? { src: elem.attribs['src'] }
                : elem.children.length > 0
                ? { data: elem.children[0].data }
                : false;
            if (data) {
                output.js.push(data);
            }
        }

        const hrefs = $('link')
            .get()
            .map((e) => e.attribs['href'] as string)
            .filter(Boolean);
        for (const href of hrefs) {
            const extension = href.split('.').pop();
            if (extension == 'css') {
                if (!output.css.map((e) => e.href).includes(href)) {
                    output.css.push({ href });
                }
            } else if (extension == 'js') {
                if (!output.js.map((e) => e.src).includes(href)) {
                    output.js.push({ src: href });
                }
            }
        }

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
