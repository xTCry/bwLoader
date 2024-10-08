import AppLoader from '../AppLoader';
import { configSchema } from '../config';

export default abstract class Loader {
    public loader: AppLoader;

    public rootPath: string;

    public name: string;
    public url: string;
    public resourcePath?: string | boolean;
    public wpName?: string;
    public togit?: boolean;
    public skipMap?: boolean;

    public forceDownload: boolean;
    public clearCache: boolean;
    public tryAssetManifest: boolean;
    public useExistsIndexHtml: boolean;
    public useWPA: boolean;
    public useExistsFiles: boolean;
    public headers: Record<string, string>;

    public delimChar?: string;
    public staticName?: string;
    public staticJS: string[] = [];
    public staticCSS: string[] = [];
    public otherJS: string[] = [];
    public staticMedia: string[] = [];
    public otherCSS: string[] = [];
    public additionalStatic: { js?: string[]; css?: string[] } = {};

    constructor(public config: typeof configSchema) {}

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
        skipMap = false,
        forceDownload = true,
        clearCache = true,
        tryAssetManifest = false,
        useExistsIndexHtml = false,
        useWPA = true,
        useExistsFiles = false,
        headers = {},
        additionalStatic = {},
    }: {
        name: string;
        url: string;
        resourcePath?: string | boolean;
        wpName?: string;
        togit?: boolean;
        skipMap?: boolean;
        forceDownload?: boolean;
        clearCache?: boolean;
        tryAssetManifest?: boolean;
        useExistsIndexHtml?: boolean;
        useWPA?: boolean;
        useExistsFiles?: boolean;
        headers?: Record<string, string>;
        additionalStatic?: { js?: string[]; css?: string[] };
    }) {
        this.rootPath = `${this.config.PATH_DOWNLOAD}/${name}/app/`;

        this.name = name;
        this.url = url;
        this.resourcePath = ((e) => (typeof e === 'string' ? (e.startsWith('/') ? `.${e}` : e) : e))(resourcePath);
        this.wpName = wpName;
        this.togit = togit;
        this.skipMap = skipMap;

        this.forceDownload = forceDownload;
        this.clearCache = clearCache;
        this.tryAssetManifest = tryAssetManifest;
        this.useExistsIndexHtml = useExistsIndexHtml;
        this.useWPA = useWPA;
        this.useExistsFiles = useExistsFiles;
        this.headers = headers;
        this.additionalStatic = additionalStatic;

        console.log(`\n\n==================================\nApplication loader initialized for: ${name}`);
    }

    public abstract Start(): Promise<any>;
    protected abstract Step_LoadApp(): Promise<any>;
    protected abstract Step_InitAppLoader(): Promise<any>;
    protected abstract Step_PrepareArea(): Promise<any>;
    protected abstract Step_StartDownload(): Promise<{ resJS: any }>;
    protected abstract Step_ToGit(): Promise<any>;
}
