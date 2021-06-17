import { config, apps, loadConfig } from './config';
import Loader, { Loaders } from './loaders';
import { sleep } from './tools';

(async () => {
    const WATCHDOG = config.get('WATCHDOG');
    const arApps = apps.get('apps');

    do {
        let startTime = Date.now();
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
            startTime = Date.now();
        }

        if (WATCHDOG) {
            let sleepMs = WATCHDOG * 1e3 - (Date.now() - startTime);
            console.log(`\n\n * Watchdog wait ${(sleepMs / 1e3) | 0} seconds...`);
            await sleep(sleepMs);
            // loadConfig(); // fix this
        }
        else {
            break;
        }
    } while (true);
    
    console.log('Exit');
})();
