import { scrapeDisco } from './scrapers/disco';

(async () => {
  try {
    const results = await scrapeDisco('banana');
    console.log(results.slice(0, 5));
  } catch (error) {
    console.error('[disco] test failed', error);
    process.exitCode = 1;
  }
})();
