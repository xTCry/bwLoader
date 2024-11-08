import 'dotenv/config';
import convict from 'convict';
import Fs from 'fs-extra';
import { parse } from 'comment-json';

const configPathFile = './config.json';
const appsPathFile = './apps.jsonc';
const forceGIT = false;

export const configSchema = {
    WATCHDOG: {
        doc: 'Time in seconds for the watchdog to trigger',
        env: 'WATCHDOG',
        default: null,
        format(val) {
            // ...
        },
        coerce: function (val) {
            return parseInt(val, 10);
        },
    },
    PATH_DOWNLOAD: {
        doc: 'The path to the downloads',
        default: 'downloaded',
        env: 'PATH_DOWNLOAD',
        format(val) {
            if (val.length < 1) {
                throw new Error('short path');
            }
        },
    },
    GIT: {
        GIT_URI: {
            doc: 'URI git site. [Example: https://api.github.com/]',
            default: 'https://api.github.com/',
            env: 'GIT_URI',
            format(val) {
                if (!val.startsWith('http')) {
                    throw new Error('wrong uri');
                }
            },
        },
        GIT_SSH: {
            doc: 'SSH URL. [Example: git@git.my.domain:22]',
            default: '',
            env: 'GIT_SSH',
        },
        GIT_TOKEN: {
            doc: 'GIT Token',
            default: '',
            env: 'GIT_TOKEN',
            format(val) {
                if (!/^[a-fA-F0-9]{40}$/.test(val) && forceGIT) {
                    throw new Error('Must be a 40 characters');
                }
            },
        },
        GIT_LOGIN: {
            doc: 'Git user Login.',
            default: '',
            env: 'GIT_LOGIN',
            format(val) {
                if (val.length < 1 && forceGIT) {
                    throw new Error('wrong login');
                }
            },
        },
        GIT_PASSWD: {
            doc: 'Git user Password.',
            default: '',
            env: 'GIT_PASSWD',
            format(val) {
                if (val.length < 6 && forceGIT) {
                    throw new Error('short password');
                }
            },
        },
        GIT_ORG: {
            doc: 'Git organization name or not',
            default: '',
            env: 'GIT_ORG',
            format(val) {
                if (!/^[A-Za-z0-9]+$/.test(val) && forceGIT) {
                    throw new Error('Wrong organization name');
                }
            },
        },
    },
};

export const appsSchema = {
    apps: {
        doc: 'Array downloading apps',
        format: 'source-array',
        default: [
            {
                name: 'AppName',
                url: 'YOUR_URL',
                togit: true,
                loader: 'CustomLoader',
                skip: false,
                resourcePath: undefined,
                wpName: undefined,
            },
        ],
        children: {
            name: {
                doc: 'App name',
                format: String,
                default: null,
            },
            url: {
                doc: 'The source URL',
                format: 'url',
                default: null,
            },
            togit: {
                format: 'Boolean',
                default: true,
            },
            skipMap: {
                format: 'Boolean',
                default: false,
            },
            loader: {
                doc: 'Loader type',
                format: ['CustomLoader'],
                default: 'CustomLoader',
            },
            skip: {
                format: 'Boolean',
                default: false,
            },
            tryAssetManifest: {
                format: 'Boolean',
                default: false,
            },
            additionalStatic: {
                format: 'Object',
                default: {},
                children: {
                    js: {
                        format: 'array',
                        default: null,
                        children: {
                            format: 'String',
                        },
                    },
                    css: {
                        format: 'array',
                        default: null,
                        children: {
                            format: 'String',
                        },
                    },
                },
            },
            useExistsIndexHtml: {
                format: 'Boolean',
                default: false,
            },
            useWPA: {
                format: 'Boolean',
                default: true,
            },
            useExistsFiles: {
                format: 'Boolean',
                default: false,
            },
            headers: {
                format: 'Object',
                default: {},
            },
            resourcePath: {
                format(val) {},
                default: undefined,
            },
            wpName: {
                format: String,
                default: undefined,
            },
        },
    },
};

convict.addFormat({
    name: 'source-array',
    // @ts-ignore
    validate: function (sources, schema) {
        if (!Array.isArray(sources)) {
            throw new Error('must be of type Array');
        }

        for (let i in sources) {
            sources[i] = convict(schema.children).load(sources[i]).validate().get();
        }
    },
});

convict.addFormat(require('convict-format-with-validator').url);

convict.addParser({
    parse: (str) => JSON.parse(JSON.stringify(parse(str))),
    extension: 'jsonc',
});

export const config = convict(configSchema);
export const apps = convict(appsSchema);

export const loadConfig = () => {
    for (const { pathFile, conv } of [
        { pathFile: configPathFile, conv: config },
        { pathFile: appsPathFile, conv: apps },
    ]) {
        if (!Fs.existsSync(pathFile)) {
            console.log(`Created new config file "${pathFile}"`);
            Fs.outputFileSync(pathFile, conv.toString());
        }

        // @ts-ignore
        conv.loadFile(pathFile).validate();
    }
};

loadConfig();
