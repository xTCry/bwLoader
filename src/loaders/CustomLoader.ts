import Path from 'path';
import Fs from 'fs-extra';
import { html as beautifyHTML } from 'js-beautify';

import { configSchema } from '../config';
import { ComName, xConfig } from '../tools';

import LoaderClass from './LoaderClass';
import { getMe } from '../AppReader';
import AppLoader from '../AppLoader';
import ToGit from '../ToGit';

export default class CustomLoader extends LoaderClass {
    constructor(config) {
        super(config);
    }

    public async Start() {
        await this.Step_LoadApp();
        await this.Step_InitAppLoader();
        await this.Step_PrepareArea();
        const { resJS } = await this.Step_StartDownload();
        await this.Step_StartDownload_Media(resJS);
        await this.Step_ToGit();

        console.log('\n----\nFinish.');
    }

    protected async Step_LoadApp() {
        // Load site modules
        const appDataS = await getMe(this.url);
        let {
            static: { js: listJS, css: listCSS },
            staticName,
        } = appDataS;

        this.staticName = staticName;
        this.listJS = listJS;
        this.listCSS = listCSS;

        if (this.resourcePath === true) {
            this.resourcePath = staticName;
        }
    }

    protected async Step_InitAppLoader() {
        let dURL = this.url;

        if (dURL.includes('index.html')) {
            dURL = dURL.slice(0, dURL.indexOf('index.html'));
        }

        this.loader = new AppLoader(dURL, this.resourcePath as string, this.rootPath);
        await this.loader.init();
    }

    protected async Step_PrepareArea() {
        // Cleaning
        const existOldFiles = await Fs.readdir(this.rootPath);
        for (const fileName of existOldFiles) {
            if (fileName != '.git') {
                await Fs.remove(this.rootPath + fileName);
            }
        }

        // Clear cache if need...
        if (this.clearCache) {
            console.log('Clear all files...');
            await Fs.remove(this.rootPath);
        }

        // Create folders
        for await (let el of ['js', 'css', 'media'].map((el) => this.rootPath + this.resourcePath + el)) {
            await Fs.mkdirp(el);
        }
    }

    protected async Step_StartDownload() {
        await this.Step_StartDownload_Index();
        const resJS = await this.Step_StartDownload_JS();
        await this.Step_StartDownload_CSS();
        return { resJS };
    }

    protected async Step_StartDownload_Index() {
        let dURL = this.url.includes('index.html') ? this.url.slice(0, this.url.indexOf('index.html')) : this.url;
        
        try {
            const file = 'index.html';
            await this.loader.downloadFile(`${dURL}/${file}`, file, this.rootPath);

            const path = Path.resolve(this.rootPath, file);
            const rData = await Fs.readFile(path);
            const data = beautifyHTML(rData.toString(), {
                indent_with_tabs: true,
                space_in_empty_paren: true,
            });
            await Fs.writeFile(path, data);
        } catch (e) {
            console.log('Failed to load index.html');
            // console.error(e);
        }
    }

    protected async Step_StartDownload_JS() {
        // WORK [JS]
        const resJS = await this.loader.DownloadChunkProcess(
            this.listJS,
            'js',
            'JS',
            this.forceDownload,
            false,
            undefined,
            true
        );

        await this.tryGetWPName();

        await this.loader.BeautifyAllFilesProcess('js', 'JS', resJS.filesList);
        if (resJS.ripCount > 0) console.log('Failed load [' + resJS.ripCount + '] JS files!', resJS.ripFiles);
        console.log('\n----');

        const resJSmap = await this.loader.DownloadChunkProcess(this.listJS, 'js', 'JS [MAP]', true, true);
        await this.loader.UnpackAllSource('js', 'JS [MAP]', resJSmap.filesList);
        return resJS;
    }

    protected async tryGetWPName() {
        if (this.wpName) {
            return;
        }
        try {
            const wpRegex = /.?(?:window\.(.*)) ?= ?window/i;
            const folder_type = 'js';
            let filesList = await Fs.readdir(this.rootPath + this.resourcePath + folder_type + '/');
            for (let fileName of filesList) {
                const file = this.rootPath + this.resourcePath + folder_type + '/' + fileName;
                const codeString = (await Fs.readFile(file)).toString();
                if (wpRegex.test(codeString)) {
                    let { 1: wpName } = codeString.match(wpRegex);
                    wpName = wpName.trim();
                    if (wpName.length) {
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
        // WORK [CSS]
        const resCSS = await this.loader.DownloadChunkProcess(this.listCSS, 'css', 'CSS', this.forceDownload);
        await this.loader.BeautifyAllFilesProcess('css', 'CSS', resCSS.filesList);
        if (resCSS.ripCount > 0) console.log('Failed load [' + resCSS.ripCount + '] CSS files!');
        console.log('\n----');

        const resCSSmap = await this.loader.DownloadChunkProcess(this.listCSS, 'css', 'CSS [MAP]', true, true);
        await this.loader.UnpackAllSource('css', 'CSS [MAP]', resCSSmap.filesList, undefined, 'temp/react');
    }

    protected async Step_StartDownload_Media(resJS) {
        const exportedModules = await this.loader.ExportModulesFiles(resJS.filesList, this.wpName, 80);

        // Downloading media files
        const listMedia = exportedModules
            .filter(
                ({ exports }) =>
                    exports.startsWith(`${this.staticName}/media/`) || exports.startsWith(`/${this.staticName}/media/`)
            )
            .map(({ exports }) => Path.basename(exports));

        const resMedia = await this.loader.DownloadFilesProcess(
            listMedia,
            `${this.staticName}/media`,
            'Media',
            this.forceDownload
        );
        if (resMedia.ripCount > 0)
            console.log('Failed load [' + resMedia.ripCount + '] Media files!', resMedia.ripFiles);

        // ...
    }

    protected async Step_ToGit() {
        const tg = new ToGit(this.config.GIT as xConfig<typeof configSchema.GIT>);
        let isGIT = await tg.init({
            path: Path.resolve(this.rootPath, '../togit/'),
            name: this.name,
            silent: false,
            isSubGit: true,
            ignoreNodeModules: true,
            useOnlyLocal: !this.togit,
        });

        if (isGIT !== true) {
            tg.log('Failed use it.');
            return;
        }

        let comName = ComName();
        let changedFiles = 0;

        let issetSource = await this.loader.CopySourceToGit(this.rootPath + '../togit/');
        if (issetSource) {
            let diffs = await tg.diff();
            changedFiles += diffs.changed;
            tg.log('(SOURCE) Diff result:', diffs.text);
            await tg.commit(`(SOURCE) Hellow [${comName}]`);
        }

        await this.loader.CacheToGit(this.rootPath + '../togit/');
        let diffs = await tg.diff();
        changedFiles += diffs.changed;
        tg.log('(STATIC) Diff result:', diffs.text);
        await tg.commit(`(STATIC) Hellow [${comName}]`);

        if (diffs.changed) {
            tg.log(`Commits name: [${comName}]`);
        }
        await tg.push();
    }
}
