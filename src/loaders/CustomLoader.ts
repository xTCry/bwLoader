import Path from 'path';
import Fs from 'fs-extra';
import { html as beautifyHTML } from 'js-beautify';

import { configSchema } from '../config';
import { ComName, xConfig, combineURLs } from '../tools';

import LoaderClass from './LoaderClass';
import { getMe } from '../AppReader';
import AppLoader, { IDownloadProcessResult } from '../AppLoader';
import ToGit from '../ToGit';
import Readline from '../readline';

const STEP_ASK = !true;

export default class CustomLoader extends LoaderClass {
    protected staticMaps: string[] = [];

    public async Start() {
        await this.Step_LoadApp();
        await this.Step_InitAppLoader();
        await this.Step_PrepareArea();
        const res = await this.Step_StartDownload();
        await this.Step_StartDownload_Media(res);
        await this.Step_ToGit();

        console.log('\n----\nFinish.');
    }

    protected async Step_LoadApp() {
        STEP_ASK && (await Readline.question(`[Step_LoadApp] Press [Enter] to continue...`));

        let opts: any = { url: this.url };
        if (this.useExistsIndexHtml) {
            opts = { html: await Fs.readFile(Path.resolve(this.rootPath, 'index.html')) };
        }
        opts.headers = this.headers;
        // Load site modules
        const appDataS = await getMe(opts);
        let {
            static: { js: staticJS, css: staticCSS },
            js,
            css,
            staticName,
            delimChar,
        } = appDataS.parsed;

        // console.log('dbg', appDataS.parsed);
        // if (!false) {
        //     process.exit(0);
        // }

        this.delimChar = delimChar;
        this.staticName = staticName;
        this.staticJS = staticJS;
        this.staticCSS = staticCSS;
        this.otherJS = js;
        this.otherCSS = css;

        if (this.resourcePath === true) {
            this.resourcePath = staticName || './';
        }
    }

    protected async Step_InitAppLoader() {
        STEP_ASK && (await Readline.question(`[Step_InitAppLoader] Press [Enter] to continue...`));

        let dURL = this.url;

        if (dURL.includes('index.html')) {
            dURL = dURL.slice(0, dURL.indexOf('index.html'));
            // const { hostname, protocol } = new URL(dURL);
            // dURL = `${protocol}//${hostname}`;
        }

        this.loader = new AppLoader(dURL, this.resourcePath as string, this.rootPath, this.headers, this.delimChar);
        await this.loader.init();
    }

    protected async Step_PrepareArea() {
        STEP_ASK && (await Readline.question(`[Step_PrepareArea] Press [Enter] to continue...`));

        // Cleaning
        const existOldFiles = await Fs.readdir(this.rootPath);
        for (const fileName of existOldFiles) {
            if (fileName == '.git') {
                continue;
            }
            if (this.useExistsIndexHtml && fileName == 'index.html') {
                continue;
            }
            await Fs.remove(this.rootPath + fileName);
        }

        // TODO: add check `this.useExistsIndexHtml`
        // // Clear cache if need...
        // if (this.clearCache) {
        //     console.log('Clear all files...');
        //     await Fs.remove(this.rootPath);
        // }

        // Create default resource folders
        for await (let el of ['js', 'css', 'media'].map((el) =>
            Path.resolve(this.rootPath, <string>this.resourcePath, el),
        )) {
            // console.log('el', el);
            await Fs.mkdirp(el);
        }
        // process.exit(0);
    }

    protected async Step_StartDownload() {
        STEP_ASK && (await Readline.question(`[Step_StartDownload] Press [Enter] to continue...`));

        if (this.useExistsIndexHtml !== true) {
            await this.Step_StartDownload_Index();
        }
        if (this.tryAssetManifest) {
            // asset-manifest.json
            await this.Step_StartDownload_AssetManifest();
        }

        const resJS = await this.Step_StartDownload_JS();
        const resCSS = await this.Step_StartDownload_CSS();
        // {
        //     downloadedCount: 0,
        //     skippedCount: 0,
        //     count: 0,
        //     filesList: [],
        //     ripFiles: [],
        // };

        return { resJS, resCSS };
    }

    protected async Step_StartDownload_Index() {
        STEP_ASK && (await Readline.question(`[Step_StartDownload_Index] Press [Enter] to continue...`));

        let dURL = this.url.includes('index.html') ? this.url.slice(0, this.url.indexOf('index.html')) : this.url;

        try {
            const file = 'index.html';
            await this.loader.downloadFile({
                url: combineURLs(dURL, file),
                filePath: file,
                rootPath: this.rootPath,
            });

            const path = Path.resolve(this.rootPath, file);
            const rData = await Fs.readFile(path);
            const data = beautifyHTML(rData.toString(), {
                indent_with_tabs: true,
                space_in_empty_paren: true,
            });
            await Fs.writeFile(path, data);
        } catch (e) {
            console.log('Failed to load index.html', e?.message || e);
            // console.error(e);
        }
    }

    protected async Step_StartDownload_AssetManifest() {
        STEP_ASK && (await Readline.question(`[Step_StartDownload_AssetManifest] Press [Enter] to continue...`));

        let dURL = this.url.includes('index.html') ? this.url.slice(0, this.url.indexOf('index.html')) : this.url;

        try {
            const file = 'asset-manifest.json';
            await this.loader.downloadFile({
                url: combineURLs(dURL, file),
                filePath: file,
                rootPath: this.rootPath,
            });

            const path = Path.resolve(this.rootPath, file);
            const rData = (await Fs.readFile(path)).toString('utf-8');
            try {
                const pasrsed = JSON.parse(rData);
                const files: Record<string, string> = pasrsed.files;
                const entrypoints: string[] = pasrsed.entrypoints;

                this.staticJS = [];
                this.staticCSS = [];

                const sliceLen = (() => {
                    let len = 0;
                    for (const point of entrypoints) {
                        for (const file in files) {
                            if (files[file].endsWith(point)) {
                                const pos = files[file].search(point);
                                len = Math.max(len, pos);
                                break;
                            }
                        }
                    }
                    return len;
                })();

                for (let file of Object.values(files)) {
                    file = file.slice(sliceLen);
                    file = file.startsWith('/') ? file.slice(1) : file.startsWith('./') ? file.slice(2) : file;

                    if (file.endsWith('.js')) {
                        this.staticJS.push(file);
                    } else if (file.endsWith('.css')) {
                        this.staticCSS.push(file);
                    } else if (file.endsWith('.map')) {
                        this.staticMaps.push(file);
                    } else if (file.includes('/media/')) {
                        this.staticMedia.push(file);
                    }
                }

                console.log(`asset-manifest loaded ${Object.values(files).length} files`);
            } catch (e) {
                console.log('Failed parsing asset-manifest', e.message);
            }
        } catch (e) {
            console.log('Failed to load asset-manifest.json', e?.message || e);
        }
    }

    protected async Step_StartDownload_JS() {
        STEP_ASK && (await Readline.question(`[Step_StartDownload_JS] Press [Enter] to continue...`));

        // WORK [JS]
        const resJS = await this.loader.DownloadChunkProcess({
            files: this.staticJS,
            subPathForExistFiles: `${this.resourcePath}/js`,
            filesTitle: 'JS',
            skipExistFiles: this.forceDownload,
            cbReplacer: true,
        });

        await this.tryGetWPName();

        await this.loader.BeautifyAllFilesProcess({ folderType: 'js', filesTitle: 'JS', files: resJS.filesList });
        if (resJS.ripFiles.length > 0) {
            console.log(`Failed load [${resJS.ripFiles.length}] JS files!`, resJS.ripFiles);
        }
        console.log('\n----');

        if (!this.skipMap) {
            const resJSmap = await this.loader.DownloadChunkProcess({
                files: this.staticJS,
                subPathForExistFiles: `${this.resourcePath}/js`,
                filesTitle: 'JS [MAP]',
                isMap: true,
                cbReplacer: true,
            });
            await this.loader.UnpackAllSource({ filesTitle: 'JS [MAP]', files: resJSmap.filesList });
        }
        return resJS;
    }

    protected async tryGetWPName() {
        if (this.wpName) {
            return;
        }
        try {
            // const wpRegex = /.?(?:window\.(.*)) ?= ?window/i;
            // const wpRegex = /.?(?:(this|window)\.(.*)) ?= ?(this|window)\.(.*)\|\|\[\]/i;
            const regWPName = (e = '') => `(this|window)(\\.|\\[")(?<wpName${e}>.*)("\\])?`;
            const wpRegex = new RegExp(`.?(${regWPName()}) ?= ?(${regWPName('2')}) ?\\|\\| ?\\[\\]`, 'i');

            const folder_type = 'js';
            const filesPath = Path.resolve(this.rootPath, <string>this.resourcePath, folder_type);
            const files = await Fs.readdir(filesPath);
            for (let file of files) {
                const filePath = Path.resolve(filesPath, file);
                const fileContent = (await Fs.readFile(filePath)).toString();
                if (wpRegex.test(fileContent)) {
                    let { 1: wpName } = fileContent.match(wpRegex);
                    wpName = wpName.trim();
                    if (wpName.length < 100) {
                        this.wpName = wpName;
                        console.log('Found wpName: ', wpName);
                        return;
                    }
                }
            }
        } catch (error) {
            console.log('Fail: Could not extract a name.', error);
        }
    }

    protected async Step_StartDownload_CSS() {
        STEP_ASK && (await Readline.question(`[Step_StartDownload_CSS] Press [Enter] to continue...`));

        // WORK [CSS]
        const resCSS = await this.loader.DownloadChunkProcess({
            files: this.staticCSS,
            subPathForExistFiles: `${this.resourcePath}/css`,
            filesTitle: 'CSS',
            skipExistFiles: this.forceDownload,
            // cbReplacer: true,
        });
        await this.loader.BeautifyAllFilesProcess({
            folderType: 'css',
            filesTitle: 'CSS',
            files: resCSS.filesList,
        });
        if (resCSS.ripFiles.length > 0) {
            console.log(`Failed load [${resCSS.ripFiles.length}] CSS files!`);
        }
        console.log('\n----');

        if (!this.skipMap) {
            const resCSSmap = await this.loader.DownloadChunkProcess({
                files: this.staticCSS,
                subPathForExistFiles: `${this.resourcePath}/css`,
                filesTitle: 'CSS [MAP]',
                isMap: true,
                cbReplacer: true,
            });
            await this.loader.UnpackAllSource({
                filesTitle: 'CSS [MAP]',
                files: resCSSmap.filesList,
                split: 'temp/react',
            });
        }
        return resCSS;
    }

    protected async Step_StartDownload_Media({
        resJS,
        resCSS,
    }: {
        resJS: IDownloadProcessResult;
        resCSS: IDownloadProcessResult;
    }) {
        STEP_ASK && (await Readline.question(`[Step_StartDownload_Media] Press [Enter] to continue...`));

        let listMedia: string[] = [];
        const { exports, mediaFiles } = await this.loader.ImportModulesAndGetExports(resJS.filesList, this.wpName, 80);

        for (const file of resCSS.filesList) {
            try {
                const fileContent = (await Fs.readFile(Path.resolve(this.rootPath, file))).toString();
                listMedia.push(...this.loader.parseMediaFromCss(fileContent));
            } catch (error) {
                console.log('[Error] Media. Failed read file', file);
            }
        }

        listMedia.push(
            ...exports
                .filter(
                    ({ exports: e }) =>
                        typeof e === 'string' &&
                        !e.startsWith('data:image') &&
                        e.includes(`${this.resourcePath}/media/`),
                )
                .map(({ exports }) => exports),
        );

        listMedia.push(...mediaFiles);
        listMedia.push(...this.staticMedia);

        listMedia = listMedia.filter((val, i, self) => self.indexOf(val) === i);

        // console.log(listMedia);

        // Downloading media files
        const resMedia = await this.loader.DownloadFilesProcess({
            files: listMedia,
            subPathForExistFiles: `${this.resourcePath}/media`,
            filesTitle: 'Media',
            skipExistFiles: !this.forceDownload,
        });
        if (resMedia.ripFiles.length > 0) {
            console.log(`Failed load [${resMedia.ripFiles.length}] Media files!`, resMedia.ripFiles);
        }
        // ...
    }

    protected async Step_ToGit() {
        STEP_ASK && (await Readline.question(`[Step_ToGit#Start] Press [Enter] to continue...`));
        // !STEP_ASK && (await Readline.question(`[GIT] Press [Enter] to start commits...`));

        const gitPath = Path.resolve(this.rootPath, '../togit/');
        const tg = new ToGit(this.config.GIT as xConfig<typeof configSchema.GIT>);
        let isGIT = await tg.init({
            path: gitPath,
            name: this.name,
            silent: false,
            isSubGit: true,
            ignoreNodeModules: true,
            useOnlyLocal: !this.togit,
        });
        let diffs;

        if (isGIT !== true) {
            tg.log('Failed use it.');
            return;
        }

        let commitName = ComName();

        // STEP_ASK && await Readline.question(`[Step_ToGit#Cleaning] Press [Enter] to continue...`);
        // // Cleaning
        // const existGitFiles = await Fs.readdir(gitPath);
        // for (const fileName of existGitFiles) {
        //     if (
        //         !fileName.startsWith('.git') &&
        //         !['public', 'source', 'unpack', 'README.md', 'info.json'].includes(fileName)
        //     ) {
        //         console.log('Fs.remove fileName', fileName);
        //         await Fs.remove(Path.resolve(gitPath, fileName));
        //     }
        // }

        diffs = await tg.diff();
        if (diffs.changed > 0) {
            tg.log('(🧹-CLEANING) Diff result:', diffs.text);
            STEP_ASK && (await Readline.question(`[Step_ToGit#CommitCLEANING] Press [Enter] to continue...`));
            await tg.commit(`chore(🧹): clean up old files [${commitName}]`);
        }

        STEP_ASK && (await Readline.question(`[Step_ToGit#CreateInfos] Press [Enter] to continue...`));
        // Create info.json
        await Fs.writeFile(
            Path.resolve(gitPath, 'info.json'),
            JSON.stringify({ name: this.name, url: this.url }, null, 2),
        );
        await Fs.writeFile(
            Path.resolve(gitPath, 'README.md'),
            `# bwLoader - ${this.name}\n\n> URL: ${this.url}\n\nThis repository is automatically generated by [@xTCry/bwLoader](https://github.com/xTCry/bwLoader)`,
        );

        STEP_ASK && (await Readline.question(`[Step_ToGit#CacheToGit] Press [Enter] to continue...`));
        await Fs.ensureDir(Path.resolve(gitPath, 'public'));
        await this.loader.CacheToGit(Path.resolve(gitPath, 'public'));

        diffs = await tg.diff();
        tg.log('(🍊-PUBLIC) Diff result:', diffs.text);
        STEP_ASK && (await Readline.question(`[Step_ToGit#CommitPUBLIC] Press [Enter] to continue...`));
        await tg.commit(`feat(🍊): public up [${commitName}]`);

        let issetSource = await this.loader.CopyFolderToGit(
            Path.resolve(this.rootPath, '_safe'),
            Path.resolve(gitPath, 'unpack'),
        );
        if (issetSource) {
            diffs = await tg.diff();
            tg.log('(🍏-SOURCE) Diff result:', diffs.text);
            STEP_ASK && (await Readline.question(`[Step_ToGit#CommitSOURCE] Press [Enter] to continue...`));
            await tg.commit(`feat(🍏): source up [${commitName}]`);
        }

        STEP_ASK && (await Readline.question(`[Step_ToGit#Push] Press [Enter] to continue...`));
        // !STEP_ASK && (await Readline.question(`[GIT] Press [Enter] to push...`));
        await tg.push();
    }
}
