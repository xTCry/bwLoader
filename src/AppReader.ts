import cheerio from 'cheerio';
import axios from 'axios';

export default class AppReader {
    constructor(public url: string) {}

    async start() {
        let { data: html } = await AppReader.getPage(this.url);

        let data = AppReader.getResources(html);
        let { objJS, getJS, objCSS, getCSS, staticName } = AppReader.parseResources(data);

        return {
            main: data,
            static: {
                js: {
                    ...objJS,
                    ...getJS.result,
                },
                css: {
                    ...objCSS,
                    ...getCSS.result,
                },
            },
            staticName,
        };
    }

    static parseResources(data: { js: { src?: string; data?: string }[]; css: { href: string }[] }) {
        // Get chunks
        let fdata: string = data.js
            .filter((e) => e.hasOwnProperty('data'))
            .map((e) => e.data)
            .filter((e) => e.includes('window.webpackJsonp') || (e.includes('webpackJsonp') && e.includes('chunk')))[0];

        const regexChunkTemplate = (type) =>
            new RegExp(
                `("static\\/${type}\\/"\\+\\({(?<names>.*)}\\[(.*)\\]\\|\\|(.*)\\)\\+"\\."\\+{)(?<hashes>.*)(}\\[(.*)\\]\\+"\\.chunk\\.${type}")`,
                'i'
            );

        // Поиск чанков (loadable)
        const getCSSdata = fdata?.match(regexChunkTemplate('css'))?.groups || {};
        const getJSdata = fdata?.match(regexChunkTemplate('js'))?.groups || {};

        const getCSS = AppReader.extactStrToObject(getCSSdata, '.chunk');
        const getJS = AppReader.extactStrToObject(getJSdata, '.chunk');

        const regexTemplate = (type) =>
            new RegExp(
                `(\\.\\/)?(?<_static>[a-z]+)?(\\/${type}\\/)?(?<code>[A-b0-9\\-]+)[\\.-](?<name>[A-b0-9\\-]+(\\.chunk)?)\\.${type}`,
                'i'
            );

        const regexJS = regexTemplate('js');
        const regexCSS = regexTemplate('css');

        let staticName = '';
        const getMatch = (data: string, regex) => {
            let { _static, code, name } = data.match(regex)?.groups;
            staticName = staticName || _static;
            return { code, name, _static };
        };

        // Get chunks
        const objJS = data.js
            .filter((e) => e.hasOwnProperty('src'))
            .filter(({ src }) => regexJS.test(src) && !src.includes('://'))
            .map(({ src }) => getMatch(src, regexJS))
            .filter((e) => !e._static || staticName)
            .reduce((prev, { code, name }) => ({ ...prev, [code]: `${code}.${name}` }), {});

        const objCSS = data.css
            .filter((e) => e.hasOwnProperty('href'))
            .filter(({ href }) => regexCSS.test(href) && !href.includes('://'))
            .map(({ href }) => getMatch(href, regexCSS))
            .filter((e) => !e._static || staticName)
            .reduce((prev, { code, name }) => ({ ...prev, [code]: `${code}.${name}` }), {});

        return {
            objJS,
            getJS,
            objCSS,
            getCSS,
            staticName,
        };
    }

    static async getPage(url) {
        let response = undefined;
        try {
            response = axios(url, {
                timeout: 5e3,
            });
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

    static extactStrToObject({ names: strNames = '', hashes: strHashes = '' }, additionalPostfix: string = '') {
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

export const getMe = async (url) => {
    const reader = new AppReader(url);
    return await reader.start();
};
