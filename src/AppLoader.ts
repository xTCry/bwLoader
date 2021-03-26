import Fs from 'fs-extra';
import Path from 'path';
import Axios from 'axios';

import { js as beautifyJS, css as beautifyCSS } from 'js-beautify';
import jsnice from 'jsnice';

import ora from 'ora';
import gradient from 'gradient-string';
import { sleep } from './tools';
import WebPackExecuter from './WebPackExecuter';

const spinnerFile = ora(),
    spinnerBeautify = ora({
        spinner: 'moon',
    });

export default class AppLoader {
    public sURL: string;
    public resourcePath: string;
    public rootPath: string;

    /**
     * Init class AppLoader
     * @param sURL Site URL
     * @param resourcePath path to site resources
     * @param rootPath Download folder path
     */
    constructor(sURL: string, resourcePath: string, rootPath: string) {
        this.sURL = sURL;
        this.resourcePath = resourcePath;
        this.rootPath = rootPath;
    }

    public async init() {
        await Fs.mkdirp(this.rootPath + this.resourcePath);
    }

    /**
     * Downlaod file
     * @param url download URL
     * @param fileName file name
     * @param _Path Download folder path
     * @param cbIgnore Ignore content file
     * @param cbReplacer Replacer callback
     */
    public async downloadFile(
        url: string,
        fileName: string,
        _Path: string = this.rootPath + this.resourcePath,
        cbIgnore: Function = undefined,
        cbReplacer: Function | boolean = undefined
    ) {
        const path = Path.resolve(_Path, fileName);

        let response;
        try {
            response = await Axios({
                url,
                method: 'GET',
                responseType: 'stream',
            });
        } catch (error) {
            // if (error) console.error(error);

            if (error.response && error.response.status === 404) {
                // console.log('Not found');
            }
            return Promise.reject(error.response);
        }

        const writer = Fs.createWriteStream(path);
        response.data.pipe(writer);

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
     * @param list List objects
     * @param path Path
     * @param nameT Name type file in console
     * @param force Download even if exist
     *
     * @returns {object}
     */
    async DownloadFilesProcess(list: string[], path: string, nameT: string, force: boolean = false) {
        console.log('Download ' + nameT + ' files...');
        spinnerFile.start('Download file...');

        const numberOfFiles = list.length;
        const existFiles = await Fs.readdir(this.rootPath + path);

        await sleep(4);

        let downloadedCount = 0,
            skippedCount = 0,
            ripCount = 0,
            filesList = [],
            ripFiles = [],
            i = 0;

        for (const fileName of list) {
            if (!force && existFiles.includes(fileName)) {
                skippedCount++;
                i++;
                continue;
            }

            let msg = `Download ${nameT}=> [${gradient.pastel(fileName)}]`;
            {
                spinnerFile.text = msg;
                spinnerFile.prefixText = gradient.vice(
                    '[ ' + ((((i * 100) / numberOfFiles) | 0) + 1).toString().padStart(3, '0') + '% ]'
                );
            }

            try {
                await this.downloadFile(this.sURL + '/' + path + '/' + fileName, path + '/' + fileName, this.rootPath);
                downloadedCount++;
                filesList.push(fileName);
                spinnerFile.color = 'green';
            } catch (e) {
                // if (e && e.status == 404) {
                ripCount++;
                ripFiles.push([this.sURL + '/' + path + '/' + fileName, fileName]);
                // } else if(e) console.error(e)
                spinnerFile.color = 'red';
            }

            i++;
        }

        spinnerFile.prefixText = gradient.vice('[ 100% ]');
        spinnerFile.succeed(`Downloaded ${downloadedCount} ${nameT} files`);

        return {
            downloadedCount,
            skippedCount,
            count: downloadedCount + skippedCount,
            filesList,
            ripCount,
            ripFiles,
        };
    }

    /**
     * Process download chunk files
     * @param list List objects
     * @param folder_type Download folder and lower case name type download files
     * @param nameT Name type file in console
     * @param force Download even if exist
     * @param isMap Is now download *.map files
     * @param cbIgnore Ignore content file
     * @param cbReplacer Replacer callback
     *
     * @returns {object}
     */
    public async DownloadChunkProcess(
        list: { [key: number]: string },
        folder_type: string,
        nameT: string,
        force: boolean = false,
        isMap: boolean = false,
        cbIgnore: Function = undefined,
        cbReplacer: Function | boolean = undefined
    ) {
        console.log('Download ' + nameT + ' files...');

        spinnerFile.start('Download file...');

        const numberOfFiles = Object.keys(list).length;

        const existFiles = await Fs.readdir(this.rootPath + this.resourcePath + folder_type + '/');

        await sleep(3);

        let downloadedCount = 0;
        let skippedCount = 0;
        let ripCount = 0;
        let filesList = [];
        let ripFiles = [];
        let blockFiles: string[] = [];

        let i = 0;
        for (const fileName of Object.values(list)) {
            const fullFileName = fileName + '.' + folder_type + (isMap ? '.map' : '');

            if (!force && (existFiles.includes(fullFileName) || blockFiles.includes(fullFileName))) {
                skippedCount++;
                i++;
                continue;
            }

            let msg = 'Download ' + nameT + '=> [' + gradient.pastel(fullFileName) + ']';

            {
                spinnerFile.text = msg;
                spinnerFile.prefixText = gradient.vice(
                    '[ ' + ((((i * 100) / numberOfFiles) | 0) + 1).toString().padStart(3, '0') + '% ]'
                );
            }

            const shortFilePath = folder_type + '/' + fullFileName;
            try {
                try {
                    await this.downloadFile(
                        this.sURL + '/' + this.resourcePath + shortFilePath,
                        shortFilePath,
                        void 0,
                        cbIgnore,
                        cbReplacer
                    );
                } catch (error) {
                    if (error && error.status === 404) {
                        await this.downloadFile(
                            this.sURL + '/' + this.resourcePath + fullFileName,
                            shortFilePath,
                            void 0,
                            cbIgnore,
                            cbReplacer
                        );
                    } else {
                        throw error;
                    }
                }

                // Test correct MAP file
                if (isMap) {
                    const pf = Path.resolve(this.rootPath + this.resourcePath, shortFilePath);
                    try {
                        JSON.parse((await Fs.readFile(pf)).toString());
                    } catch (error) {
                        await Fs.remove(pf);
                        throw new Error('Skip file');
                    }
                }

                downloadedCount++;
                filesList.push(fullFileName);
                spinnerFile.color = 'green';
            } catch (error) {
                if (!error || [403, 404].includes(error.status)) {
                    blockFiles.push(fullFileName);
                    spinnerFile.color = 'red';
                } else if (error.message === 'Skip file') {
                    i++;
                    spinnerFile.color = 'yellow';
                    continue;
                } else console.error(error);

                ripCount++;
                ripFiles.push(fullFileName);
            }
            i++;
        }

        spinnerFile.succeed('Downloaded ' + downloadedCount + ' ' + nameT + ' files');

        return {
            downloadedCount,
            skippedCount,
            count: downloadedCount + skippedCount,
            filesList,
            ripCount,
            ripFiles,
        };
    }

    /**
     * Process beautify all files
     * @param folder_type Download folder and  name type files [js/css]
     * @param nameT Name type file in console
     * @param files Number of files or files list
     */
    public async BeautifyAllFilesProcess(folder_type: string, nameT: string, files: number | string[]) {
        console.log('Beautifly ' + nameT + ' files...');

        spinnerBeautify.start('Load file..');

        let i = 0;
        let filesList = await Fs.readdir(this.rootPath + this.resourcePath + folder_type + '/');

        if (Array.isArray(files)) filesList = filesList.filter((e) => files.includes(e));

        const numberFiles = (Array.isArray(files) && files.length) || filesList.length;

        for (const _file of filesList) {
            const file = this.rootPath + this.resourcePath + folder_type + '/' + _file;
            const beautifyCodeResult = (await Fs.readFile(file)).toString();

            {
                let msg = 'Beautify ' + nameT + ' ' + gradient.pastel(_file);

                spinnerBeautify.color = 'green';
                spinnerBeautify.text = msg;
                spinnerBeautify.prefixText = gradient.vice(
                    '[ ' + ((((i * 100) / numberFiles) | 0) + 1).toString().padStart(3, '0') + '% ]'
                );
            }

            let data = (folder_type.toLowerCase() == 'css' ? beautifyCSS : beautifyJS)(beautifyCodeResult, {
                indent_with_tabs: true,
                space_in_empty_paren: true,
                // Unsafe !
                // unescape_strings: true,
            });

            data = AppLoader.SafeUnescapeStrings(data);

            await Fs.writeFile(file, data);
            i++;
        }
        spinnerBeautify.succeed('All ' + filesList.length + ' files beautify');
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
            })
        );
        return data;
    }

    /**
     * Process beautify all files
     * @param folder_type Download folder and  name type files [js/css]
     * @param nameT Name type file in console
     * @param files Number of files or files list
     * @param filter Filter by path
     * @param split Split path
     */
    public async UnpackAllSource(
        folder_type: string,
        nameT: string,
        files: number | string[],
        filter: string = undefined,
        split: string = undefined
    ) {
        console.log('Unpack ' + nameT + ' files...');

        spinnerBeautify.start('Try unpack file..');
        spinnerBeautify.prefixText = gradient.vice('[ 0% ]');

        let i = 0;
        let filesList = await Fs.readdir(this.rootPath + this.resourcePath + folder_type + '/');

        if (Array.isArray(files)) filesList = filesList.filter((e) => files.includes(e));

        const numberFiles = (Array.isArray(files) && files.length) || filesList.length;

        const pathTo = this.rootPath + '_safe/source/src/';

        for (const _file of filesList) {
            const file = this.rootPath + this.resourcePath + folder_type + '/' + _file;

            {
                let msg = 'Unpack ' + nameT + ' ' + gradient.pastel(_file);

                spinnerBeautify.color = 'green';
                spinnerBeautify.text = msg;
                spinnerBeautify.prefixText = gradient.vice(
                    '[ ' + ((((i * 100) / numberFiles) | 0) + 1).toString().padStart(3, '0') + '% ]'
                );
            }

            await this.UnpackSource(file, pathTo, filter, split);
            i++;
        }

        spinnerBeautify.prefixText = gradient.vice('[ 100% ]');
        spinnerBeautify.succeed('All ' + filesList.length + ' files unpacked');
    }

    /**
     * Unpack source map file
     * @param file Path to *.map
     * @param output Folder name
     * @param filter Filter by path
     * @param split Split path
     */
    public async UnpackSource(file: string, output: string, filter?: string, split?: string) {
        if (!Fs.existsSync(output)) {
            await Fs.mkdirp(output);
        }

        try {
            const sourceData = JSON.parse((await Fs.readFile(file)).toString());

            const files = sourceData.sources
                .map((path = false, id) => ({
                    path,
                    id,
                }))
                .filter(({ path }) => (filter ? path && path.includes(filter) : true))
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

                    if (path[0] == '/' || path[0] == '\\') {
                        path = path.replace(/^(\/|\\)/, './');
                    }

                    if (sourceData.sourcesContent && sourceData.sourcesContent[id]) {
                        return Fs.outputFile(Path.resolve(output, path), sourceData.sourcesContent[id]);
                    }
                    return undefined;
                });

            await Promise.all(files);
        } catch (error) {
            console.error(error);
            // throw error;
        }
    }

    /**
     */
    async ExportModulesFiles(filesList: string[], nameWPJ: string = 'webpackJsonp', safeCount?: number) {
        let res = [];

        try {
            const WPE = new WebPackExecuter({ nameWPJ });

            if (!filesList || filesList.length == 0) {
                filesList = await Fs.readdir(this.rootPath + this.resourcePath + 'js');
                // Like, if there are many files, then make a limit
                if (safeCount) filesList = filesList.slice(0, safeCount);
            }

            for (const _file of filesList) {
                try {
                    await WPE.Include(this.rootPath + this.resourcePath + 'js' + '/', _file);
                } catch (error) {
                    console.log('Failed include ', _file, error.message);
                }
            }

            try {
                res = WPE.tryGetStaticFile();
                res = res.filter(({ exports: e }) => typeof e === 'string' && !e.startsWith('data:image'));
            } catch (e) {}
        } catch (error) {
            console.error(error);
        }

        return res;
    }

    /**
     * Create ... cache for git
     * @param outGitPath Out git path
     * @param renameInData Rename in code
     * @param jsNicer Use jsNice
     * @param jsNicer Use jsNice
     */
    public async CacheToGit(outGitPath: string, renameInData: boolean = true, jsNicer: boolean = false) {
        const staticFolders = ['js', 'css', 'media'];
        const outPaths = staticFolders.map((el) => Path.resolve(outGitPath, this.resourcePath, el));

        // Cleaning
        const existOutFiles = await Fs.readdir(outGitPath);
        for (const fileName of existOutFiles) {
            if (!fileName.startsWith('.git') && fileName !== 'unpack') {
                await Fs.remove(Path.resolve(outGitPath, fileName));
            }
        }

        console.log('Copy to git dir\n * Scan all files...');
        await sleep(2);

        // [ js files, css files, media files ]
        const filesLists = await Promise.all(
            staticFolders.map((el) => Fs.readdir(Path.resolve(this.rootPath, this.resourcePath, el)))
        );

        const renamedFilesHistory = {};
        const newPathsFiles = [];

        // Renaming files
        for (let k = 0; k < staticFolders.length; k++) {
            const folder_type = staticFolders[k];
            const filesList = filesLists[k];
            const outPath = outPaths[k];
            const numberFiles = filesList.length;
            let i = 0;

            spinnerBeautify.start('Renaming [' + folder_type.toUpperCase() + '] files...');
            spinnerBeautify.prefixText = gradient.vice('[ 0% ]');

            for (const _file of filesList) {
                const filePath = Path.resolve(this.rootPath, this.resourcePath, folder_type, _file);

                const { oldCache, newName } = AppLoader.ChooseName(_file, renamedFilesHistory);
                renamedFilesHistory[_file] = newName;
                const newFilePath = Path.resolve(outPath, newName);

                {
                    let msg = 'Rename ' + gradient.pastel(_file) + ' to => ' + gradient.vice(newName);

                    spinnerBeautify.color = 'green';
                    spinnerBeautify.text = msg;
                    spinnerBeautify.prefixText = gradient.vice(
                        '[ ' + ((((i * 100) / numberFiles) | 0) + 1).toString().padStart(3, '0') + '% ]'
                    );
                }

                await Fs.copy(filePath, newFilePath);
                i++;

                if (k < 2) {
                    newPathsFiles.push(newFilePath);
                    await Fs.appendFile(newFilePath, '\n/* ' + oldCache + ' */');
                }
            }

            spinnerBeautify.prefixText = gradient.vice('[ 100% ]');
            spinnerBeautify.succeed('All ' + numberFiles + ' [' + folder_type.toUpperCase() + '] files renamed');
        }

        await sleep(1);
        // ...

        if (renameInData) {
            // Renaming data in files
            spinnerBeautify.start('Renaming in index.html file...');
            spinnerBeautify.prefixText = '';
            try {
                const file = 'index.html';
                let data = (await Fs.readFile(Path.resolve(this.rootPath, file))).toString();

                for (const key in renamedFilesHistory) {
                    if (Object.prototype.hasOwnProperty.call(renamedFilesHistory, key)) {
                        const val = renamedFilesHistory[key];
                        data = data.replace(new RegExp(key, 'g'), val);
                    }
                }

                await Fs.writeFile(Path.resolve(outGitPath, file), data);
            } catch (e) {
                console.error(e);
            }

            const numberFiles = newPathsFiles.length;
            let i = 0;

            spinnerBeautify.start('Renaming in data files...');
            spinnerBeautify.prefixText = gradient.vice('[ 0% ]');

            for (const _filePath of newPathsFiles) {
                {
                    let msg = 'Rename in => ' + gradient.vice(_filePath);

                    spinnerBeautify.color = 'green';
                    spinnerBeautify.text = msg;
                    spinnerBeautify.prefixText = gradient.vice(
                        '[ ' + ((((i * 100) / numberFiles) | 0) + 1).toString().padStart(3, '0') + '% ]'
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
            spinnerBeautify.succeed('All data in ' + (1 + numberFiles) + ' files renamed');
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
        }
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

    public static ChooseName(original: string, history: any, i: number = 0) {
        const parts = original.split('.');
        const oldCache = parts[1];
        parts[1] = i.toString();
        let newName = parts.join('.');

        if (history.hasOwnProperty(newName)) {
            newName = this.ChooseName(original, history, ++i).newName;
        }
        return { newName, oldCache };
    }
}
