import Path from 'path';
import Fs from 'fs-extra';
import gitP from 'simple-git/promise';
import Axios, { Method } from 'axios';
import gradient from 'gradient-string';
import { GitConfig, GitServerResponse } from './tools';

class GiteaAPI {
    public config: GitConfig;

    constructor(config: GitConfig) {
        this.config = config;
    }

    public async get(methodName: string, data?: any) {
        return await this.api('GET', methodName, data);
    }

    public async post(methodName: string, data?: any) {
        return await this.api('POST', methodName, data);
    }

    public async api(method: Method, methodName: string, data?: any) {
        const uri = this.config.GIT_URI + methodName;
        try {
            const { data: response } = await Axios.request<GitServerResponse>({
                url: uri,
                method,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    Authorization: 'bearer ' + this.config.GIT_TOKEN,
                },
                data,
                responseType: 'json',
            });
            return { response };
        } catch ({ response }) {
            return { error: { code: response.status, msg: response.data.message, uri } };
        }
    }
}

export default class ToGIT {
    public config: GitConfig;
    public api: GiteaAPI;

    public name: string;
    public path: string;
    public silent: boolean;
    public useOnlyLocal: boolean;
    public git: gitP.SimpleGit;

    constructor(config: GitConfig) {
        this.config = {
            GIT_TOKEN: null,
            GIT_PASSWD: null,
            GIT_LOGIN: null,
            GIT_URI: null,
            GIT_ORG: null,
            GIT_SSH: null,
            ...config,
        };

        this.api = new GiteaAPI(config);
    }

    public log(...args) {
        console.log(gradient.retro('[GIT]'), ...args);
    }

    public logz(...args) {
        !this.silent && this.log(...args);
    }

    public async init({
        path,
        name,
        silent = true,
        isSubGit = true,
        ignoreNodeModules = false,
        useOnlyLocal = false,
    }: {
        path: string;
        name: string;
        silent?: boolean;
        isSubGit?: boolean;
        ignoreNodeModules?: boolean;
        useOnlyLocal?: boolean;
    }) {
        this.path = path;
        this.name = name;
        this.silent = silent;
        this.useOnlyLocal =
            useOnlyLocal || !this.config.GIT_URI || /* !this.config.GIT_PASSWD ||  */ !this.config.GIT_TOKEN;

        if (!Fs.existsSync(path)) await Fs.mkdirp(path);

        this.git = gitP(path);
        const reposIsset = await this.checkIsRepo(!isSubGit);

        if (useOnlyLocal) {
            if (!reposIsset) {
                await this.git.init();
                this.logz('Local repo init [done]');
            } else {
                this.logz('Repo exits');
            }
        } else if (!reposIsset) {
            this.logz('Repo not exits');

            const resultNewRep = await this.createNewRep();
            if (resultNewRep !== true) {
                return resultNewRep;
            }
        } else {
            this.logz('Repo exits');
        }

        if (ignoreNodeModules) {
            // await this.git.rmKeepLocal(['-r', 'node_modules']);
            await this._vjuhGitIgnore();
        }

        return true;
    }

    public async createNewRep(noClone: boolean = false) {
        let clone_url = '';
        let isClone = false;
        const res = await this.createRepo(this.name);
        this.logz('1<', res);

        if (res.error) {
            // The repository with the same name already exists.
            // Trying load exist repository
            if (res.error.code == 409) {
                const res2 = await this.getRepo(this.config.GIT_LOGIN, this.name);
                // this.flog("2<", res2);

                // Return error object
                if (res2.error) {
                    return res2;
                } else {
                    isClone = true;
                    clone_url = res2.response.clone_url;
                    this.logz('Loading exist repo');
                }
            } else {
                // Return error object.
                return res;
            }
        } else {
            this.logz('Has been created new repo');
            if (res.response) {
                this.log(`Link: ${res.response.html_url}`);
            }
            clone_url = res.response.clone_url;
        }

        const address = `https://${this.config.GIT_LOGIN}:${this.config.GIT_PASSWD}@${clone_url.replace(/^http(s)?:\/\//i, '')}`;
        // this.log('Repo address', address);

        // const address2 = !clone_url.startsWith('http')
        //     ? clone_url
        //     : `ssh://${this.config.GIT_LOGIN}:${this.config.GIT_PASSWD}@${this.config.GIT_SSH}${
        //           clone_url.replace(/^http(s)?:\/\//i, '').split('/')[1]
        //       }`;

        try {
            if (!noClone && isClone) {
                await this.git.clone(address, this.path);
                this.logz('Repo clone [done]');
            } else {
                await this.initRepo(address);
                this.logz('Repo init [done]');
            }
        } catch (e) {
            !this.silent && console.error(e);
            return false;
        }

        return true;
    }

    public async checkIsRepo(safe = false) {
        if (safe) {
            return await this.git.checkIsRepo();
        } else {
            return Fs.existsSync(Path.resolve(this.path, '.git'));
        }
    }

    public async initRepo(address: string) {
        await this.git.init();
        await this.git.addRemote('origin', address);
    }

    public async createRepo(name: string = 'Test-API-repos') {
        const sub = this.config.GIT_ORG.length > 0 ? 'org/' + this.config.GIT_ORG : 'user';
        const res = await this.api.post(sub + '/repos', {
            name,
            // description: "",
            private: true,
            // auto_init: true,
            // gitignores: "node",
            // license: "MIT",
            // readme: ""
        });
        return res;
    }

    public async getRepo(owner: string, repo: string) {
        owner = this.config.GIT_ORG || owner;
        const res = await this.api.get(`repos/${owner}/${repo}`);
        return res;
    }

    public async fetch() {
        try {
            return await this.git.fetch();
        } catch (error) {
            throw error;
        }
    }

    public async pull() {
        await this.git.pull('origin', 'master');
    }

    public async diff() {
        await this.fetch();
        const res = await this.git.diffSummary({});
        const text = `Insertions: ${res.insertions}; Dels: ${res.deletions}; Changed: ${res.changed}.`;
        return { ...res, text };
    }

    public async commit(commitName: string = 'first commit') {
        await this.git.add('./*');
        await this.git.commit(commitName);
    }

    private async _vjuhGitIgnore() {
        const path = Path.resolve(this.path, '.gitignore');

        if (await Fs.pathExists(path)) {
            const data = await Fs.readFile(path);
            if (!data.includes('node_modules')) {
                await Fs.appendFile(path, '\nnode_modules/');
            }
        } else {
            await Fs.writeFile(path, '# Ignore node modules folder\nnode_modules/');
        }
        this.logz('[Safe] make .gitignore');
    }

    public async push() {
        if (this.useOnlyLocal) {
            return;
        }

        try {
            // @ts-ignore
            await this.git.push('origin', 'master', {}, (err: any, data: any) => {
                this.logz('Push result: ', data);
            });
        } catch (error) {
            console.log('error.message', error.message);

            if (error.message.includes('Could not read from remote repository')) {
                const resultNewRep = await this.createNewRep(true);
                if (resultNewRep === true) {
                    await this.push();
                }
            }
        }

        this.logz('Push done');
    }
}
