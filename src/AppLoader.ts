import Fs from 'fs-extra';
import Path from 'path';
import Axios, { AxiosResponse } from 'axios';

import { js as beautifyJS, css as beautifyCSS } from 'js-beautify';
import jsnice from 'jsnice';

import ora from 'ora';
import gradient from 'gradient-string';
import { sleep, combineURLs } from './tools';
import WebPackExecuter from './WebPackExecuter';

const spinnerFile = ora(),
    spinnerBeautify = ora({
        spinner: 'moon',
    });

export interface IDownloadProcessResult {
    downloadedCount: number;
    skippedCount: number;
    count: number;
    filesList: string[];
    ripFiles: { fileName: string; url: string }[];
}

export default class AppLoader {
    public sURL: string;
    public resourcePath: string;
    public rootPath: string;
    public headers: any;
    public delimChar: string | undefined;

    public lastCookie: string;

    /**
     * Init class AppLoader
     * @param sURL Site URL
     * @param resourcePath path to site resources
     * @param rootPath Download folder path
     */
    constructor(sURL: string, resourcePath: string, rootPath: string, headers: any, delimChar?: string) {
        this.sURL = sURL;
        this.resourcePath = resourcePath;
        this.rootPath = rootPath;
        this.headers = headers;
        this.delimChar = delimChar;
    }

    public async init() {
        await Fs.ensureDir(Path.join(this.rootPath, this.resourcePath));
    }

    /**
     * Downlaod file
     * @param url download URL
     * @param filePath Download file path
     * @param rootPath Root path
     * @param cbIgnore Ignore content file
     * @param cbReplacer Replacer callback
     * @param attempts Count attempts download file
     * @param headers Request headers object
     */
    public async downloadFile({
        url,
        filePath,
        rootPath,
        cbIgnore,
        cbReplacer,
        attempts,
        headers,
    }: {
        url: string;
        filePath: string;
        rootPath?: string;
        cbIgnore?: Function;
        cbReplacer?: Function | boolean;
        attempts?: number;
        headers?: any;
    }) {
        attempts = attempts || 1;
        rootPath = rootPath || this.rootPath;
        const path = Path.resolve(Path.join(rootPath, filePath));

        url = encodeURI(url);

        let response: AxiosResponse;
        let attemptsCount = attempts;
        try {
            do {
                try {
                    response = await Axios({
                        url,
                        method: 'GET',
                        responseType: 'stream',
                        maxRedirects: 10,
                        timeout: 10e3,
                        headers: {
                            ...(true && { referer: combineURLs(this.sURL, 'worker.js') }),
                            ...this.headers,
                            ...(this.lastCookie && { cookie: this.lastCookie }),
                            'User-Agent':
                                'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36',
                            ...(headers || {}),
                        },
                    });
                    attemptsCount = 0;
                } catch (err) {
                    --attemptsCount;
                    if (attemptsCount === 0 || err.response?.status === 404) {
                        throw err;
                    }
                }
                await sleep(500);
            } while (attemptsCount > 0);
        } catch (err) {
            // if (err) console.error(err);

            if (err.response?.status === 404) {
                // console.log('Not found');
            }
            return Promise.reject(err.response);
        }

        const writer = Fs.createWriteStream(path);
        response.data.pipe(writer);
        this.lastCookie = response.headers?.cookie;

        return new Promise<void>((resolve, reject) => {
            writer.on('finish', async () => {
                if (cbIgnore || cbReplacer) {
                    const data = (await Fs.readFile(path)).toString();
                    if (cbIgnore && cbIgnore(data)) {
                        Fs.remove(path);
                        return reject(new Error('Skip file'));
                    }

                    if (cbReplacer) {
                        /* if (cbReplacer === true) {
                            // cbReplacer = (xff) => xff.replace(/"((.*?)(\n)(.*?)(\n?))"/igs, (a,b,c) => (a.split('\n').join('\\n')));
                            // cbReplacer = (xff) => xff.replace(/([^\/']["])((.*?)(\n?))([^\/']["])/igs, (a,b) => (a.split('\n').join('\\n')));
                            // cbReplacer = (xff) => xff.replace(/[\s\t]+(["]((.*?)(\n?))["])/igs, (a) => (a.split('\n').join('\\n')));
                            cbReplacer = (xff) =>
                                xff.replace(
                                    /(exports="\\t\\n\\v\\f\\r)(.*?)(:?\\u2028\\u2029\\ufeff)"/gi,
                                    '$1__SAFE_ME__$3'
                                );
                        }

                        const newData = cbReplacer(data);
                        if (newData != data) {
                            await Fs.writeFile(path, newData);
                        } */
                    }
                }
                resolve();
            });
            writer.on('error', reject);
        });
    }

    /**
     * Process download chunk files
     * @param files Files array
     * @param subPathForExistFiles Path
     * @param filesType Name type file in console
     * @param skipExistFiles Skip the file if it exists
     *
     * @returns {object}
     */
    async DownloadFilesProcess({
        files,
        subPathForExistFiles,
        filesTitle,
        skipExistFiles,
    }: {
        files: string[];
        subPathForExistFiles: string;
        filesTitle: string;
        skipExistFiles: boolean;
    }): Promise<IDownloadProcessResult> {
        skipExistFiles = skipExistFiles ?? true;
        console.log(`Download ${filesTitle} files...`);
        spinnerFile.start('Download file...');

        const filesCount = files.length;
        const existFiles = await Fs.readdir(Path.resolve(this.rootPath, subPathForExistFiles));

        await sleep(4);

        let downloadedCount = 0;
        let skippedCount = 0;
        let filesList = [];
        let ripFiles: { fileName: string; url: string }[] = [];

        let i = 0;
        for (const filePath of files) {
            const fileName = Path.basename(filePath);
            if (skipExistFiles && existFiles.includes(fileName)) {
                skippedCount++;
                i++;
                continue;
            }

            let msg = `Download ${filesTitle}=> [${gradient.pastel(filePath)}]`;
            {
                spinnerFile.text = msg;
                spinnerFile.prefixText = gradient.vice(
                    `[ ${((((i * 100) / filesCount) | 0) + 1).toString().padStart(3, '0')}% ]`,
                );
            }

            let url = combineURLs(this.sURL, filePath.replace(/^\/|\/$/g, ''));
            try {
                await this.downloadFile({
                    url,
                    filePath,
                    // rootPath: this.rootPath,
                    attempts: 2,
                });
                downloadedCount++;
                filesList.push(filePath);
                spinnerFile.color = 'green';
            } catch (e) {
                // console.error('donwload err', e);
                // if (e && e.status == 404) {
                ripFiles.push({ url, fileName });
                // } else if(e) console.error(e)
                spinnerFile.color = 'red';
            }

            i++;
        }

        spinnerFile.prefixText = gradient.vice('[ 100% ]');
        spinnerFile.succeed(`Downloaded ${downloadedCount} ${filesTitle} files`);

        return {
            downloadedCount,
            skippedCount,
            count: downloadedCount + skippedCount,
            filesList,
            ripFiles,
        };
    }

    /**
     * Process download chunk files
     * @param files List objects
     * @param folderType Download folder and lower case name type download files
     * @param filesTitle Name type file in console
     * @param skipExistFiles Download even if exist
     * @param isMap Is now download *.map files
     * @param cbIgnore Ignore content file
     * @param cbReplacer Replacer callback
     *
     * @returns {object}
     */
    public async DownloadChunkProcess({
        files,
        subPathForExistFiles,
        filesTitle,
        skipExistFiles,
        isMap,
        cbIgnore,
        cbReplacer,
    }: {
        files: string[];
        subPathForExistFiles: string;
        filesTitle: string;
        skipExistFiles?: boolean;
        isMap?: boolean;
        cbIgnore?: Function;
        cbReplacer?: Function | boolean;
    }): Promise<IDownloadProcessResult> {
        skipExistFiles = skipExistFiles ?? true;
        isMap = isMap ?? false;
        console.log(`Download ${filesTitle} files...`);

        spinnerFile.start('Download file...');

        const filesCount = files.length;
        const existFiles = await Fs.readdir(Path.resolve(this.rootPath, subPathForExistFiles));

        // for fast test
        // spinnerFile.stop();
        // return {
        //     downloadedCount: existFiles.length,
        //     count: existFiles.length,
        //     skippedCount: 0,
        //     filesList: existFiles.map((f) => Path.join('./', subPathForExistFiles, f)),
        //     ripFiles: [],
        // };

        await sleep(3);

        let downloadedCount = 0;
        let skippedCount = 0;
        let filesList = [];
        let ripFiles: { fileName: string; url: string }[] = [];
        let blockFiles: string[] = [];

        let i = 0;
        for (const filePath1 of files) {
            const filePathOrig = `${filePath1}${isMap ? '.map' : ''}`;
            const fileName = Path.basename(filePathOrig);

            const extension = Path.extname(filePath1).slice(1);

            let filePath = filePathOrig;
            if (!filePathOrig.includes(`${extension}/`)) {
                let paths = filePathOrig.split('/');
                //`${`${extension}/`}${filePathOrig}`;
                const file = paths.pop();
                filePath = [...paths, extension, file].join('/');
            }

            if (!skipExistFiles && (existFiles.includes(fileName) || blockFiles.includes(filePath))) {
                skippedCount++;
                i++;
                continue;
            }

            let msg = `Download ${filesTitle}=> [${gradient.pastel(fileName)}]`;

            {
                spinnerFile.text = msg;
                spinnerFile.prefixText = gradient.vice(
                    `[ ${((((i * 100) / filesCount) | 0) + 1).toString().padStart(3, '0')}% ]`,
                );
            }

            let url = combineURLs(this.sURL, filePathOrig);
            try {
                await this.downloadFile({
                    url,
                    filePath,
                    cbIgnore,
                    cbReplacer,
                    attempts: isMap ? 1 : 2,
                });

                // Test correct MAP file
                if (isMap) {
                    const pf = Path.resolve(Path.join(this.rootPath, filePath));
                    try {
                        JSON.parse((await Fs.readFile(pf)).toString());
                    } catch (error) {
                        await Fs.remove(pf);
                        throw new Error('Skip file');
                    }
                }

                downloadedCount++;
                filesList.push(filePath);
                spinnerFile.color = 'green';
            } catch (error) {
                !isMap &&
                    console.log(
                        '\nDownloadError',
                        error?.statusText ? `${error.statusText} (file: ${fileName})` : error,
                    );
                if (!error || [403, 404, 500].includes(error.status)) {
                    blockFiles.push(filePath);
                    spinnerFile.color = 'red';
                } else if (error.message === 'Skip file') {
                    i++;
                    spinnerFile.color = 'yellow';
                    continue;
                } else console.error(error);
                ripFiles.push({ url, fileName });
            }
            i++;
        }

        spinnerFile.prefixText = gradient.vice('[ 100% ]');
        spinnerFile.succeed(`Downloaded ${downloadedCount} ${filesTitle} files`);

        return {
            downloadedCount,
            skippedCount,
            count: downloadedCount + skippedCount,
            filesList,
            ripFiles,
        };
    }

    /**
     * Process beautify all files
     * @param folderType Download folder and  name type files [js/css]
     * @param filesTitle Name type file in console
     * @param files Files list
     */
    public async BeautifyAllFilesProcess({
        folderType,
        filesTitle,
        files,
    }: {
        folderType: 'js' | 'css';
        filesTitle: string;
        files: string[];
    }) {
        console.log(`Beautifly ${filesTitle} files...`);

        spinnerBeautify.start('Load file..');

        let filesCount = files.length;
        let i = 0;
        for (const filePath of files) {
            const fileName = Path.basename(filePath);
            const fileFullPath = Path.resolve(Path.join(this.rootPath, filePath));

            const contentFile = (await Fs.readFile(fileFullPath)).toString();

            {
                let msg = `Beautify ${filesTitle} ${gradient.pastel(fileName)}`;

                spinnerBeautify.color = 'green';
                spinnerBeautify.text = msg;
                spinnerBeautify.prefixText = gradient.vice(
                    `[ ${((((i * 100) / filesCount) | 0) + 1).toString().padStart(3, '0')}% ]`,
                );
            }

            let beautifiedContent = (folderType.toLowerCase() == 'css' ? beautifyCSS : beautifyJS)(contentFile, {
                indent_with_tabs: true,
                space_in_empty_paren: true,
                // Unsafe !
                // unescape_strings: true,
            });

            beautifiedContent = AppLoader.SafeUnescapeStrings(beautifiedContent);

            await Fs.writeFile(fileFullPath, beautifiedContent);
            i++;
        }
        spinnerBeautify.succeed(`All ${filesCount} files beautify`);
    }

    public static SafeUnescapeStrings(data: string) {
        const regexp = /\\u([\d\w]{4})/gi;
        const check = (code, e) =>
            (code > 1e3 &&
                code < 3e3 &&
                // ((code > 1e3 && code < 3e3) || (code > 7e3 && code < 65536)) &&
                ![
                    '\xa0',
                    '\u1680',
                    '\u180e',
                    '\u2000',
                    '\u2001',
                    '\u2002',
                    '\u2003',
                    '\u2004',
                    '\u2005',
                    '\u2006',
                    '\u2007',
                    '\u2008',
                    '\u2009',
                    '\u200a',
                    '\u202f',
                    '\u205f',
                    '\u3000',
                    '\u2028',
                    '\u2029',
                    '\ufeff',
                    '\u05FF',
                    '\u0700',
                ].includes(e)) ||
            ['\u2011', '\u2013', '\u2014', '\xab', '\xbb'].includes(e);

        data = unescape(
            data.replace(regexp, (match, e) => {
                let code = parseInt(e, 16);
                return check(code, e) ? String.fromCharCode(code) : match;
            }),
        );

        // fix %2F
        data = data.replace(/\(\/\/\/(.)/, '(/\\//$1');

        return data;
    }

    /**
     * Process beautify all files
     * @param folder_type Download folder and  name type files [js/css]
     * @param filesTitle Name type file in console
     * @param files Number of files or files list
     * @param filter Filter by path
     * @param split Split path
     */
    public async UnpackAllSource({
        files,
        filesTitle,
        filter,
        split,
    }: {
        files: string[];
        filesTitle: string;
        filter?: string;
        split?: string;
    }) {
        console.log(`Unpack ${filesTitle} files...`);

        spinnerBeautify.start('Try unpack file..');
        spinnerBeautify.prefixText = gradient.vice('[ 0% ]');

        const pathTo = Path.join(this.rootPath, '_safe/source/src/');

        let filesCount = files.length;
        let i = 0;
        for (const filePath of files) {
            const fileName = Path.basename(filePath);
            const fileFullPath = Path.resolve(Path.join(this.rootPath, filePath));

            {
                let msg = `Unpack ${filesTitle} ${gradient.pastel(fileName)}`;

                spinnerBeautify.color = 'green';
                spinnerBeautify.text = msg;
                spinnerBeautify.prefixText = gradient.vice(
                    `[ ${((((i * 100) / filesCount) | 0) + 1).toString().padStart(3, '0')}% ]`,
                );
            }

            await this.UnpackSource(fileFullPath, pathTo, filter, split);
            i++;
        }

        spinnerBeautify.prefixText = gradient.vice('[ 100% ]');
        spinnerBeautify.succeed(`All ${files.length} files unpacked`);
    }

    /**
     * Unpack source map file
     * @param filePath Path to *.map
     * @param output Folder name
     * @param filter Filter by path
     * @param split Split path
     */
    public async UnpackSource(filePath: string, output: string, filter?: string, split?: string) {
        await Fs.ensureDir(output);

        try {
            const sourceData = JSON.parse((await Fs.readFile(filePath)).toString()) as {
                version: number;
                file: string;
                mappings: string;
                sourceRoot: string;
                names: string[];
                sources: string[];
                sourcesContent: string[];
            };

            const files = sourceData.sources
                .map((path, id) => ({
                    path,
                    id,
                }))
                .filter(({ path }) => (filter ? path?.includes(filter) : true))
                .map(({ path, id }) => {
                    if (split) {
                        let p1 = path.split(split);
                        if (p1.length > 1) path = p1[1];
                    }

                    let p2 = path.split('webpack:');
                    if (p2.length > 1) path = p2[1];

                    path = path
                        .replace(/:/g, '_')
                        .replace(/((\.[A-z0-9]+)\?([A-z0-9]+))/i, '__$3$2') // Fix (`/About.vue?6dba`  to  `/About__6dba.vue`)
                        // .replace(/([A-z]{4,}\s?)([\/\^\.\*\$]+)/ig, "$1__")
                        .replace(/(lazy|locale) ([\/\^\.\*\$\\]+)/gi, '$1__')
                        .replace(/((\.\.\/){2}|(\.\.\\){2})/g, './');

                    //  lazy /^/.//locales.*$/ groupOptions: {} namespace object
                    if (/([\^\*\$\{\}])/i.test(path)) {
                        path = path.replace(/([^a-z0-9/\s]([\/]+)?)(\/\/)?/gi, '').replace(/\s/gi, '_');
                    }

                    // if (path[0] == '/' || path[0] == '\\') {
                    //     path = path.replace(/^(\/|\\)/, './');
                    // }

                    if (sourceData.sourcesContent && sourceData.sourcesContent[id]) {
                        return Fs.outputFile(Path.resolve(Path.join(output, path)), sourceData.sourcesContent[id]);
                    }
                    return undefined;
                });

            await Promise.all(files);
        } catch (error) {
            console.error(`[Error] UnpackSource. (${filePath})`, error);
        }
    }

    /**
     */
    async ImportModulesAndGetExports(files: string[], nameWPJ: string = 'webpackJsonp', safeCount?: number) {
        let exports: { id: any; exports: any }[] = [];
        let mediaFiles: string[] = [];

        try {
            const WPE = new WebPackExecuter({ nameWPJ });

            if (!files || files.length === 0) {
                const contentPath = Path.resolve(this.rootPath, this.resourcePath, 'js');
                files = (await Fs.readdir(contentPath)).map((f) => Path.resolve(this.resourcePath, 'js', f));
                // Like, if there are many files, then make a limit
                if (safeCount) files = files.slice(0, safeCount);
            }

            for (const filePath of files) {
                try {
                    const fileContent = await WPE.Include(Path.resolve(Path.join(this.rootPath, filePath)));
                    mediaFiles.push(...this.parseMediaFromJs(fileContent));
                } catch (err) {
                    console.error(err);
                    console.log('[Error] WPE. Failed include ', filePath, err.message);
                }
            }

            try {
                exports = WPE.tryGetStaticFile();
            } catch (e) {}
        } catch (error) {
            console.error(error);
        }

        return { exports, mediaFiles };
    }

    parseMediaFromJs(content: string) {
        let res = [];
        const regExp = `\\.p\\s?\\+\\s?"(?<path>(\\/?static)?\\/media\\/([^"/]+))"`;
        let parse = content.match(new RegExp(regExp, 'g'));

        if (parse) {
            for (let r of parse) {
                let {
                    groups: { path },
                } = r.match(new RegExp(regExp));
                res.push(path);
            }
        }

        return res;
    }

    parseMediaFromCss(content: string) {
        let res = [];
        const regExp = `url ?\\('?"?(?<path>(\\/?static)?\\/media\\/([^"'/)]+))"?'?\\)`;
        let parse = content.match(new RegExp(regExp, 'g'));

        if (parse) {
            for (let r of parse) {
                let {
                    groups: { path },
                } = r.match(new RegExp(regExp));
                res.push(path);
            }
        }

        return res;
    }

    /**
     * Create ... cache for git
     * @param publicPath Out git path
     * @param renameInData Rename in code
     * @param jsNicer Use jsNice
     * @param jsNicer Use jsNice
     */
    public async CacheToGit(publicPath: string, renameInData: boolean = true, jsNicer: boolean = false) {
        const staticFolders = ['js', 'css', 'media'];
        const outPaths = staticFolders.map((el) => Path.resolve(publicPath, this.resourcePath, el));

        // Cleaning
        const existPublicFiles = await Fs.readdir(publicPath);
        for (const fileName of existPublicFiles) {
            if (!fileName.startsWith('.git') && fileName !== 'unpack') {
                await Fs.remove(Path.resolve(publicPath, fileName));
            }
        }

        console.log('Copy to git dir\n * Scan all files...');
        await sleep(2);

        // [ js files, css files, media files ]
        const filesLists = await Promise.all(
            staticFolders.map((el) => Fs.readdir(Path.resolve(this.rootPath, this.resourcePath, el))),
        );

        const renamedFilesHistory: Record<string, string> = {};
        const newPathsFiles: string[] = [];

        // Renaming files
        for (let k = 0; k < staticFolders.length; k++) {
            const folder_type = staticFolders[k];
            const filesList = filesLists[k];
            const outPath = outPaths[k];
            const numberFiles = filesList.length;
            let i = 0;

            spinnerBeautify.start(`Renaming [${folder_type.toUpperCase()}] files...`);
            spinnerBeautify.prefixText = gradient.vice('[ 0% ]');

            for (const _file of filesList) {
                const filePath = Path.resolve(this.rootPath, this.resourcePath, folder_type, _file);

                const { oldHash, newName } = this.ChooseName(_file, renamedFilesHistory);
                renamedFilesHistory[_file] = newName;
                const newFilePath = Path.resolve(outPath, newName);

                {
                    let msg = `Rename ${gradient.pastel(_file)} to => ${gradient.vice(newName)}`;

                    spinnerBeautify.color = 'green';
                    spinnerBeautify.text = msg;
                    spinnerBeautify.prefixText = gradient.vice(
                        `[ ${((((i * 100) / numberFiles) | 0) + 1).toString().padStart(3, '0')}% ]`,
                    );
                }

                await Fs.copy(filePath, newFilePath);
                i++;

                if (k < 2) {
                    newPathsFiles.push(newFilePath);
                    await Fs.appendFile(newFilePath, `\n/* ${oldHash} */`);
                }
            }

            spinnerBeautify.prefixText = gradient.vice('[ 100% ]');
            spinnerBeautify.succeed(`All ${numberFiles} [${folder_type.toUpperCase()}] files renamed`);
        }

        await sleep(1);
        // ...

        if (renameInData) {
            const indexFile = 'index.html';
            if (Fs.existsSync(Path.resolve(this.rootPath, indexFile))) {
                // Renaming data in files
                spinnerBeautify.start(`Renaming in ${indexFile} file...`);
                spinnerBeautify.prefixText = '';
                try {
                    let data = (await Fs.readFile(Path.resolve(this.rootPath, indexFile))).toString();

                    for (const key in renamedFilesHistory) {
                        if (Object.prototype.hasOwnProperty.call(renamedFilesHistory, key)) {
                            const val = renamedFilesHistory[key];
                            data = data.replace(new RegExp(key, 'g'), val);
                        }
                    }

                    await Fs.writeFile(Path.resolve(publicPath, indexFile), data);
                } catch (e) {
                    console.error(e);
                }
            }

            const numberFiles = newPathsFiles.length;
            let i = 0;

            spinnerBeautify.start('Renaming in data files...');
            spinnerBeautify.prefixText = gradient.vice('[ 0% ]');

            for (const _filePath of newPathsFiles) {
                {
                    let msg = `Rename in => ${gradient.vice(_filePath)}`;

                    spinnerBeautify.color = 'green';
                    spinnerBeautify.text = msg;
                    spinnerBeautify.prefixText = gradient.vice(
                        `[ ${((((i * 100) / numberFiles) | 0) + 1).toString().padStart(3, '0')}% ]`,
                    );
                }

                let data = (await Fs.readFile(_filePath)).toString();

                for (const key in renamedFilesHistory) {
                    if (Object.prototype.hasOwnProperty.call(renamedFilesHistory, key)) {
                        const val = renamedFilesHistory[key];
                        data = data.replace(new RegExp(key, 'g'), val);
                    }
                }

                if (jsNicer) {
                    try {
                        data = await AppLoader.jsNicer(data);
                    } catch (e) {
                        console.error(e);
                    }
                }

                await Fs.writeFile(_filePath, data);
                i++;
            }

            spinnerBeautify.prefixText = gradient.vice('[ 100% ]');
            spinnerBeautify.succeed(`All data in ${1 + numberFiles} files renamed`);
        }

        return true;
    }

    public async CopyFolderToGit(sourcePath: string, destPath: string) {
        const issetPath = Fs.existsSync(sourcePath);
        const issetDestPath = Fs.existsSync(destPath);

        if (issetDestPath) {
            await Fs.remove(destPath);
        }

        if (issetPath) {
            await Fs.copy(sourcePath, destPath);
        }

        return issetDestPath || issetPath;
    }

    /**
     * Smart jsNicer
     * @param data JS Code
     * @param options Options
     */
    public static jsNicer(
        data: string,
        options: { pretty: boolean; types: boolean; rename: boolean; suggest: boolean } = {
            pretty: true,
            types: false,
            rename: true,
            suggest: false,
        },
    ) {
        options = { pretty: true, types: false, rename: true, suggest: false, ...options };

        return new Promise<string>((resolve, reject) => {
            jsnice.nicify(data, options, (err, data) => {
                if (err) {
                    return reject(err);
                }
                resolve(data);
            });
        });
    }

    public ChooseName(original: string, history: Record<string, string>, i: number = 0) {
        // TODO: add analyze delim (example from: 'react-redux-Cd4-7rZy.js') by small chars and not

        const delimChar = this.delimChar || '.';
        const parts = original.split(delimChar);
        const hashIndex = delimChar === '.' ? parts.length - 2 : parts.length - 1;
        const oldHash = parts[hashIndex];
        parts[hashIndex] = String(i);
        if (delimChar !== '.') {
            const old = oldHash.split('.');
            parts[hashIndex] += '.' + old[old.length - 1];
        }
        let newName = parts.join(delimChar || '.');

        if (history.hasOwnProperty(newName)) {
            newName = this.ChooseName(original, history, ++i).newName;
        }
        return { newName, oldHash };
    }
}
