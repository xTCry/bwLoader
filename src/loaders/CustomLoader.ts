import Path from 'path';
import Fs from 'fs-extra';
import { html as beautifyHTML } from 'js-beautify';

import { configSchema } from '../config';
import { ComName, xConfig } from '../tools';

import LoaderClass from './LoaderClass';
import { getMe } from '../AppReader';
import AppLoader from '../AppLoader';
import ToGit from '../ToGit';
import Readline from '../readline';

const STEP_ASK = true;

export default class CustomLoader extends LoaderClass {
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
        STEP_ASK && await Readline.question(`[Step_LoadApp] Press [Enter] to continue...`);

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
        STEP_ASK && await Readline.question(`[Step_InitAppLoader] Press [Enter] to continue...`);

        let dURL = this.url;

        if (dURL.includes('index.html')) {
            dURL = dURL.slice(0, dURL.indexOf('index.html'));
        }

        this.loader = new AppLoader(dURL, this.resourcePath as string, this.rootPath);
        await this.loader.init();
    }

    protected async Step_PrepareArea() {
        STEP_ASK && await Readline.question(`[Step_PrepareArea] Press [Enter] to continue...`);

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
        STEP_ASK && await Readline.question(`[Step_StartDownload] Press [Enter] to continue...`);

        await this.Step_StartDownload_Index();
        const resJS = await this.Step_StartDownload_JS();
        await this.Step_StartDownload_CSS();
        return { resJS };
    }

    protected async Step_StartDownload_Index() {
        STEP_ASK && await Readline.question(`[Step_StartDownload_Index] Press [Enter] to continue...`);

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
            console.log('Failed to load index.html', e.message);
            // console.error(e);
        }
    }

    protected async Step_StartDownload_JS() {
        STEP_ASK && await Readline.question(`[Step_StartDownload_JS] Press [Enter] to continue...`);

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
        if (resJS.ripCount > 0) console.log(`Failed load [${resJS.ripCount}] JS files!`, resJS.ripFiles);
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
            // const wpRegex = /.?(?:window\.(.*)) ?= ?window/i;
            // const wpRegex = /.?(?:(this|window)\.(.*)) ?= ?(this|window)\.(.*)\|\|\[\]/i;
            const regWPName = (e = '') => `(this|window)(\\.|\\[")(?<wpName${e}>.*)("\\])?`;
            const wpRegex = new RegExp(`.?(${regWPName()}) ?= ?(${regWPName('2')}) ?\\|\\| ?\\[\\]`, 'i');

            const folder_type = 'js';
            let filesList = await Fs.readdir(this.rootPath + this.resourcePath + folder_type + '/');
            for (let fileName of filesList) {
                const file = `${this.rootPath + this.resourcePath + folder_type}/${fileName}`;
                const codeString = (await Fs.readFile(file)).toString();
                if (wpRegex.test(codeString)) {
                    let { 1: wpName } = codeString.match(wpRegex);
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
        STEP_ASK && await Readline.question(`[Step_StartDownload_CSS] Press [Enter] to continue...`);

        // WORK [CSS]
        const resCSS = await this.loader.DownloadChunkProcess(this.listCSS, 'css', 'CSS', this.forceDownload);
        await this.loader.BeautifyAllFilesProcess('css', 'CSS', resCSS.filesList);
        if (resCSS.ripCount > 0) console.log(`Failed load [${resCSS.ripCount}] CSS files!`);
        console.log('\n----');

        const resCSSmap = await this.loader.DownloadChunkProcess(this.listCSS, 'css', 'CSS [MAP]', true, true);
        await this.loader.UnpackAllSource('css', 'CSS [MAP]', resCSSmap.filesList, undefined, 'temp/react');
    }

    protected async Step_StartDownload_Media(resJS) {
        STEP_ASK && await Readline.question(`[Step_StartDownload_Media] Press [Enter] to continue...`);

        const { exports: exportedModules, mediaFiles } = await this.loader.ExportModulesFiles(
            resJS.filesList,
            this.wpName,
            80
        );

        let listMedia = exportedModules
            .filter(
                ({ exports }) =>
                    exports.startsWith(`${this.staticName}/media/`) || exports.startsWith(`/${this.staticName}/media/`)
            )
            .map(({ exports }) => Path.basename(exports));

        listMedia.push(...mediaFiles);
        listMedia = listMedia.filter((val, i, self) => self.indexOf(val) === i);

        // Downloading media files
        const resMedia = await this.loader.DownloadFilesProcess(
            listMedia,
            `${this.staticName}/media`,
            'Media',
            this.forceDownload
        );
        if (resMedia.ripCount > 0) {
            console.log(`Failed load [${resMedia.ripCount}] Media files!`, resMedia.ripFiles);
        }
        // ...
    }

    protected async Step_ToGit() {
        STEP_ASK && await Readline.question(`[Step_ToGit#Start] Press [Enter] to continue...`);

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
            STEP_ASK && await Readline.question(`[Step_ToGit#CommitCLEANING] Press [Enter] to continue...`);
            await tg.commit(`chore(🧹): clean up old files [${commitName}]`);
        }

        STEP_ASK && await Readline.question(`[Step_ToGit#CreateInfos] Press [Enter] to continue...`);
        // Create info.json
        await Fs.writeFile(
            Path.resolve(gitPath, 'info.json'),
            JSON.stringify({ name: this.name, url: this.url }, null, 2)
        );
        await Fs.writeFile(
            Path.resolve(gitPath, 'README.md'),
            `# bwLoader - ${this.name}\n\n> URL: ${this.url}\n\nThis repository is automatically generated by [@xTCry/bwLoader](https://github.com/xTCry/bwLoader)`
        );

        STEP_ASK && await Readline.question(`[Step_ToGit#CacheToGit] Press [Enter] to continue...`);
        await Fs.ensureDir(Path.resolve(gitPath, 'public'));
        await this.loader.CacheToGit(Path.resolve(gitPath, 'public'));

        diffs = await tg.diff();
        tg.log('(🍊-PUBLIC) Diff result:', diffs.text);
        STEP_ASK && await Readline.question(`[Step_ToGit#CommitPUBLIC] Press [Enter] to continue...`);
        await tg.commit(`feat(🍊): public up [${commitName}]`);

        let issetSource = await this.loader.CopyFolderToGit(
            Path.resolve(this.rootPath, '_safe'),
            Path.resolve(gitPath, 'unpack')
        );
        if (issetSource) {
            diffs = await tg.diff();
            tg.log('(🍏-SOURCE) Diff result:', diffs.text);
            STEP_ASK && await Readline.question(`[Step_ToGit#CommitSOURCE] Press [Enter] to continue...`);
            await tg.commit(`feat(🍏): source up [${commitName}]`);
        }

        STEP_ASK && await Readline.question(`[Step_ToGit#Push] Press [Enter] to continue...`);
        !STEP_ASK && await Readline.question(`[GIT] Press [Enter] to push...`);
        await tg.push();
    }
}
