import AppLoader from '../AppLoader';
import { configSchema } from '../config';

export default abstract class Loader {
    public config: typeof configSchema;
    public loader: AppLoader;

    public rootPath: string;

    public name: string;
    public url: string;
    public resourcePath?: string | boolean;
    public wpName?: string;
    public togit?: boolean;

    public forceDownload: boolean;
    public clearCache: boolean;

    public staticName?: string;
    public listJS?: any[];
    public listCSS?: any[];

    constructor(config) {
        this.config = config;
    }

    /**
     * Функция кастомной загрузки приложенеия
     * @param name Уникальное название заргужаемого пирложения
     * @param url URL для загрузки
     * @param resourcePath Путь к директории ресурсов
     * @param wpName Название переменной webpackJsonp
     */
    public Init({
        name,
        url,
        resourcePath = 'static/',
        wpName,
        togit = true,
        forceDownload = true,
        clearCache = true,
    }: {
        name: string;
        url: string;
        resourcePath?: string | boolean;
        wpName?: string;
        togit?: boolean;
        forceDownload?: boolean;
        clearCache?: boolean;
    }) {
        this.rootPath = `${this.config.PATH_DOWNLOAD}/${name}/app/`;

        this.name = name;
        this.url = url;
        this.resourcePath = resourcePath;
        this.wpName = wpName;
        this.togit = togit;

        this.forceDownload = forceDownload;
        this.clearCache = clearCache;

        console.log(`Application loader initialized for: ${name}`);
    }

    public abstract async Start();
    protected abstract async Step_LoadApp();
    protected abstract async Step_InitAppLoader();
    protected abstract async Step_PrepareArea();
    protected abstract async Step_StartDownload();
    protected abstract async Step_ToGit();
}
