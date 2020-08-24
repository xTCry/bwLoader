import Fs from 'fs-extra';
import _Window from 'window';
import safeEval from 'safe-eval';

let modules = [];

// The module cache
let installedModules = {};

// The require function
function __webpack_require__(moduleId) {
    // Check if module is in cache
    if (installedModules[moduleId]) {
        return installedModules[moduleId].exports;
    }

    // Create a new module (and put it into the cache)
    let module = installedModules[moduleId] = {
        i: moduleId,
        l: false,
        exports: {},
    };

    if (!modules[moduleId]) {
        throw new Error('Module by ID [' + moduleId + '] not init');
    }

    // Execute the module function
    modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
    // Flag the module as loaded
    module.l = true;

    // Return the exports of the module
    return module.exports;
}

// the bundle public path
__webpack_require__.publicPath = '/';

// compatibility get default export
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
__webpack_require__.definePropertyGetters = function (exports, key, definition) {
    if (!__webpack_require__.hasOwnProperty(exports, key))
        Object.defineProperty(exports, key, {
            enumerable: true,
            get: definition,
        });
};

// define __esModule on exports
__webpack_require__.makeNamespaceObject = function (exports) {
    if(typeof Symbol !== 'undefined' && Symbol.toStringTag){
        Object.defineProperty(exports, Symbol.toStringTag, {
            value: 'Module',
        });
}
    Object.defineProperty(exports, '__esModule', {
        value: true,
    });
};

__webpack_require__.hasOwnProperty = function (definition, key) {
    return Object.prototype.hasOwnProperty.call(definition, key);
};

// create a fake namespace object
// mode & 1: value is a module id, require it
// mode & 2: merge all properties of value into the ns
// mode & 4: return value when already ns object
// mode & 8|1: behave like require
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
// .

export default class WebPackExecuter {
    private window: _Window;
    private WPJ: any[];
    private loadedModuleIDs: any;
    private loadedModules: any[];

    private WPJ_Push: typeof Array.prototype.push;

    constructor({ modules = [], nameWPJ = 'webpackJsonp' }: { modules?: any[]; nameWPJ: string }) {
        modules = modules || [];
        installedModules = {};

        this.window = new _Window({
            url: 'http://localhost',
        });
        this.WPJ = this.window[nameWPJ] = this.window[nameWPJ] || [];
        this.WPJ_Push = this.WPJ.push.bind(this.WPJ);
        this.WPJ.push = this._push.bind(this);

        this.loadedModuleIDs = {};
        this.loadedModules = [];
    }

    _push(e) {
        const moduleIDs = e[0],
            moduleObj = e[1],
            moduleZZHArray = e[2];

        let currentModuleLoad = [];

        for (let idM, i = 0; i < moduleIDs.length; i++) {
            idM = moduleIDs[i];

            if (this.loadedModuleIDs[idM]) {
                currentModuleLoad.push(this.loadedModuleIDs[idM][0]);
            }

            this.loadedModuleIDs[idM] = 0;
        }

        for (let c in moduleObj) {
            if (Object.prototype.hasOwnProperty.call(moduleObj, c)) {
                modules[c] = moduleObj[c];
            }
        }

        for (this.WPJ_Push && this.WPJ_Push(e); currentModuleLoad.length; ) {
            currentModuleLoad.shift()();
        }

        this.loadedModules.push.apply(this.loadedModules, moduleZZHArray || []);

        // return this._CCCWP()
    }

    /* _CCCWP() {
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
        const res = safeEval(dataFile, {
            window: {
                ...this.window,
            },
        });

        // console.log("Rest:", res)
        // console.log("Module load:", this.window.webpackJsonp[0])
    }

    tryGetStaticFile() {
        const res = this.tryExecuteAll();
        return res;
    }

    // If React
    tryExecuteAll() {
        const res = modules.map((item, e) => {
            if (installedModules[e]) {
                return installedModules[e]; //.exports;
            }

            let module = installedModules[e] = {
                i: e,
                l: false,
                exports: {},
            };

            try {
                modules[e].call(module.exports, module, module.exports, { p: '/' });
                module.l = true;
            } catch (e) {
                // console.log(e.message);
            }

            return { id: e, exports: module.exports };
        });

        return res;
    }
}
