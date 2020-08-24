import { config, apps } from './config';
import Loader, { Loaders } from './loaders';

(async () => {
    let arApps = apps.get('apps');
    for (let app of arApps) {
        if (app.skip) {
            continue;
        }
        if (!Loaders[app.loader]) {
            console.log(`Loader '${app.loader}' not found`);
            continue;
        }

        const cLoader = new Loaders[app.loader](config.get()) as Loader;
        cLoader.Init(app);
        try {
            await cLoader.Start();
        } catch (error) {
            console.log('App loader error', app.name, error.message);
        }
    }
})();
