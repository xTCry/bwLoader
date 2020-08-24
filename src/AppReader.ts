import cheerio from 'cheerio';
import axios from 'axios';

export default class AppReader {
    public url: string;

    constructor(url: string) {
        this.url = url;
    }

    async start() {
        let { data: html } = await AppReader.getPage(this.url);

        let data = AppReader.getResources(html);
        let { objJS, getJS, objCSS, getCSS, staticName } = AppReader.parseResources(data);

        return {
            main: data,
            static: {
                js: {
                    ...objJS,
                    ...getJS,
                },
                css: {
                    ...objCSS,
                    ...getCSS,
                },
            },
            staticName,
        };
    }

    static parseResources(data) {
        // Get chunks
        let fdata: string = data.js
            .filter((e) => e.hasOwnProperty('data'))
            .map((e: { data: string }) => e.data)
            .filter((e) => e.includes('window.webpackJsonp') || (e.includes('webpackJsonp') && e.includes('chunk')))[0];

        // Поиск чанков (loadable)
        const getCSSdata =
            fdata && fdata.match(/("static\/css\/"\+\({}\[(.*)\]\|\|(.*)\)\+"\."\+{)(.*)(}\[(.*)\]\+"\.chunk\.css")/i);
        const getCSS = getCSSdata && getCSSdata.length > 0 ? AppReader.extactStrToObject(getCSSdata[4], '.chunk') : {};

        const getJSdata =
            fdata && fdata.match(/("static\/js\/"\+\({}\[(.*)\]\|\|(.*)\)\+"\."\+{)(.*)(}\[(.*)\]\+"\.chunk\.js")/i);
        const getJS = getJSdata && getJSdata.length > 0 ? AppReader.extactStrToObject(getJSdata[4], '.chunk') : {};

        const regexTemplate = (type) =>
            new RegExp(
                `(\\.\\/)?(static)?(\\/${type}\\/)?([A-b0-9\\-]+)[\\.-]([A-b0-9\\-]+)(\\.chunk)?\\.${type}`,
                'i'
            );

        const regexJS = regexTemplate('js');
        const regexCSS = regexTemplate('css');

        let staticName = '';
        const getMatch = (data, regex) => {
            let [_all, _2, _3, ss, _4, _5, _6] = data.match(regex);
            staticName = _3 || staticName;
            return [_4, _5 + (_6 || ''), ss];
        };

        // Get chunks
        let strJS = data.js
            .filter((e) => e.hasOwnProperty('src') && staticName)
            .filter((e: { src: string }) => !e.src.includes('://'))
            .map((e: { src: string }) => getMatch(e.src, regexJS))
            .filter((e) => !e[2] || staticName)
            .map((q) => '"' + q[0] + '":"' + q[1] + '"')
            .join(',');

        let strCSS = data.css
            .filter((e) => e.hasOwnProperty('href') && regexCSS.test(e.href))
            .filter((e) => e.href && !e.href.includes('://'))
            .map((e) => getMatch(e.href, regexCSS))
            .filter((e) => !e[2] || staticName)
            .map((q) => '"' + q[0] + '":"' + q[1] + '"')
            .join(',');

        if (!strJS) {
            strJS = data.js
                .filter((e: { src: string }) => e.hasOwnProperty('src') && regexJS.test(e.src))
                .map((e: { src: string }) => getMatch(e.src, regexJS))
                .filter((e) => e[2])
                .map((q) => '"' + q[0] + '":"' + q[1] + '"')
                .join(',');
        }

        if (!strCSS) {
            strCSS = data.css
                .filter((e) => e.hasOwnProperty('href') && regexCSS.test(e.href))
                .map((e) => getMatch(e.href, regexCSS))
                .filter((e) => e[2])
                .map((q) => '"' + q[0] + '":"' + q[1] + '"')
                .join(',');
        }

        let objJS = JSON.parse('{' + strJS + '}');
        let objCSS = JSON.parse('{' + strCSS + '}');

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
                timeout: 3e3,
            });
        } catch (error) {
            console.error(error);
        }
        return response;
    }

    static getResources(data): { js: Array<{ src: string } | { data: string }>; css: Array<{ href: string }> } {
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

    static extactStrToObject(data: string, additionalPostfix?: string): object {
        let z = {};
        let elems = data.split(',');
        for (const el of elems) {
            let q = el.split(':');
            z = {
                ...z,
                [q[0]]: q[1].replace(/['"]+/g, '') + (additionalPostfix || ''),
            };
        }
        return z;
    }
}

export const getMe = async (url) => {
    const reader = new AppReader(url);
    return await reader.start();
};
