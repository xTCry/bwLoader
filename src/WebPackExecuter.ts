import Fs from 'fs-extra';
import _Window from 'window';
import safeEval from 'safe-eval';

/* // The module cache
let __webpack_module_cache__ = {};
let moduleFactories: any[] = [];

// The require function
// function s(e)
function __webpack_require__(moduleId) {
    // Check if module is in cache
    if (__webpack_module_cache__[moduleId]) {
        return __webpack_module_cache__[moduleId].exports;
    }

    // https://github.com/webpack/webpack/blob/2f2cbe50fe9274d732346e9c47c63a944a071e8a/lib/javascript/JavascriptModulesPlugin.js#L958
    // Create a new module (and put it into the cache)
    let module = (__webpack_module_cache__[moduleId] = {
        i: moduleId,
        l: false,
        exports: {},
    });

    if (!moduleFactories[moduleId]) {
        throw new Error('Module by ID [' + moduleId + '] not init');
    }

    // Execute the module function
    moduleFactories[moduleId].call(module.exports, module, module.exports, __webpack_require__);
    // Flag the module as loaded
    module.l = true;

    // Return the exports of the module
    return module.exports;
}

// the bundle public path
__webpack_require__.publicPath = '/';

// compatibility get default export
// s.n=function(e)
__webpack_require__.compatGetDefaultExport = function (module) {
    let getter =
        module && module.__esModule
            ? function () {
                  return module['default'];
              }
            : function () {
                  return module;
              };

    __webpack_require__.definePropertyGetters(getter, 'a', getter);

    return getter;
};

// the exported property define getters function
// s.d=function(e,r,t)
__webpack_require__.definePropertyGetters = function (exports, key, definition) {
    if (!__webpack_require__.hasOwnProperty(exports, key))
        Object.defineProperty(exports, key, {
            enumerable: true,
            get: definition,
        });
};

// define __esModule on exports
// s.r=function(e)
__webpack_require__.makeNamespaceObject = function (exports) {
    if (typeof Symbol !== 'undefined' && Symbol.toStringTag) {
        Object.defineProperty(exports, Symbol.toStringTag, {
            value: 'Module',
        });
    }
    Object.defineProperty(exports, '__esModule', {
        value: true,
    });
};

// s.o=function(e,r)
__webpack_require__.hasOwnProperty = function (definition, key) {
    return Object.prototype.hasOwnProperty.call(definition, key);
};

// create a fake namespace object
// mode & 1: value is a module id, require it
// mode & 2: merge all properties of value into the ns
// mode & 4: return value when already ns object
// mode & 8|1: behave like require
// s.t=function(r,e)
__webpack_require__.createFakeNamespaceObject = function (value, mode) {
    if (mode & 1) value = this(value);
    if (mode & 8) return value;
    if (mode & 4 && typeof value === 'object' && value && value.__esModule) return value;

    let ns = Object.create(null);

    __webpack_require__.makeNamespaceObject(ns);
    Object.defineProperty(ns, 'default', {
        enumerable: true,
        value,
    });

    if (mode & 2 && typeof value != 'string') {
        for (const key in value) {
            __webpack_require__.definePropertyGetters(
                ns,
                key,
                function (e) {
                    return value[e];
                }.bind(null, key)
            );
        }
    }

    return ns;
};
// . */

export default class WebPackExecuter {
    private window: _Window;

    private moduleFactories: any[] = [];
    private __webpack_module_cache__: any;
    private chunkLoadingGlobal: any[];
    private installedChunks: any;
    private deferredModules: any[];

    private parentChunkLoadingFunction: typeof Array.prototype.push;

    constructor({
        modules = [],
        nameWPJ: chunkLoadingGlobalExpr = 'webpackJsonp',
    }: {
        modules?: any[];
        nameWPJ: string;
    }) {
        this.__webpack_module_cache__ = {};
        this.installedChunks = {
            /*  */
        };
        this.deferredModules = modules || [];

        this.window = new _Window({
            url: 'http://localhost',
        });

        this.chunkLoadingGlobal = this.window[chunkLoadingGlobalExpr] = this.window[chunkLoadingGlobalExpr] || [];
        this.parentChunkLoadingFunction = this.chunkLoadingGlobal.push.bind(this.chunkLoadingGlobal);
        this.chunkLoadingGlobal.push = this.webpackJsonpCallback.bind(this);
    }

    webpackJsonpCallback(data: any) {
        const [chunkIds, moreModules, executeModules] = data;

        let resolves = [];
        for (let i = 0; i < chunkIds.length; i++) {
            let chunkId = chunkIds[i];

            if (this.installedChunks[chunkId]) {
                resolves.push(this.installedChunks[chunkId][0]);
            }

            this.installedChunks[chunkId] = 0;
        }

        for (let moduleId in moreModules) {
            if (Object.prototype.hasOwnProperty.call(moreModules, moduleId)) {
                this.moduleFactories[moduleId] = moreModules[moduleId];
            }
        }

        this.parentChunkLoadingFunction(data);
        while (resolves.length) {
            resolves.shift()();
        }

        // add entry modules from loaded chunk to deferred list
        if (executeModules) {
            this.deferredModules.push.apply(this.deferredModules, executeModules || []);
        }

        // run deferred modules when all chunks ready
        // return this.checkDeferredModulesImpl()
    }

    /* checkDeferredModulesImpl() {
		for (var e, c = 0; c < this.loadedModules.length; c++) {
			let d = this.loadedModules[c],
				f = true;

			for (var a = 1; a < d.length; a++) {
				var b = d[a];
				0 !== l[b] && (f = !1)
			}

			if (f) {
				this.loadedModules.splice(c--, 1)
				e = s(s.s = d[0])
			}
		}
		return e
	} */

    /**
     * Include file to WebPack
     * @param {sting} path Patho to file
     * @param {sting} file File name
     */
    async Include(path, file) {
        const dataFile = (await Fs.readFile(path + file)).toString();
        safeEval(dataFile, {
            window: {
                ...this.window,
            },
        });
        return dataFile;
    }

    tryGetStaticFile() {
        return this.tryExecuteAll();
    }

    // If React
    tryExecuteAll() {
        const res = this.moduleFactories.map((item, moduleId) => {
            // Check if module is in cache
            if (this.__webpack_module_cache__[moduleId]) {
                return this.__webpack_module_cache__[moduleId]; //.exports;
            }

            // Create a new module (and put it into the cache)
            let module = (this.__webpack_module_cache__[moduleId] = {
                i: moduleId,
                l: false,
                exports: {},
            });

            // Execute the module function
            let threw = true;
            try {
                this.moduleFactories[moduleId].call(module.exports, module, module.exports, { p: '/' });
                module.l = true;
                threw = false;
            } catch (e) {
                // console.log(e.message);
                //
            } finally {
                if (threw) {
                    delete this.__webpack_module_cache__[moduleId];
                }
            }

            // Return the exports of the module
            // return module.exports;
            return { id: moduleId, exports: module.exports };
        });

        return res;
    }
}
